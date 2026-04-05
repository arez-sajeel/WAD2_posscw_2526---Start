import { beforeEach, describe, expect, test } from "@jest/globals";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { bookCourseForUser } from "../services/bookingService.js";

describe("booking service capacity control", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
  });

  test("concurrent course bookings cannot overbook shared sessions", async () => {
    const { course, sessions } = await seedMinimal();

    await Promise.all(
      sessions.map((session) =>
        SessionModel.update(session._id, {
          capacity: 1,
          bookedCount: 0,
          participants: [],
        })
      )
    );

    const [studentA, studentB] = await Promise.all([
      UserModel.create({
        name: "Student A",
        email: "student-a@test.local",
        role: "student",
      }),
      UserModel.create({
        name: "Student B",
        email: "student-b@test.local",
        role: "student",
      }),
    ]);

    const bookings = await Promise.all([
      bookCourseForUser(studentA._id, course._id),
      bookCourseForUser(studentB._id, course._id),
    ]);

    const updatedSessions = await Promise.all(
      sessions.map((session) => SessionModel.findById(session._id))
    );

    expect(bookings.map((booking) => booking.status).sort()).toEqual([
      "CONFIRMED",
      "WAITLISTED",
    ]);
    expect(updatedSessions.map((session) => session.bookedCount)).toEqual([1, 1]);
    expect(
      updatedSessions.every((session) => (session.participants ?? []).length === 1)
    ).toBe(true);
  });
});