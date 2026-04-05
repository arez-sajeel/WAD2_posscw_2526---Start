import request from "supertest";
import { describe, expect, test, beforeEach } from "@jest/globals";
import { app } from "../index.js";
import { resetDb, seedMinimal } from "./helpers.js";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";

const dateOnly = (offsetDays) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateTime = (offsetDays, hours, minutes) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

const createUpcomingCourse = async (seedData, title, offsetDays) => {
  const course = await CourseModel.create({
    title,
    level: "beginner",
    type: "WEEKLY_BLOCK",
    allowDropIn: true,
    startDate: dateOnly(offsetDays),
    endDate: dateOnly(offsetDays + 7),
    instructorId: seedData.instructor._id,
    sessionIds: [],
    description: `${title} description`,
    locationId: seedData.location._id,
    price: 20,
  });

  const session = await SessionModel.create({
    courseId: course._id,
    startDateTime: dateTime(offsetDays, 18, 0),
    endDateTime: dateTime(offsetDays, 19, 0),
    capacity: 12,
    bookedCount: 0,
  });

  await CourseModel.update(course._id, { sessionIds: [session._id] });
};

describe("SSR course listings", () => {
  beforeEach(async () => {
    process.env.NODE_ENV = "test";
    await resetDb();
  });

  test("GET /courses excludes past courses and shows required listing details", async () => {
    const data = await seedMinimal();

    const pastCourse = await CourseModel.create({
      title: "Past Course",
      level: "beginner",
      type: "WEEKEND_WORKSHOP",
      allowDropIn: false,
      startDate: dateOnly(-30),
      endDate: dateOnly(-29),
      instructorId: data.instructor._id,
      sessionIds: [],
      description: "A course that should not appear in current listings.",
      locationId: data.location._id,
      price: 15,
    });

    const pastSession = await SessionModel.create({
      courseId: pastCourse._id,
      startDateTime: dateTime(-30, 9, 0),
      endDateTime: dateTime(-30, 10, 0),
      capacity: 10,
      bookedCount: 0,
    });

    await CourseModel.update(pastCourse._id, { sessionIds: [pastSession._id] });

    const res = await request(app).get("/courses");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/Test Course/);
    expect(res.text).not.toMatch(/Past Course/);
    expect(res.text).toMatch(/Duration:/);
    expect(res.text).toMatch(/Dates:/);
    expect(res.text).toMatch(/Time:/);
    expect(res.text).toMatch(/Location:/);
    expect(res.text).toMatch(/Price:/);
    expect(res.text).toMatch(/Weekly block/i);
    expect(res.text).not.toMatch(/WEEKLY_BLOCK/);
  });

  test("GET /courses marks the courses nav link as active", async () => {
    await seedMinimal();

    const res = await request(app).get("/courses");

    expect(res.status).toBe(200);
    expect(res.text).toMatch(
      /<a class="site-nav__link is-active" href="\/courses" aria-current="page">Courses<\/a>/
    );
  });

  test("GET /courses paginates after the default page size", async () => {
    const data = await seedMinimal();

    for (let index = 1; index <= 6; index += 1) {
      await createUpcomingCourse(data, `Extra Course ${index}`, 20 + index);
    }

    const firstPage = await request(app).get("/courses");

    expect(firstPage.status).toBe(200);
    expect(firstPage.text).toMatch(/Page 1 of 2/);
    expect(firstPage.text).not.toMatch(/Extra Course 6/);

    const secondPage = await request(app).get("/courses?page=2");

    expect(secondPage.status).toBe(200);
    expect(secondPage.text).toMatch(/Page 2 of 2/);
    expect(secondPage.text).toMatch(/Extra Course 6/);
  });
});