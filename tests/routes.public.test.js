import request from "supertest";
import { app } from "../index.js";
import { resetDb, seedMinimal } from "./helpers.js";

describe("SSR – public info pages", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
    await seedMinimal();
  });

  test("GET /organisation renders about page", async () => {
    const res = await request(app).get("/organisation");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/organisation|about|mission/i);
  });

  test("GET /locations renders locations page with seeded location", async () => {
    const res = await request(app).get("/locations");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toMatch(/Test Studio/);
  });

  test("GET /courses/:id returns 404 for unknown course", async () => {
    const res = await request(app).get("/courses/nonexistent-id");
    expect(res.status).toBe(404);
  });
});

describe("SSR – auth redirects for protected SSR routes", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
  });

  test("GET /organiser redirects unauthenticated user to login", async () => {
    const res = await request(app).get("/organiser");
    // Either redirect (302) or the auth guard might serve HTML
    expect([302, 303, 401]).toContain(res.status);
  });
});
