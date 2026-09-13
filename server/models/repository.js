import { randomUUID } from 'node:crypto';
import { createInitialState } from '../../src/default-data.js';
import { BOOTSTRAP_ACCOUNT } from '../bootstrap.js';
import { JsonStore } from '../lib/json-store.js';

export class Repository {
  constructor(directory) { this.users = new JsonStore(directory); this.sessions = new JsonStore(directory); this.userData = new JsonStore(directory); }
  async ensureBootstrapAccount() {
    const users = await this.users.read('users', []);
    if (BOOTSTRAP_ACCOUNT.passwordHash && !users.some((user) => user.username?.toLowerCase() === BOOTSTRAP_ACCOUNT.username.toLowerCase())) {
      users.push({ id: randomUUID(), username: BOOTSTRAP_ACCOUNT.username, passwordHash: BOOTSTRAP_ACCOUNT.passwordHash, createdAt: new Date().toISOString() });
      await this.users.write('users', users);
    }
  }
  async findUserByUsername(username) { return (await this.users.read('users', [])).find((user) => user.username?.toLowerCase() === username.toLowerCase()) || null; }
  async listPublicUsers() { return (await this.users.read('users', [])).filter((user) => user.username).map(({ id, username }) => ({ id, username })).sort((left, right) => left.username.localeCompare(right.username)); }
  async countUsers() { return (await this.users.read('users', [])).filter((user) => user.username).length; }
  async updateUser(userId, changes) {
    const users = await this.users.read('users', []); const index = users.findIndex((user) => user.id === userId);
    if (index < 0) throw new Error('User not found.');
    users[index] = { ...users[index], ...changes }; await this.users.write('users', users); return users[index];
  }
  async createUser({ username, passwordHash }) {
    const users = await this.users.read('users', []);
    const user = { id: randomUUID(), username, passwordHash, createdAt: new Date().toISOString() };
    users.push(user); await this.users.write('users', users); await this.userData.write(`user-${user.id}`, createInitialState()); return user;
  }
  async getState(userId) { const stored = await this.userData.read(`user-${userId}`, createInitialState()); return { ...createInitialState(), ...stored, memories: Array.isArray(stored.memories) ? stored.memories : [] }; }
  async saveState(userId, state) { await this.userData.write(`user-${userId}`, state); return state; }
  async createSession(userId, digest, expiresAt) { const sessions = await this.sessions.read('sessions', []); sessions.push({ digest, userId, expiresAt }); await this.sessions.write('sessions', sessions); }
  async findSession(digest) { return (await this.sessions.read('sessions', [])).find((item) => item.digest === digest && item.expiresAt > Date.now()) || null; }
  async deleteSession(digest) { const sessions = await this.sessions.read('sessions', []); await this.sessions.write('sessions', sessions.filter((item) => item.digest !== digest)); }
}
