// models/userModel.js
import Datastore from 'nedb-promises';
import bcrypt from 'bcrypt';
import path from 'path';
import { fileURLToPath } from 'url';

const SALT_ROUNDS = 12;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Class-based NeDB wrapper for the users collection.
 * Pass a filePath for persistent file-based storage (production/seed),
 * or omit it to get an isolated in-memory instance (unit/integration tests).
 */
export class UserModelClass {
  constructor(filePath) {
    this.db = filePath
      ? Datastore.create({ filename: filePath, autoload: true })
      : Datastore.create({ inMemoryOnly: true });
  }

  async create(user) {
    if (user.password) {
      user = { ...user, password: await bcrypt.hash(user.password, SALT_ROUNDS) };
    }
    return this.db.insert(user);
  }

  async verifyPassword(plainText, hash) {
    return bcrypt.compare(plainText, hash);
  }

  async findByEmail(email) {
    return this.db.findOne({ email });
  }

  async findById(id) {
    return this.db.findOne({ _id: id });
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
export const UserModel = new UserModelClass(
  process.env.NODE_ENV === 'test'
    ? undefined
    : path.join(__dirname, '../db/users.db')
);
