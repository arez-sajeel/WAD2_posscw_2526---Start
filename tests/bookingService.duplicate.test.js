import { describe, expect, test, beforeEach } from "@jest/globals";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { SessionModel } from "../models/sessionModel.js";
import {
  bookCourseForUser,
  bookSessionForUser,
  cancelBookingForUser,
} from "../services/bookingService.js";

describe("bookingService – duplicate prevention", () => {
  let data, student;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    student = await UserModel.create({
      name: "Dup Student",
      email: "dup@test.local",
      role: "student",
    });
  });

  test("rejects duplicate course booking for same user", async () => {
    await bookCourseForUser(student._id, data.course._id);
    await expect(bookCourseForUser(student._id, data.course._id)).rejects.toThrow(
      /already have an active booking/i
    );
  });

  test("allows course re-booking after cancellation", async () => {
    const b1 = await bookCourseForUser(student._id, data.course._id);
    await cancelBookingForUser(b1._id, student._id);
    const b2 = await bookCourseForUser(student._id, data.course._id);
    expect(b2.status).toBe("CONFIRMED");
  });

  test("rejects duplicate session booking for same user", async () => {
    const sid = data.sessions[0]._id;
    await bookSessionForUser(student._id, sid);
    await expect(bookSessionForUser(student._id, sid)).rejects.toThrow(
      /already have an active booking/i
    );
  });

  test("rejects course booking when the user already has a session booking on that course", async () => {
    await bookSessionForUser(student._id, data.sessions[0]._id);
    await expect(bookCourseForUser(student._id, data.course._id)).rejects.toThrow(
      /already have an active booking/i
    );
  });

  test("rejects session booking when the user already has a course booking", async () => {
    await bookCourseForUser(student._id, data.course._id);
    await expect(bookSessionForUser(student._id, data.sessions[0]._id)).rejects.toThrow(
      /already have an active booking/i
    );
  });
});

describe("bookingService – cancelBookingForUser", () => {
  let data, student;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    student = await UserModel.create({
      name: "Cancel Student",
      email: "cancel@test.local",
      role: "student",
    });
  });

  test("cancelling restores session capacity", async () => {
    const booking = await bookCourseForUser(student._id, data.course._id);
    expect(booking.status).toBe("CONFIRMED");

    const before = await SessionModel.findById(data.sessions[0]._id);
    expect(before.bookedCount).toBe(1);

    await cancelBookingForUser(booking._id, student._id);

    const after = await SessionModel.findById(data.sessions[0]._id);
    expect(after.bookedCount).toBe(0);
  });

  test("cancelling already-cancelled booking is idempotent", async () => {
    const booking = await bookCourseForUser(student._id, data.course._id);
    await cancelBookingForUser(booking._id, student._id);
    const result = await cancelBookingForUser(booking._id, student._id);
    expect(result.status).toBe("CANCELLED");
  });

  test("rejects cancellation by different user", async () => {
    const other = await UserModel.create({
      name: "Other",
      email: "other@test.local",
      role: "student",
    });
    const booking = await bookCourseForUser(student._id, data.course._id);
    await expect(cancelBookingForUser(booking._id, other._id)).rejects.toThrow(
      /only cancel your own/i
    );
  });

  test("rejects cancellation of nonexistent booking", async () => {
    await expect(cancelBookingForUser("nope", student._id)).rejects.toThrow(
      /not found/i
    );
  });
});
