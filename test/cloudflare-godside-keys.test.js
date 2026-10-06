import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import worker from '../cloudflare/src/index.js';

const tokenDigest = (token) => createHash('sha256').update(token).digest('base64url');

function createEnvironment() {
  const users = [
    { id: 'user-1', username: 'Member', role: 'user', password_hash: 'configured' },
    { id: 'user-2', username: 'Admin', role: 'admin', password_hash: 'configured' },
  ];
  const sessions = new Map([
    [tokenDigest('member-one'), users[0]],
    [tokenDigest('admin-two'), users[1]],
  ]);
  const keys = new Map();
  const keyFor = (userId, provider) => `${userId}:${provider}`;
  const DB = {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async first() {
              if (query.includes('FROM sessions')) return sessions.get(values[0]) || null;
              if (query.includes('FROM users')) return users[1];
              if (query.includes('FROM godside_provider_keys')) return keys.get(keyFor(values[0], values[1])) || null;
              return null;
            },
            async all() {
              if (query.includes('FROM godside_provider_keys')) {
                return { results: [...keys.values()].filter((record) => record.user_id === values[0]).map(({ provider, envelope_json }) => ({ provider, envelope_json })) };
              }
              return { results: [] };
            },
            async run() {
              if (query.includes('INSERT INTO godside_provider_keys')) {
                const [userId, provider, envelopeJson, updatedAt] = values;
                keys.set(keyFor(userId, provider), { user_id: userId, provider, envelope_json: envelopeJson, updated_at: updatedAt });
              } else if (query.includes('DELETE FROM godside_provider_keys')) {
                keys.delete(keyFor(values[0], values[1]));
              } else if (query.includes('UPDATE godside_provider_keys')) {
                const [envelopeJson, updatedAt, userId, provider] = values;
                const record = keys.get(keyFor(userId, provider));
                if (record) keys.set(keyFor(userId, provider), { ...record, envelope_json: envelopeJson, updated_at: updatedAt });
              }
              return { success: true };
            },
          };
        },
      };
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return { success: true };
    },
  };
  return { env: { DB, GODSIDE_KEY_ENCRYPTION_SECRET: randomBytes(32).toString('base64url') }, keys };
}

async function call(env, method, path, token, body) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await worker.fetch(new Request(`https://api.example.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  return { response, payload: await response.json() };
}

test('Cloudflare key vault enforces authentication and per-user encrypted storage', async () => {
  const { env, keys } = createEnvironment();
  assert.equal((await call(env, 'GET', '/api/godside/keys')).response.status, 401);

  const originalKey = 'key-example-do-not-return-xyz789';
  const saved = await call(env, 'PUT', '/api/godside/keys', 'member-one', { provider: 'googleMapsApiKey', key: originalKey });
  assert.equal(saved.response.status, 200);
  assert.equal(JSON.stringify(saved.payload).includes(originalKey), false);
  assert.notEqual(JSON.parse(keys.get('user-1:googleMapsApiKey').envelope_json).ciphertext, originalKey);

  const memberStatus = await call(env, 'GET', '/api/godside/keys', 'member-one');
  const adminStatus = await call(env, 'GET', '/api/godside/keys', 'admin-two');
  assert.equal(memberStatus.payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, true);
  assert.equal(memberStatus.payload.providers.find((provider) => provider.id === 'googleMapsApiKey').enabled, false);
  assert.equal(adminStatus.payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, false);
  assert.equal(JSON.stringify(memberStatus.payload).includes(originalKey), false);

  assert.deepEqual((await call(env, 'GET', '/api/godside/runtime', 'member-one')).payload.keys, {});
  await call(env, 'PATCH', '/api/godside/keys/googleMapsApiKey', 'member-one', { enabled: true });
  const runtime = await call(env, 'GET', '/api/godside/runtime', 'member-one');
  assert.equal(runtime.payload.keys.googleMapsApiKey, originalKey);
  assert.equal(JSON.stringify(runtime.payload).includes('openAiApiKey'), false);

  await call(env, 'DELETE', '/api/godside/keys/googleMapsApiKey', 'admin-two');
  assert.equal((await call(env, 'GET', '/api/godside/keys', 'member-one')).payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, true);
  await call(env, 'DELETE', '/api/godside/keys/googleMapsApiKey', 'member-one');
  assert.equal((await call(env, 'GET', '/api/godside/keys', 'member-one')).payload.providers.find((provider) => provider.id === 'googleMapsApiKey').configured, false);
});

test('Cloudflare key vault stays disabled when its encryption secret is missing', async () => {
  const { env } = createEnvironment();
  delete env.GODSIDE_KEY_ENCRYPTION_SECRET;
  const result = await call(env, 'GET', '/api/godside/keys', 'member-one');
  assert.equal(result.response.status, 503);
  assert.match(result.payload.error, /not configured/);
});

test('Cloudflare key-vault CORS allows its authenticated delete method', async () => {
  const { env } = createEnvironment();
  const response = await worker.fetch(new Request('https://api.example.test/api/godside/keys/googleMapsApiKey', {
    method: 'OPTIONS',
    headers: { Origin: 'https://themulchgarden.pages.dev' },
  }), { ...env, FRONTEND_ORIGIN: 'https://themulchgarden.pages.dev' });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('Access-Control-Allow-Methods') || '', /PATCH/);
});

test('Cloudflare POWER UP uses the native registry and saves/removes each member key encrypted', async () => {
  const { env, keys } = createEnvironment();
  const unauthenticated = await call(env, 'GET', '/api/setup/status');
  assert.equal(unauthenticated.response.status, 401);

  const status = await call(env, 'GET', '/api/setup/status', 'member-one');
  assert.equal(status.payload.keys.length, 8);
  assert.equal(status.payload.store, 'mulch-garden-account');

  const value = 'AIza-cloud-native-private-key-12345';
  const saved = await call(env, 'POST', '/api/setup/keys', 'member-one', { GOOGLE_MAPS_API_KEY: value });
  assert.equal(saved.response.status, 200);
  assert.deepEqual(saved.payload.saved, ['GOOGLE_MAPS_API_KEY']);
  assert.equal(JSON.stringify(saved.payload).includes(value), false);
  assert.notEqual(JSON.parse(keys.get('user-1:googleMapsApiKey').envelope_json).ciphertext, value);
  assert.equal(saved.payload.status.keys.find((key) => key.id === 'google-maps').set, true);

  const runtime = await call(env, 'GET', '/api/godside/runtime', 'member-one');
  assert.equal(runtime.payload.keys.googleMapsApiKey, value);
  assert.equal((await call(env, 'GET', '/api/godside/runtime', 'admin-two')).payload.keys.googleMapsApiKey, undefined);

  const removed = await call(env, 'POST', '/api/setup/keys', 'member-one', { GOOGLE_MAPS_API_KEY: null });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.payload.status.keys.find((key) => key.id === 'google-maps').set, false);
  assert.equal(keys.has('user-1:googleMapsApiKey'), false);
});

test('Cloudflare exposes the same-origin app route only to an authenticated member', async () => {
  const { env } = createEnvironment();
  assert.equal((await call(env, 'GET', '/api/godside/app-config')).response.status, 401);
  const member = await call(env, 'GET', '/api/godside/app-config', 'member-one');
  assert.deepEqual(member.payload, { available: true, url: '/godseye/?embed=1&render=balanced' });
});
