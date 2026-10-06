import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { createGodsideKeysController } from '../server/controllers/godside-keys-controller.js';
import { createRouter } from '../server/router.js';

const encryptionSecret = randomBytes(32).toString('base64url');

function createHarness() {
  const records = new Map();
  const identityFor = (userId) => {
    if (!records.has(userId)) records.set(userId, new Map());
    return records.get(userId);
  };
  const repository = {
    async listGodsideKeys(userId) {
      return [...identityFor(userId)].map(([provider, envelope]) => ({ provider, envelope }));
    },
    async saveGodsideKey(userId, provider, envelope) {
      identityFor(userId).set(provider, envelope);
    },
    async setGodsideKeyEnabled(userId, provider, enabled) {
      const envelope = identityFor(userId).get(provider);
      if (!envelope) throw Object.assign(new Error('That provider key is not saved.'), { status: 404 });
      identityFor(userId).set(provider, { ...envelope, enabled });
    },
    async deleteGodsideKey(userId, provider) {
      identityFor(userId).delete(provider);
    },
  };
  const controller = createGodsideKeysController(repository, encryptionSecret);
  const route = createRouter({
    auth: {},
    app: {
      async requireUser(request) {
        const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
        if (token === 'member-one') return { id: 'user-1', role: 'user' };
        if (token === 'admin-two') return { id: 'user-2', role: 'admin' };
        throw Object.assign(new Error('Authentication required.'), { status: 401 });
      },
    },
    bodyLimit: 100_000,
    godsideKeys: controller,
  });
  return { route, records };
}

async function call(route, method, path, { token = '', body } = {}) {
  const request = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  request.url = path;
  request.method = method;
  request.headers = token ? { authorization: `Bearer ${token}` } : {};
  const response = {
    status: 0,
    writeHead(status) { this.status = status; },
    end(payload) { this.payload = JSON.parse(payload); },
  };
  await route(request, response);
  return response;
}

test('local Godside key routes require a session and keep encrypted records private per user', async () => {
  const { route, records } = createHarness();
  const denied = await call(route, 'GET', '/api/godside/keys');
  assert.equal(denied.status, 401);

  const originalKey = 'key-example-do-not-return-abc123';
  const saved = await call(route, 'PUT', '/api/godside/keys', {
    token: 'member-one',
    body: { provider: 'googleMapsApiKey', key: originalKey },
  });
  assert.equal(saved.status, 200);
  assert.equal(JSON.stringify(saved.payload).includes(originalKey), false);
  assert.notEqual(records.get('user-1').get('googleMapsApiKey').ciphertext, originalKey);

  const memberStatus = await call(route, 'GET', '/api/godside/keys', { token: 'member-one' });
  const adminStatus = await call(route, 'GET', '/api/godside/keys', { token: 'admin-two' });
  assert.equal(memberStatus.payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, true);
  assert.equal(memberStatus.payload.providers.find((provider) => provider.id === 'googleMapsApiKey').enabled, false);
  assert.equal(adminStatus.payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, false);
  assert.equal(JSON.stringify(memberStatus.payload).includes(originalKey), false);

  const disabledRuntime = await call(route, 'GET', '/api/godside/runtime', { token: 'member-one' });
  assert.deepEqual(disabledRuntime.payload.keys, {});
  await call(route, 'PATCH', '/api/godside/keys/googleMapsApiKey', { token: 'member-one', body: { enabled: true } });
  const enabledRuntime = await call(route, 'GET', '/api/godside/runtime', { token: 'member-one' });
  assert.equal(enabledRuntime.payload.keys.googleMapsApiKey, originalKey);
  assert.equal(JSON.stringify(enabledRuntime.payload).includes('openAiApiKey'), false);

  await call(route, 'DELETE', '/api/godside/keys/googleMapsApiKey', { token: 'admin-two' });
  assert.equal((await call(route, 'GET', '/api/godside/keys', { token: 'member-one' })).payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, true);
  await call(route, 'DELETE', '/api/godside/keys/googleMapsApiKey', { token: 'member-one' });
  assert.equal((await call(route, 'GET', '/api/godside/keys', { token: 'member-one' })).payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, false);
});
