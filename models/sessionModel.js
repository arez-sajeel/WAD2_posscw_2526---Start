// models/sessionModel.js
import Datastore from 'nedb-promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Class-based NeDB wrapper for the sessions collection.
 * Pass a filePath for persistent file-based storage (production/seed),
 * or omit it to get an isolated in-memory instance (unit/integration tests).
 */
export class SessionModelClass {
  constructor(filePath) {
    this.db = filePath
      ? Datastore.create({ filename: filePath, autoload: true })
      : Datastore.create({ inMemoryOnly: true });
  }

  async create(session) {
    return this.db.insert(session);
  }

  async listByCourse(courseId) {
    return this.db.find({ courseId }).sort({ startDateTime: 1 });
  }

  async findById(id) {
    return this.db.findOne({ _id: id });
  }

  /**
   * Attempts to reserve one seat without allowing bookedCount to move past
   * capacity. The query is conditional, so concurrent requests can race for
   * the final place but only one update will succeed.
   */
  async reserveSeat(id, userId = null) {
    const session = await this.findById(id);
    if (!session) {
      return null;
    }

    const query = {
      _id: id,
      $or: [
        { bookedCount: { $lt: session.capacity } },
        { bookedCount: { $exists: false } },
      ],
    };

    const updateOp = { $inc: { bookedCount: 1 } };
    if (userId) {
      updateOp.$addToSet = { participants: userId };
    }

    const numAffected = await this.db.update(query, updateOp);
    if (numAffected === 0) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Atomically adjusts bookedCount using NeDB's $inc operator, which
   * performs the increment directly at the database level without first
   * reading the value into server memory.
   *
   * When a userId is supplied:
   *  - booking  (delta > 0): $addToSet ensures the user is appended to the
   *    participants array exactly once — safe even under concurrent requests.
   *  - cancelling (delta < 0): $pull removes the user from participants.
   *
   * This eliminates the read-modify-write race condition present in
   * incrementBookedCount where two concurrent requests could read the same
   * bookedCount value, both increment it in memory, and both write back the
   * same result — effectively losing one of the increments.
   */
  async adjustCapacity(id, delta, userId = null) {
    const updateOp = { $inc: { bookedCount: delta } };
    if (userId && delta > 0) {
      updateOp.$addToSet = { participants: userId };
    } else if (userId && delta < 0) {
      updateOp.$pull = { participants: userId };
    }
    await this.db.update({ _id: id }, updateOp);
    return this.findById(id);
  }

  // WAD2 standard find-all with optional filter: {}
  async list(filter = {}) {
    return this.db.find(filter);
  }

  // WAD2 standard update: patch any fields by _id
  async update(id, patch) {
    await this.db.update({ _id: id }, { $set: patch });
    return this.findById(id);
  }

  // Bulk-delete all sessions belonging to a course (WAD2 multi-remove pattern)
  async removeByCourse(courseId) {
    return this.db.remove({ courseId }, { multi: true });
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
export const SessionModel = new SessionModelClass(
  process.env.NODE_ENV === 'test'
    ? undefined
    : path.join(__dirname, '../db/sessions.db')
);
