import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createMcpHandler } from '../server/mcp.js';

async function startMcpServer({ authenticated = true } = {}) {
  let authorizationChecks = 0;
  const handleMcp = createMcpHandler({
    auth: {
      async mcpUser(request) {
        authorizationChecks += 1;
        return authenticated && request.headers.authorization === 'Bearer test-token' ? { username: 'owner' } : null;
      },
    },
    app: { async listBoardProjects(user) { return [{ id: 'project-1', owner: user.username }]; } },
    bodyLimit: 20_000,
    allowedOrigins: ['http://127.0.0.1:4173'],
  });
  const server = createServer((request, response) => { void handleMcp(request, response); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    get authorizationChecks() { return authorizationChecks; },
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function post(server, body, headers = {}) {
  return fetch(server.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

test('MCP rejects untrusted browser origins before checking credentials', async (t) => {
  const server = await startMcpServer();
  t.after(() => server.close());

  const response = await post(server, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
    Authorization: 'Bearer test-token',
    Origin: 'https://attacker.example',
  });

  assert.equal(response.status, 403);
  assert.equal(server.authorizationChecks, 0);
});

test('MCP authenticates notifications before returning an empty accepted response', async (t) => {
  const server = await startMcpServer();
  t.after(() => server.close());

  const rejected = await post(server, { jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(rejected.status, 401);
  const rejectedEmptyBatch = await post(server, []);
  assert.equal(rejectedEmptyBatch.status, 401);

  const accepted = await post(server, { jsonrpc: '2.0', method: 'notifications/initialized' }, { Authorization: 'Bearer test-token' });
  assert.equal(accepted.status, 202);
  assert.equal(await accepted.text(), '');
});

test('MCP handles mixed JSON-RPC batches and omits notification replies', async (t) => {
  const server = await startMcpServer();
  t.after(() => server.close());

  const response = await post(server, [
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 3, method: 'tools/list' },
  ], { Authorization: 'Bearer test-token' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.map((item) => item.id), [1, 3]);
  assert.deepEqual(payload[0].result, {});
  assert.equal(payload[1].result.tools.length, 3);
  assert.equal(server.authorizationChecks, 1);
});

test('MCP returns an invalid-request response for an empty batch', async (t) => {
  const server = await startMcpServer();
  t.after(() => server.close());

  const response = await post(server, [], { Authorization: 'Bearer test-token' });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.error.code, -32600);
});

test('MCP tool-call errors use JSON-RPC error responses', async (t) => {
  const server = await startMcpServer();
  t.after(() => server.close());

  const response = await post(server, { jsonrpc: '2.0', id: 'bad-tool', method: 'tools/call', params: { name: 'write_everything' } }, {
    Authorization: 'Bearer test-token',
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.id, 'bad-tool');
  assert.equal(payload.error.code, -32602);
});
