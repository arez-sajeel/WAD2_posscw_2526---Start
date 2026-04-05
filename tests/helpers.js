// tests/helpers.js
import { initDb } from "../models/_db.js";
import { UserModel } from "../models/userModel.js";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { BookingModel } from "../models/bookingModel.js";
import { LocationModel } from "../models/locationModel.js";

const dateOnly = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const relativeDate = (offsetDays, hours = 0, minutes = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);
  return date;
};

export async function resetDb() {
  await initDb();
  // Uses model class removeAll() instead of raw Datastore.remove() calls
  await Promise.all([
    UserModel.removeAll(),
    CourseModel.removeAll(),
    SessionModel.removeAll(),
    BookingModel.removeAll(),
    LocationModel.removeAll(),
  ]);
  await Promise.all([
    UserModel.db.compactDatafile(),
    CourseModel.db.compactDatafile(),
    SessionModel.db.compactDatafile(),
    BookingModel.db.compactDatafile(),
    LocationModel.db.compactDatafile(),
  ]);
}

// Seed a minimal dataset used by multiple tests
export async function seedMinimal() {
  const courseStart = relativeDate(-7);
  const courseEnd = relativeDate(14);
  const firstSessionStart = relativeDate(0, 18, 30);
  const secondSessionStart = relativeDate(7, 18, 30);

  const location = await LocationModel.create({
    name: "Test Studio",
    address: "1 Test Lane, Edinburgh EH1 1AA",
    description: "A test location.",
  });

  const student = await UserModel.create({
    name: "Test Student",
    email: "student@test.local",
    role: "student",
  });
  const instructor = await UserModel.create({
    name: "Test Instructor",
    email: "instructor@test.local",
    role: "instructor",
  });

  const course = await CourseModel.create({
    title: "Test Course",
    level: "beginner",
    type: "WEEKLY_BLOCK",
    allowDropIn: true,
    startDate: dateOnly(courseStart),
    endDate: dateOnly(courseEnd),
    instructorId: instructor._id,
    sessionIds: [],
    description: "A test course for E2E route testing.",
    locationId: location._id,
    price: 60,
  });

  // Two sessions to keep tests fast
  const s1 = await SessionModel.create({
    courseId: course._id,
    startDateTime: firstSessionStart.toISOString(),
    endDateTime: new Date(
      firstSessionStart.getTime() + 75 * 60 * 1000
    ).toISOString(),
    capacity: 18,
    bookedCount: 0,
  });

  const s2 = await SessionModel.create({
    courseId: course._id,
    startDateTime: secondSessionStart.toISOString(),
    endDateTime: new Date(
      secondSessionStart.getTime() + 75 * 60 * 1000
    ).toISOString(),
    capacity: 18,
    bookedCount: 0,
  });

  await CourseModel.update(course._id, { sessionIds: [s1._id, s2._id] });

  return { student, instructor, course, sessions: [s1, s2], location };
}
