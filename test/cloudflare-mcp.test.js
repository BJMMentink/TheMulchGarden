import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare/src/index.js';

function createEnvironment() {
  let databaseReads = 0;
  const user = { id: 'owner-1', username: 'Ben', role: 'admin', password_hash: 'already-configured' };
  const DB = {
    prepare(query) {
      return {
        bind() {
          return {
            async first() { databaseReads += 1; return String(query).includes('FROM sessions') ? null : user; },
            async all() { databaseReads += 1; return { results: [] }; },
            async run() { databaseReads += 1; return { success: true }; },
          };
        },
      };
    },
  };
  return {
    env: { DB, MCP_TOKEN: 'test-token', MCP_USERNAME: 'Ben', FRONTEND_ORIGIN: 'https://themulchgarden.pages.dev' },
    get databaseReads() { return databaseReads; },
  };
}

function request(body, { origin, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  return new Request('https://api.example.test/mcp', { method: 'POST', headers, body: JSON.stringify(body) });
}

test('Cloudflare MCP rejects an untrusted Origin before touching account storage', async () => {
  const context = createEnvironment();
  const response = await worker.fetch(request({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
    origin: 'https://attacker.example', token: 'test-token',
  }), context.env);

  assert.equal(response.status, 403);
  assert.equal(context.databaseReads, 0);
});

test('Cloudflare MCP requires authentication for notifications', async () => {
  const context = createEnvironment();
  const response = await worker.fetch(request({ jsonrpc: '2.0', method: 'notifications/initialized' }, {
    origin: 'https://themulchgarden.pages.dev',
  }), context.env);
  const emptyBatchResponse = await worker.fetch(request([], { origin: 'https://themulchgarden.pages.dev' }), context.env);

  assert.equal(response.status, 401);
  assert.equal(emptyBatchResponse.status, 401);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://themulchgarden.pages.dev');
});

test('Cloudflare MCP rejects a non-matching bearer token', async () => {
  const context = createEnvironment();
  const response = await worker.fetch(request({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
    origin: 'https://themulchgarden.pages.dev', token: 'not-the-token',
  }), context.env);

  assert.equal(response.status, 401);
});

test('Cloudflare MCP handles mixed batches with the configured user and origin', async () => {
  const context = createEnvironment();
  const response = await worker.fetch(request([
    { jsonrpc: '2.0', id: 'first', method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 'last', method: 'tools/list' },
  ], { origin: 'https://themulchgarden.pages.dev', token: 'test-token' }), context.env);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://themulchgarden.pages.dev');
  assert.deepEqual(payload.map((item) => item.id), ['first', 'last']);
  assert.deepEqual(payload[0].result, {});
  assert.equal(payload[1].result.tools.length, 3);
});
