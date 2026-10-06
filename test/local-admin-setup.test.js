import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthController } from '../server/controllers/auth-controller.js';
import { verifyPassword } from '../server/lib/auth.js';

function makeHarness({ secureCookies = false } = {}) {
  const users = [];
  const sessions = [];
  const repository = {
    async countUsers() { return users.length; },
    async findUserByUsername(username) { return users.find((user) => user.username.toLowerCase() === username.toLowerCase()) || null; },
    async createUser(input) { const user = { id: 'local-admin-id', ...input }; users.push(user); return user; },
    async createSession(userId, digest, expiresAt) { sessions.push({ userId, digest, expiresAt }); },
  };
  const config = { secureCookies, sessionDays: 14 };
  const auth = createAuthController(repository, config);
  const response = { headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  return { auth, repository, response, sessions, users };
}

const localRequest = { socket: { remoteAddress: '127.0.0.1' } };
const remoteRequest = { socket: { remoteAddress: '203.0.113.15' } };

test('local first-admin setup is available only on loopback for an empty local store', async () => {
  const { auth, users } = makeHarness();
  assert.deepEqual(await auth.localSetupStatus(localRequest), { available: true });
  assert.deepEqual(await auth.localSetupStatus(remoteRequest), { available: false });
  assert.deepEqual(await auth.localSetupStatus({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), { available: true });

  await assert.rejects(auth.setupLocalAdmin({ username: 'admin', password: 'bad' }, localRequest, {}), /4–200/);
  await assert.rejects(auth.setupLocalAdmin({ username: 'bad name', password: 'a-long-enough-password' }, localRequest, {}), /Username must/);
  await assert.rejects(auth.setupLocalAdmin({ username: 'admin', password: 'a-long-enough-password' }, remoteRequest, {}), (error) => error.status === 404);
  assert.equal(users.length, 0);
});

test('local first-admin setup hashes the password, starts a session, and closes after creation', async () => {
  const { auth, response, sessions, users } = makeHarness();
  const password = 'local-test-passphrase';
  const user = await auth.setupLocalAdmin({ username: 'LocalAdmin', password }, localRequest, response);

  assert.equal(user.role, 'admin');
  assert.equal(user.username, 'LocalAdmin');
  assert.equal(await verifyPassword(password, users[0].passwordHash), true);
  assert.notEqual(users[0].passwordHash, password);
  assert.equal(sessions.length, 1);
  assert.match(response.headers['Set-Cookie'], /^mg_session=.*HttpOnly/);
  assert.deepEqual(await auth.localSetupStatus(localRequest), { available: false });
  await assert.rejects(auth.setupLocalAdmin({ username: 'SecondAdmin', password }, localRequest, response), (error) => error.status === 409);
  assert.equal(users.length, 1);
});

test('local first-admin setup is disabled when secure production cookies are required', async () => {
  const { auth } = makeHarness({ secureCookies: true });
  assert.deepEqual(await auth.localSetupStatus(localRequest), { available: false });
  await assert.rejects(auth.setupLocalAdmin({ username: 'LocalAdmin', password: 'a-long-enough-password' }, localRequest, {}), (error) => error.status === 404);
});
