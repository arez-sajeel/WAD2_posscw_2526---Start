// seed/seed.js
import { initDb } from "../models/_db.js";
import { CourseModel } from "../models/courseModel.js";
import { SessionModel } from "../models/sessionModel.js";
import { UserModel } from "../models/userModel.js";
import { BookingModel } from "../models/bookingModel.js";
import { LocationModel } from "../models/locationModel.js";

const iso = (d) => new Date(d).toISOString();
const pad = (value) => String(value).padStart(2, "0");
const dateOnly = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const withTime = (date, hours, minutes) => {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

const nextWeekday = (targetDay, weeksAhead = 0) => {
  const today = withTime(new Date(), 12, 0);
  let diff = (targetDay - today.getDay() + 7) % 7;
  if (diff === 0) {
    diff = 7;
  }

  return addDays(today, diff + weeksAhead * 7);
};

let instructorSequence = 0;

async function wipeAll() {
  // Remove all documents to guarantee a clean seed
  // Uses model class removeAll() instead of raw Datastore.remove() calls
  await Promise.all([
    UserModel.removeAll(),
    CourseModel.removeAll(),
    SessionModel.removeAll(),
    BookingModel.removeAll(),
    LocationModel.removeAll(),
  ]);
  // Compact the underlying files so stale data is not visible on disk
  await Promise.all([
    UserModel.db.compactDatafile(),
    CourseModel.db.compactDatafile(),
    SessionModel.db.compactDatafile(),
    BookingModel.db.compactDatafile(),
    LocationModel.db.compactDatafile(),
  ]);
}

async function ensureDemoStudent() {
  let student = await UserModel.findByEmail("fiona@student.local");
  if (!student) {
    student = await UserModel.create({
      name: "Fiona",
      email: "fiona@student.local",
      password: "student123",
      role: "student",
    });
  }
  return student;
}

async function ensureDemoOrganiser() {
  let organiser = await UserModel.findByEmail("admin@yoga.local");
  if (!organiser) {
    organiser = await UserModel.create({
      name: "Admin",
      email: "admin@yoga.local",
      password: "organiser123",
      role: "organiser",
    });
  }
  return organiser;
}

async function seedLocations() {
  const main = await LocationModel.create({
    name: "Main Studio",
    address: "12 Harmony Lane, Edinburgh EH1 2AB",
    description: "Our flagship studio with underfloor heating and full-length mirrors.",
  });
  const annex = await LocationModel.create({
    name: "Garden Annex",
    address: "14 Harmony Lane, Edinburgh EH1 2AB",
    description: "A bright, airy space overlooking the community garden.",
  });
  return { main, annex };
}

async function createInstructor(name) {
  instructorSequence += 1;
  return UserModel.create({
    name,
    email: `seed-instructor-${instructorSequence}@yoga.local`,
    password: "instructor123",
    role: "instructor",
  });
}

async function createWeekendWorkshop({
  title,
  level,
  description,
  locationId,
  price,
  instructorName,
  weeksAhead = 0,
}) {
  const instructor = await createInstructor(instructorName);
  const firstDay = nextWeekday(6, weeksAhead);
  const secondDay = addDays(firstDay, 1);
  const course = await CourseModel.create({
    title,
    level,
    type: "WEEKEND_WORKSHOP",
    allowDropIn: false,
    startDate: dateOnly(firstDay),
    endDate: dateOnly(secondDay),
    instructorId: instructor._id,
    sessionIds: [],
    description,
    locationId,
    price,
  });

  const sessionSlots = [
    { day: 0, hours: 9, minutes: 30, durationMinutes: 75 },
    { day: 0, hours: 11, minutes: 30, durationMinutes: 75 },
    { day: 0, hours: 14, minutes: 0, durationMinutes: 75 },
    { day: 1, hours: 10, minutes: 0, durationMinutes: 75 },
    { day: 1, hours: 12, minutes: 0, durationMinutes: 75 },
  ];

  const sessions = [];
  for (const slot of sessionSlots) {
    const sessionDate = slot.day === 0 ? firstDay : secondDay;
    const start = withTime(sessionDate, slot.hours, slot.minutes);
    const end = new Date(start.getTime() + slot.durationMinutes * 60 * 1000);
    const s = await SessionModel.create({
      courseId: course._id,
      startDateTime: iso(start),
      endDateTime: iso(end),
      capacity: 20,
      bookedCount: 0,
    });
    sessions.push(s);
  }
  await CourseModel.update(course._id, {
    sessionIds: sessions.map((s) => s._id),
  });
  return { course, sessions, instructor };
}

async function createWeeklyBlock({
  title,
  level,
  description,
  locationId,
  price,
  instructorName,
  weeksAhead = 0,
  weekday = 1,
  sessionCount = 6,
  startHour = 18,
  startMinute = 30,
  sessionMinutes = 75,
  allowDropIn = true,
}) {
  const instructor = await createInstructor(instructorName);
  const first = withTime(nextWeekday(weekday, weeksAhead), startHour, startMinute);
  const last = addDays(first, (sessionCount - 1) * 7);
  const course = await CourseModel.create({
    title,
    level,
    type: "WEEKLY_BLOCK",
    allowDropIn,
    startDate: dateOnly(first),
    endDate: dateOnly(last),
    instructorId: instructor._id,
    sessionIds: [],
    description,
    locationId,
    price,
  });

  const sessions = [];
  for (let i = 0; i < sessionCount; i++) {
    const start = new Date(first.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + sessionMinutes * 60 * 1000);
    const s = await SessionModel.create({
      courseId: course._id,
      startDateTime: iso(start),
      endDateTime: iso(end),
      capacity: 18,
      bookedCount: 0,
    });
    sessions.push(s);
  }
  await CourseModel.update(course._id, {
    sessionIds: sessions.map((s) => s._id),
  });
  return { course, sessions, instructor };
}

async function seedCourseCatalogue(locs) {
  const definitions = [
    {
      kind: "workshop",
      title: "Winter Mindfulness Workshop",
      level: "beginner",
      description: "Two days of breath, posture alignment, and meditation.",
      locationId: locs.main._id,
      price: 45,
      instructorName: "Ava",
      weeksAhead: 1,
    },
    {
      kind: "weekly",
      title: "12-Week Vinyasa Flow",
      level: "intermediate",
      description: "Progressive sequences building strength and flexibility.",
      locationId: locs.annex._id,
      price: 120,
      instructorName: "Ben",
      weeksAhead: 0,
      weekday: 1,
      sessionCount: 12,
      startHour: 18,
      startMinute: 30,
      allowDropIn: true,
    },
    {
      kind: "weekly",
      title: "Sunrise Flow Foundations",
      level: "beginner",
      description: "A steady introduction to flowing practice before the working day begins.",
      locationId: locs.main._id,
      price: 72,
      instructorName: "Maya",
      weeksAhead: 1,
      weekday: 2,
      sessionCount: 6,
      startHour: 7,
      startMinute: 15,
      allowDropIn: true,
    },
    {
      kind: "weekly",
      title: "Midday Mobility Lab",
      level: "intermediate",
      description: "Short, focused lunchtime sessions for posture, hips, and shoulders.",
      locationId: locs.annex._id,
      price: 68,
      instructorName: "Luca",
      weeksAhead: 1,
      weekday: 3,
      sessionCount: 6,
      startHour: 12,
      startMinute: 15,
      allowDropIn: true,
    },
    {
      kind: "weekly",
      title: "Slow Flow for Beginners",
      level: "beginner",
      description: "Build confidence with a slower pace, clear cueing, and plenty of support.",
      locationId: locs.main._id,
      price: 75,
      instructorName: "Nina",
      weeksAhead: 2,
      weekday: 4,
      sessionCount: 8,
      startHour: 18,
      startMinute: 0,
      allowDropIn: true,
    },
    {
      kind: "weekly",
      title: "Core Stability Series",
      level: "advanced",
      description: "A stronger weekly practice centred on balance, control, and endurance.",
      locationId: locs.annex._id,
      price: 84,
      instructorName: "Rohan",
      weeksAhead: 2,
      weekday: 5,
      sessionCount: 6,
      startHour: 18,
      startMinute: 45,
      allowDropIn: false,
    },
    {
      kind: "workshop",
      title: "Yoga for Runners Weekend",
      level: "intermediate",
      description: "Target hips, hamstrings, and recovery strategies for regular runners.",
      locationId: locs.main._id,
      price: 55,
      instructorName: "Sophie",
      weeksAhead: 3,
    },
    {
      kind: "weekly",
      title: "Evening Yin Reset",
      level: "beginner",
      description: "Longer held postures and quiet breathwork to unwind at the end of the day.",
      locationId: locs.main._id,
      price: 70,
      instructorName: "Elena",
      weeksAhead: 3,
      weekday: 1,
      sessionCount: 6,
      startHour: 19,
      startMinute: 15,
      allowDropIn: true,
    },
    {
      kind: "workshop",
      title: "Restorative Reset Retreat",
      level: "beginner",
      description: "A calm, prop-supported weekend workshop focused on deep rest and recovery.",
      locationId: locs.annex._id,
      price: 60,
      instructorName: "Priya",
      weeksAhead: 4,
    },
    {
      kind: "weekly",
      title: "Power and Balance Intensive",
      level: "advanced",
      description: "Dynamic transitions and standing balance work for experienced practitioners.",
      locationId: locs.annex._id,
      price: 96,
      instructorName: "Theo",
      weeksAhead: 4,
      weekday: 2,
      sessionCount: 8,
      startHour: 18,
      startMinute: 30,
      allowDropIn: false,
    },
  ];

  const created = [];
  for (const definition of definitions) {
    if (definition.kind === "workshop") {
      created.push(await createWeekendWorkshop(definition));
      continue;
    }

    created.push(await createWeeklyBlock(definition));
  }

  return created;
}

async function verifyAndReport() {
  // Uses model class count() instead of raw Datastore.count() calls
  const [users, courses, sessions, bookings, locations] = await Promise.all([
    UserModel.count({}),
    CourseModel.count({}),
    SessionModel.count({}),
    BookingModel.count({}),
    LocationModel.count({}),
  ]);
  console.log("— Verification —");
  console.log("Users    :", users);
  console.log("Courses  :", courses);
  console.log("Sessions :", sessions);
  console.log("Bookings :", bookings);
  console.log("Locations:", locations);
  if (courses === 0 || sessions === 0) {
    throw new Error("Seed finished but no courses/sessions were created.");
  }
}

async function run() {
  console.log("Initializing DB…");
  await initDb();

  console.log("Wiping existing data…");
  await wipeAll();

  console.log("Creating demo student…");
  const student = await ensureDemoStudent();

  console.log("Creating demo organiser…");
  const _organiser = await ensureDemoOrganiser();

  console.log("Seeding locations…");
  const locs = await seedLocations();

  console.log("Creating course catalogue…");
  const createdCourses = await seedCourseCatalogue(locs);

  await verifyAndReport();

  console.log("\n✅ Seed complete.");
  console.log("Student ID           :", student._id);
  console.log("Seeded course count  :", createdCourses.length);
  createdCourses.forEach(({ course, sessions }) => {
    console.log(`- ${course.title}: ${sessions.length} session(s)`);
  });
}

run().catch((err) => {
  console.error("❌ Seed failed:", err?.stack || err);
  process.exit(1);
});
