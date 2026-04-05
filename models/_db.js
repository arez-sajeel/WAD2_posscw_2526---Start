// models/_db.js
//
// Central registry: imports the default file-based singletons from each
// model module and re-exports their underlying Datastore instances.
// This keeps test helpers and seed scripts working via a single import
// while each model class owns its own NeDB Datastore initialisation.

import path from "path";
import { fileURLToPath } from "url";
import { promises as fs } from "fs";

// Model singletons — each one already created its Datastore on import
import { UserModel } from "./userModel.js";
import { CourseModel } from "./courseModel.js";
import { SessionModel } from "./sessionModel.js";
import { BookingModel } from "./bookingModel.js";
import { LocationModel } from "./locationModel.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbDir = path.join(__dirname, "../db");

// Expose the raw Datastore references so test helpers can wipe data directly
export const usersDb = UserModel.db;
export const coursesDb = CourseModel.db;
export const sessionsDb = SessionModel.db;
export const bookingsDb = BookingModel.db;
export const locationsDb = LocationModel.db;

// Call this once at startup (server + seed)
export async function initDb() {
  await fs.mkdir(dbDir, { recursive: true });
  // Ensure helpful indexes are ready before we insert
  await usersDb.ensureIndex({ fieldName: "email", unique: true });
  await sessionsDb.ensureIndex({ fieldName: "courseId" });
}
