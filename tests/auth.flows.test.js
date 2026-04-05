import request from "supertest";
import { beforeEach, describe, expect, test } from "@jest/globals";
import { app } from "../index.js";
import { resetDb } from "./helpers.js";
import { UserModel } from "../models/userModel.js";

const loginAs = (agent, email, password) =>
  agent.post("/auth/login").type("form").send({ email, password });

describe("Authentication pages and registration flows", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
  });

  test("GET /auth/login renders the login page", async () => {
    const res = await request(app).get("/auth/login");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/Log In/i);
  });

  test("GET /auth/register renders the register page", async () => {
    const res = await request(app).get("/auth/register");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/Create Account/i);
  });

  test("POST /auth/register re-renders with validation errors", async () => {
    const res = await request(app)
      .post("/auth/register")
      .type("form")
      .send({ name: "", email: "bad-email", password: "short" });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Full name is required/i);
    expect(res.text).toMatch(/valid email address/i);
    expect(res.text).toMatch(/at least 8 characters/i);
  });

  test("POST /auth/register rejects duplicate email addresses", async () => {
    await UserModel.create({
      name: "Existing User",
      email: "existing@test.local",
      password: "password123",
      role: "student",
    });

    const res = await request(app)
      .post("/auth/register")
      .type("form")
      .send({
        name: "Another User",
        email: "existing@test.local",
        password: "password123",
      });

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/already exists/i);
  });

  test("POST /auth/register creates the account and signs the user in", async () => {
    const agent = request.agent(app);

    const res = await agent.post("/auth/register").type("form").send({
      name: "New Student",
      email: "newstudent@test.local",
      password: "password123",
    });

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");

    const user = await UserModel.findByEmail("newstudent@test.local");
    expect(user).toBeTruthy();
    expect(user.password).not.toBe("password123");
  });

  test("GET /auth/logout clears the session and redirects to login", async () => {
    await UserModel.create({
      name: "Logout Student",
      email: "logout@test.local",
      password: "password123",
      role: "student",
    });
    const agent = request.agent(app);

    await loginAs(agent, "logout@test.local", "password123").expect(302);

    const logout = await agent.get("/auth/logout");
    expect(logout.status).toBe(302);
    expect(logout.headers.location).toBe("/auth/login");

    const protectedRoute = await agent
      .get("/bookings/nonexistent-booking")
      .set("Accept", "text/html");
    expect(protectedRoute.status).toBe(302);
    expect(protectedRoute.headers.location).toBe("/auth/login");
  });
});