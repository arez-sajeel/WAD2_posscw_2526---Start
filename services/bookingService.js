// services/bookingService.js
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { BookingModel } from "../models/bookingModel.js";
import { listActiveBookingsForUser } from "./bookingStateService.js";

export async function bookCourseForUser(userId, courseId) {
  const course = await CourseModel.findById(courseId);
  if (!course) throw new Error("Course not found");
  const sessions = await SessionModel.listByCourse(courseId);
  if (sessions.length === 0) throw new Error("Course has no sessions");

  const activeBookings = await listActiveBookingsForUser(userId);
  const hasOverlappingCourseBooking = activeBookings.some(
    (booking) => booking.courseId === courseId
  );
  if (hasOverlappingCourseBooking) {
    const err = new Error("You already have an active booking for this course");
    err.code = "DUPLICATE_BOOKING";
    throw err;
  }

  let status = "CONFIRMED";
  const reservedSessionIds = [];

  for (const session of sessions) {
    const reservedSession = await SessionModel.reserveSeat(session._id, userId);
    if (!reservedSession) {
      status = "WAITLISTED";
      break;
    }

    reservedSessionIds.push(session._id);
  }

  if (status === "WAITLISTED") {
    for (const sessionId of reservedSessionIds) {
      await SessionModel.adjustCapacity(sessionId, -1, userId);
    }
  }

  return BookingModel.create({
    userId,
    courseId,
    type: "COURSE",
    sessionIds: sessions.map((s) => s._id),
    status,
  });
}

export async function bookSessionForUser(userId, sessionId) {
  const session = await SessionModel.findById(sessionId);
  if (!session) throw new Error("Session not found");
  const course = await CourseModel.findById(session.courseId);
  if (!course) throw new Error("Course not found");

  if (!course.allowDropIn && course.type === "WEEKLY_BLOCK") {
    const err = new Error("Drop-in not allowed for this course");
    err.code = "DROPIN_NOT_ALLOWED";
    throw err;
  }

  const activeBookings = await listActiveBookingsForUser(userId);
  const hasOverlappingSessionBooking = activeBookings.some((booking) => {
    if (booking.type === "COURSE") {
      return booking.courseId === course._id;
    }

    return (booking.sessionIds ?? []).includes(sessionId);
  });
  if (hasOverlappingSessionBooking) {
    const err = new Error("You already have an active booking for this session");
    err.code = "DUPLICATE_BOOKING";
    throw err;
  }

  const reservedSession = await SessionModel.reserveSeat(session._id, userId);
  const status = reservedSession ? "CONFIRMED" : "WAITLISTED";

  return BookingModel.create({
    userId,
    courseId: course._id,
    type: "SESSION",
    sessionIds: [session._id],
    status,
  });
}

/**
 * Cancel a booking by ID.
 * Decrements bookedCount on each associated session when the booking was
 * CONFIRMED so that capacity is restored.
 * Moved here from bookingController so controllers stay free of data logic.
 */
export async function cancelBookingForUser(bookingId, requestingUserId) {
  const booking = await BookingModel.findById(bookingId);
  if (!booking) {
    const err = new Error("Booking not found");
    err.code = "NOT_FOUND";
    throw err;
  }

  if (requestingUserId && booking.userId !== requestingUserId) {
    const err = new Error("You can only cancel your own bookings");
    err.code = "FORBIDDEN";
    throw err;
  }

  // Idempotent: already cancelled
  if (booking.status === "CANCELLED") return booking;

  // Restore session capacity only for confirmed bookings
  // $inc with -1 + $pull atomically decrement and remove user — no race risk
  if (booking.status === "CONFIRMED") {
    for (const sid of booking.sessionIds) {
      await SessionModel.adjustCapacity(sid, -1, booking.userId);
    }
  }

  return BookingModel.cancel(bookingId);
}
