import request from "supertest";
import { describe, expect, test, beforeEach } from "@jest/globals";
import { app } from "../index.js";
import { resetDb, seedMinimal } from "./helpers.js";
import { UserModel } from "../models/userModel.js";
import { bookCourseForUser } from "../services/bookingService.js";

const loginAs = (agent, email, password) =>
  agent.post("/auth/login").type("form").send({ email, password });

const registerAs = async (agent, name, email, password) => {
  await agent
    .post("/auth/register")
    .type("form")
    .send({ name, email, password })
    .expect(302);

  return UserModel.findByEmail(email);
};

describe("Authentication and role access", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    await seedMinimal();
  });

  test("POST /auth/login rejects malformed email input", async () => {
    const res = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ email: "not-an-email", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Enter a valid email address/i);
  });

  test("POST /auth/login rejects wrong password", async () => {
    await UserModel.create({
      name: "Login Student",
      email: "login@student.local",
      password: "password123",
      role: "student",
    });

    const res = await request(app)
      .post("/auth/login")
      .type("form")
      .send({ email: "login@student.local", password: "wrong-password" });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Invalid email or password/i);
  });

  test("student can log in but cannot access organiser dashboard", async () => {
    await UserModel.create({
      name: "Student",
      email: "role-student@test.local",
      password: "password123",
      role: "student",
    });
    const agent = request.agent(app);

    const login = await loginAs(
      agent,
      "role-student@test.local",
      "password123"
    );
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/");

    const res = await agent.get("/organiser");
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/do not have permission/i);
  });

  test("organiser can log in and access organiser dashboard", async () => {
    await UserModel.create({
      name: "Organiser",
      email: "role-organiser@test.local",
      password: "password123",
      role: "organiser",
    });
    const agent = request.agent(app);

    const login = await loginAs(
      agent,
      "role-organiser@test.local",
      "password123"
    );
    expect(login.status).toBe(302);
    expect(login.headers.location).toBe("/");

    const res = await agent.get("/organiser");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Organiser Dashboard/i);
  });
});

describe("Booking confirmation access", () => {
  let data;

  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    data = await seedMinimal();
  });

  test("only the booking owner can view their confirmation page", async () => {
    const ownerAgent = request.agent(app);
    const otherAgent = request.agent(app);

    const owner = await registerAs(
      ownerAgent,
      "Owner Student",
      "owner@student.local",
      "password123"
    );
    await registerAs(
      otherAgent,
      "Other Student",
      "other@student.local",
      "password123"
    );

    const booking = await bookCourseForUser(owner._id, data.course._id);

    const ownerRes = await ownerAgent.get(`/bookings/${booking._id}`);
    expect(ownerRes.status).toBe(200);
    expect(ownerRes.text).toMatch(/Booking Confirmation/i);

    const otherRes = await otherAgent.get(`/bookings/${booking._id}`);
    expect(otherRes.status).toBe(403);
    expect(otherRes.text).toMatch(/do not have permission/i);
  });
});