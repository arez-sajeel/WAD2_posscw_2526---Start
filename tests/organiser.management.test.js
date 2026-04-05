import request from "supertest";
import { beforeEach, describe, expect, test } from "@jest/globals";
import { app } from "../index.js";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";

const futureDate = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const futureDateTime = (offsetDays, hours, minutes) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

describe("Organiser management routes", () => {
  let data;
  let organiser;
  let managedUser;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
    organiser = await UserModel.create({
      name: "Coverage Organiser",
      email: "coverage-organiser@test.local",
      password: "password123",
      role: "organiser",
    });
    managedUser = await UserModel.create({
      name: "Managed User",
      email: "managed-user@test.local",
      role: "student",
    });
  });

  test("GET /organiser/courses/new renders the create course form", async () => {
    const res = await request(app).get("/organiser/courses/new");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Create New Course/i);
  });

  test("POST /organiser/courses re-renders on validation failure", async () => {
    const res = await request(app).post("/organiser/courses").type("form").send({
      title: "",
      level: "bogus",
      type: "wrong",
      startDate: futureDate(10),
      endDate: futureDate(9),
      description: "Invalid course",
      price: "-1",
    });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Course title is required/i);
    expect(res.text).toMatch(/Level must be beginner/i);
    expect(res.text).toMatch(/End date must be on or after the start date/i);
  });

  test("POST /organiser/courses creates a course and redirects to the dashboard", async () => {
    const res = await request(app).post("/organiser/courses").type("form").send({
      title: "Coverage Course",
      level: "advanced",
      type: "WEEKEND_WORKSHOP",
      startDate: futureDate(30),
      endDate: futureDate(31),
      description: "Created from organiser tests.",
      allowDropIn: "on",
      locationId: data.location._id,
      price: "99.50",
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/organiser");

    const created = (await CourseModel.list()).find(
      (course) => course.title === "Coverage Course"
    );
    expect(created).toBeTruthy();
    expect(created.locationId).toBe(data.location._id);
  });

  test("GET /organiser/courses/:id/edit renders the edit form", async () => {
    const res = await request(app).get(`/organiser/courses/${data.course._id}/edit`);

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Edit:/i);
    expect(res.text).toMatch(/Test Course/);
  });

  test("POST /organiser/courses/:id/edit updates an existing course", async () => {
    const res = await request(app)
      .post(`/organiser/courses/${data.course._id}/edit`)
      .type("form")
      .send({
        title: "Updated Coverage Course",
        level: "intermediate",
        type: "WEEKLY_BLOCK",
        startDate: futureDate(5),
        endDate: futureDate(40),
        description: "Updated description",
        locationId: data.location._id,
        price: "75",
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/organiser");

    const updated = await CourseModel.findById(data.course._id);
    expect(updated.title).toBe("Updated Coverage Course");
    expect(updated.level).toBe("intermediate");
  });

  test("GET /organiser/courses/:id/sessions renders the session list", async () => {
    const res = await request(app).get(`/organiser/courses/${data.course._id}/sessions`);

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Sessions for:/i);
    expect(res.text).toMatch(/Test Course/);
  });

  test("GET /organiser/courses/:id/sessions/new renders the add session form", async () => {
    const res = await request(app).get(
      `/organiser/courses/${data.course._id}/sessions/new`
    );

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Add Session/i);
  });

  test("POST /organiser/courses/:id/sessions re-renders on validation failure", async () => {
    const res = await request(app)
      .post(`/organiser/courses/${data.course._id}/sessions`)
      .type("form")
      .send({
        startDateTime: futureDateTime(20, 19, 0),
        endDateTime: futureDateTime(20, 18, 0),
        capacity: 0,
      });

    expect(res.status).toBe(422);
    expect(res.text).toMatch(/after the start date/i);
    expect(res.text).toMatch(/Capacity must be a positive integer/i);
  });

  test("POST /organiser/courses/:id/sessions creates a new session", async () => {
    const startDateTime = futureDateTime(25, 18, 30);
    const endDateTime = futureDateTime(25, 19, 45);

    const res = await request(app)
      .post(`/organiser/courses/${data.course._id}/sessions`)
      .type("form")
      .send({ startDateTime, endDateTime, capacity: 20 });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/organiser/courses/${data.course._id}/sessions`);

    const sessions = await SessionModel.listByCourse(data.course._id);
    expect(sessions.length).toBe(3);
  });

  test("GET /organiser/sessions/:id/edit renders the edit session form", async () => {
    const res = await request(app).get(`/organiser/sessions/${data.sessions[0]._id}/edit`);

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Edit Session/i);
  });

  test("POST /organiser/sessions/:id/edit updates an existing session", async () => {
    const res = await request(app)
      .post(`/organiser/sessions/${data.sessions[0]._id}/edit`)
      .type("form")
      .send({
        startDateTime: futureDateTime(12, 17, 0),
        endDateTime: futureDateTime(12, 18, 0),
        capacity: 24,
      });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/organiser/courses/${data.course._id}/sessions`);

    const updated = await SessionModel.findById(data.sessions[0]._id);
    expect(updated.capacity).toBe(24);
  });

  test("GET /organiser renders friendly course metadata labels", async () => {
    const res = await request(app).get("/organiser");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Beginner/i);
    expect(res.text).toMatch(/Weekly block/i);
    expect(res.text).not.toMatch(/WEEKLY_BLOCK/);
  });

  test("POST /organiser/sessions/:id/delete removes the session", async () => {
    const res = await request(app).post(`/organiser/sessions/${data.sessions[0]._id}/delete`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/organiser/courses/${data.course._id}/sessions`);
    expect(await SessionModel.findById(data.sessions[0]._id)).toBeNull();
  });

  test("GET /organiser/users renders the user management page", async () => {
    const res = await request(app).get("/organiser/users");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Manage Users/i);
    expect(res.text).toMatch(/managed-user@test\.local/i);
  });

  test("POST /organiser/users/:id/promote updates the target role", async () => {
    const res = await request(app).post(`/organiser/users/${managedUser._id}/promote`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/organiser/users");

    const updated = await UserModel.findById(managedUser._id);
    expect(updated.role).toBe("organiser");
  });

  test("POST /organiser/users/:id/demote updates the target role", async () => {
    await UserModel.update(managedUser._id, { role: "organiser" });
    const agent = request.agent(app);

    await agent
      .post("/auth/login")
      .type("form")
      .send({ email: organiser.email, password: "password123" })
      .expect(302);

    const res = await agent.post(`/organiser/users/${managedUser._id}/demote`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/organiser/users");

    const updated = await UserModel.findById(managedUser._id);
    expect(updated.role).toBe("student");
  });

  test("POST /organiser/users/:id/delete removes the target user", async () => {
    const res = await request(app).post(`/organiser/users/${managedUser._id}/delete`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/organiser/users");
    expect(await UserModel.findById(managedUser._id)).toBeNull();
  });

  test("POST /organiser/courses/:id/delete removes the target course", async () => {
    const res = await request(app).post(`/organiser/courses/${data.course._id}/delete`);

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/organiser");
    expect(await CourseModel.findById(data.course._id)).toBeNull();
  });

  test("POST /organiser/users/:id/demote rejects self-demotion", async () => {
    const agent = request.agent(app);

    await agent
      .post("/auth/login")
      .type("form")
      .send({ email: organiser.email, password: "password123" });

    const res = await agent.post(`/organiser/users/${organiser._id}/demote`);

    expect(res.status).toBe(400);
    expect(res.text).toMatch(/cannot demote yourself/i);
  });
});