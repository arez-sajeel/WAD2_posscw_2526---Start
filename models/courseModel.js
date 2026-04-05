// models/courseModel.js
import Datastore from 'nedb-promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Class-based NeDB wrapper for the courses collection.
 * Pass a filePath for persistent file-based storage (production/seed),
 * or omit it to get an isolated in-memory instance (unit/integration tests).
 */
export class CourseModelClass {
  constructor(filePath) {
    this.db = filePath
      ? Datastore.create({ filename: filePath, autoload: true })
      : Datastore.create({ inMemoryOnly: true });
  }

  async create(course) {
    return this.db.insert(course);
  }

  async findById(id) {
    return this.db.findOne({ _id: id });
  }

  async list(filter = {}) {
    return this.db.find(filter);
  }

  async update(id, patch) {
    await this.db.update({ _id: id }, { $set: patch });
    return this.findById(id);
  }

  // WAD2 standard remove: delete one document by its _id
  async removeById(id) {
    return this.db.remove({ _id: id }, {});
  }

  // WAD2 standard remove-all: wipe the entire collection (seed / test reset)
  async removeAll() {
    return this.db.remove({}, { multi: true });
  }

  // Convenience count — mirrors db.count(filter)
  async count(filter = {}) {
    return this.db.count(filter);
  }
}

// Default file-based singleton — imported by controllers, services, and tests
export const CourseModel = new CourseModelClass(
  process.env.NODE_ENV === 'test'
    ? undefined
    : path.join(__dirname, '../db/courses.db')
);
