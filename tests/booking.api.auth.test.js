import request from "supertest";
import { beforeEach, describe, expect, test } from "@jest/globals";
import { app } from "../index.js";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";

const loginAs = (agent, email, password) =>
  agent.post("/auth/login").type("form").send({ email, password });

describe("Booking API controller branches", () => {
  let data;
  let studentA;
  let studentB;
  let agentA;
  let agentB;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    studentA = await UserModel.create({
      name: "Booking Student A",
      email: "booking-a@test.local",
      password: "password123",
      role: "student",
    });
    studentB = await UserModel.create({
      name: "Booking Student B",
      email: "booking-b@test.local",
      password: "password123",
      role: "student",
    });
    agentA = request.agent(app);
    agentB = request.agent(app);
    await loginAs(agentA, studentA.email, "password123").expect(302);
    await loginAs(agentB, studentB.email, "password123").expect(302);
  });

  test("POST /api/bookings/course returns 422 when courseId is missing", async () => {
    const res = await agentA.post("/api/bookings/course").send({});

    expect(res.status).toBe(422);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.some((error) => error.path === "courseId")).toBe(true);
  });

  test("POST /api/bookings/course returns 409 for a duplicate active booking", async () => {
    await agentA
      .post("/api/bookings/course")
      .send({ courseId: data.course._id })
      .expect(201);

    const duplicate = await agentA
      .post("/api/bookings/course")
      .send({ courseId: data.course._id });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already have an active booking/i);
  });

  test("POST /api/bookings/session returns 400 when drop-ins are disabled", async () => {
    const noDropInCourse = await CourseModel.create({
      title: "No Drop-In Course",
      level: "beginner",
      type: "WEEKLY_BLOCK",
      allowDropIn: false,
      startDate: data.course.startDate,
      endDate: data.course.endDate,
      instructorId: data.instructor._id,
      sessionIds: [],
      description: "Sessions on this course cannot be booked individually.",
      locationId: data.location._id,
      price: 40,
    });
    const session = await SessionModel.create({
      courseId: noDropInCourse._id,
      startDateTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      endDateTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
      capacity: 12,
      bookedCount: 0,
    });
    await CourseModel.update(noDropInCourse._id, { sessionIds: [session._id] });

    const res = await agentA
      .post("/api/bookings/session")
      .send({ sessionId: session._id });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/drop-in not allowed/i);
  });

  test("POST /api/bookings/session returns 409 for a duplicate active booking", async () => {
    await agentA
      .post("/api/bookings/session")
      .send({ sessionId: data.sessions[0]._id })
      .expect(201);

    const duplicate = await agentA
      .post("/api/bookings/session")
      .send({ sessionId: data.sessions[0]._id });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error).toMatch(/already have an active booking/i);
  });

  test("DELETE /api/bookings/:id returns 404 for an authenticated missing booking", async () => {
    const res = await agentA.delete("/api/bookings/missing-booking-id");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test("DELETE /api/bookings/:id returns 403 when cancelling another user's booking", async () => {
    const create = await agentA
      .post("/api/bookings/session")
      .send({ sessionId: data.sessions[1]._id })
      .expect(201);

    const forbidden = await agentB.delete(
      `/api/bookings/${create.body.booking._id}`
    );

    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatch(/only cancel your own/i);
  });
});