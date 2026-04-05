import request from "supertest";
import { describe, expect, test, beforeEach } from "@jest/globals";
import { app } from "../index.js";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { BookingModel } from "../models/bookingModel.js";
import { bookCourseForUser } from "../services/bookingService.js";

describe("Organiser – session participants", () => {
  let data, student, _organiser;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    _organiser = await UserModel.create({
      name: "Organiser",
      email: "organiser@test.local",
      role: "organiser",
    });
    student = await UserModel.create({
      name: "Booked Student",
      email: "booked@test.local",
      role: "student",
    });
  });

  test("GET /organiser/sessions/:id/participants lists confirmed participants", async () => {
    // Book the student onto the course (confirms for both sessions)
    await bookCourseForUser(student._id, data.course._id);

    const res = await request(app).get(
      `/organiser/sessions/${data.sessions[0]._id}/participants`
    );
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Booked Student/);
    expect(res.text).toMatch(/booked@test\.local/);
  });

  test("participants page shows empty state when no bookings exist", async () => {
    const res = await request(app).get(
      `/organiser/sessions/${data.sessions[0]._id}/participants`
    );
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/No participants yet/);
  });
});

describe("Organiser – user deletion restores capacity", () => {
  let data, student, _organiser;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    _organiser = await UserModel.create({
      name: "Organiser",
      email: "organiser@test.local",
      role: "organiser",
    });
    student = await UserModel.create({
      name: "Delete Me",
      email: "deleteme@test.local",
      role: "student",
    });
  });

  test("deleting a user with a confirmed booking restores session capacity", async () => {
    const booking = await bookCourseForUser(student._id, data.course._id);

    // Verify bookedCount was incremented
    let s1 = await SessionModel.findById(data.sessions[0]._id);
    expect(s1.bookedCount).toBe(1);

    // Delete the user via the organiser route
    await request(app)
      .post(`/organiser/users/${student._id}/delete`)
      .expect(302);

    // bookedCount should be restored to 0
    s1 = await SessionModel.findById(data.sessions[0]._id);
    expect(s1.bookedCount).toBe(0);

    // participants array should no longer contain the deleted user
    expect(s1.participants || []).not.toContain(student._id);

    // Booking should be cancelled
    const updated = await BookingModel.findById(booking._id);
    expect(updated.status).toBe("CANCELLED");

    // User should be removed
    const gone = await UserModel.findById(student._id);
    expect(gone).toBeNull();
  });

  test("deleting a user with no bookings succeeds", async () => {
    await request(app)
      .post(`/organiser/users/${student._id}/delete`)
      .expect(302);

    const gone = await UserModel.findById(student._id);
    expect(gone).toBeNull();
  });
});
