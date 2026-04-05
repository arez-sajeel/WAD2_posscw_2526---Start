// services/courseService.js
//
// Business-logic service for course operations that span multiple collections.
// Controllers call these functions so they stay free of multi-step data logic.

import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { BookingModel } from "../models/bookingModel.js";

/**
 * deleteCourseCascade(courseId)
 *
 * Enforces strict data integrity by removing a course and all of its
 * dependent child documents in the correct order:
 *
 *   1. Find every session that belongs to the course.
 *   2. For each session, mark every booking that references that session
 *      as CANCELLED — this preserves booking history while preventing the
 *      application from ever resolving a booking to a session that no
 *      longer exists (orphan prevention).
 *   3. Bulk-delete all sessions for the course in a single DB call.
 *   4. Remove the parent course document last, so foreign-key-style
 *      references are never left dangling at any point during the cascade.
 *
 * Each await is chained in strict sequence deliberately: step N must
 * complete before step N+1 begins. Parallelising across steps would risk
 * deleting sessions before their bookings are cancelled, leaving bookings
 * that reference non-existent sessions.
 */
export async function deleteCourseCascade(courseId) {
  // ── Step 1: Verify the parent exists before doing anything ───────────────
  const course = await CourseModel.findById(courseId);
  if (!course) {
    const err = new Error("Course not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  // ── Step 2: Collect all child sessions for this course ───────────────────
  // WAD2 query pattern: db.find({ courseId }) — exact field match
  const sessions = await SessionModel.listByCourse(courseId);

  // ── Step 3: Cancel every booking that references any of those sessions ───
  // For each session, find all non-cancelled bookings whose sessionIds array
  // contains that session's _id, then mark them CANCELLED.
  // Chained with await so session bookings are updated BEFORE sessions are
  // deleted — prevents orphaned bookings pointing at deleted sessions.
  for (const session of sessions) {
    // WAD2 query pattern: db.find({ field: value }) — exact match on sessionIds
    const affectedBookings = await BookingModel.list({
      sessionIds: session._id,
      status: { $nin: ["CANCELLED"] },
    });

    for (const booking of affectedBookings) {
      // Use updateById (not cancel) so we can record why it was cancelled
      await BookingModel.updateById(booking._id, {
        status: "CANCELLED",
        cancelReason: "COURSE_DELETED",
      });
    }
  }

  // ── Step 4: Bulk-delete all child sessions ───────────────────────────────
  // Direct db.remove with multi:true as specified in the WAD2 task requirement.
  // This runs AFTER booking cancellations are complete.
  await SessionModel.removeByCourse(courseId);

  // ── Step 5: Remove the parent course document ────────────────────────────
  // Runs last — only reached after all children are cleaned up.
  await CourseModel.removeById(courseId);

  // Return a summary so the controller can log / respond with useful data
  return {
    deletedCourseId: courseId,
    sessionsRemoved: sessions.length,
  };
}

/**
 * deleteSessionCascade(sessionId)
 *
 * Removes a single session and cancels all bookings that reference it.
 * Also removes the session ID from its parent course's sessionIds array.
 */
export async function deleteSessionCascade(sessionId) {
  const session = await SessionModel.findById(sessionId);
  if (!session) {
    const err = new Error("Session not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  // Cancel bookings referencing this session
  const affectedBookings = await BookingModel.list({
    sessionIds: sessionId,
    status: { $nin: ["CANCELLED"] },
  });
  for (const booking of affectedBookings) {
    await BookingModel.updateById(booking._id, {
      status: "CANCELLED",
      cancelReason: "SESSION_DELETED",
    });
  }

  // Remove session
  await SessionModel.removeById(sessionId);

  // Remove sessionId from parent course's sessionIds array
  if (session.courseId) {
    const course = await CourseModel.findById(session.courseId);
    if (course && course.sessionIds) {
      await CourseModel.update(session.courseId, {
        sessionIds: course.sessionIds.filter((id) => id !== sessionId),
      });
    }
  }

  return { deletedSessionId: sessionId, bookingsCancelled: affectedBookings.length };
}
