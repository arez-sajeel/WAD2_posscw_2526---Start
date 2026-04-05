import { describe, expect, test, beforeEach } from "@jest/globals";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { BookingModel } from "../models/bookingModel.js";
import { bookCourseForUser } from "../services/bookingService.js";
import { deleteCourseCascade, deleteSessionCascade } from "../services/courseService.js";

describe("courseService – cascade delete", () => {
  let data, student;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    student = await UserModel.create({
      name: "Cascade Student",
      email: "cascade@test.local",
      role: "student",
    });
  });

  test("deleteCourseCascade removes course, sessions, and cancels bookings", async () => {
    const booking = await bookCourseForUser(student._id, data.course._id);
    expect(booking.status).toBe("CONFIRMED");

    const result = await deleteCourseCascade(data.course._id);
    expect(result.sessionsRemoved).toBe(2);

    // Course gone
    expect(await CourseModel.findById(data.course._id)).toBeNull();

    // Sessions gone
    const sessions = await SessionModel.listByCourse(data.course._id);
    expect(sessions.length).toBe(0);

    // Booking cancelled
    const updated = await BookingModel.findById(booking._id);
    expect(updated.status).toBe("CANCELLED");
    expect(updated.cancelReason).toBe("COURSE_DELETED");
  });

  test("deleteCourseCascade throws for nonexistent course", async () => {
    await expect(deleteCourseCascade("nonexistent")).rejects.toThrow(/not found/i);
  });

  test("deleteSessionCascade removes one session and cancels its bookings", async () => {
    const booking = await bookCourseForUser(student._id, data.course._id);
    const sid = data.sessions[0]._id;

    const result = await deleteSessionCascade(sid);
    expect(result.bookingsCancelled).toBe(1);

    // Session gone
    expect(await SessionModel.findById(sid)).toBeNull();

    // Parent course's sessionIds updated
    const course = await CourseModel.findById(data.course._id);
    expect(course.sessionIds).not.toContain(sid);

    // Booking cancelled
    const updated = await BookingModel.findById(booking._id);
    expect(updated.status).toBe("CANCELLED");
  });
});
