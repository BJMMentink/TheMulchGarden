import { randomUUID } from 'node:crypto';

const PROTOCOL_VERSION = '2025-03-26';
const SERVER_INFO = Object.freeze({ name: 'mulch-garden', version: '0.1.0' });

const tools = Object.freeze([
  {
    name: 'get_project_context',
    description: 'Return a concise, read-only overview of the Mulch Garden project and its available workspaces.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'list_board_projects',
    description: 'List the projects currently visible on the authenticated user\'s Mulch Garden board.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'list_admin_pages',
    description: 'List the quick-cycle pages available in the Mulch Garden administrator view.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
]);

const adminPages = Object.freeze([
  { id: 'landing', label: 'Home', description: 'The garden landing page.' },
  { id: 'portfolio', label: 'Portfolio', description: 'Projects and working rhythm.' },
  { id: 'board', label: 'Board', description: 'Projects, groups, ideas, and files.' },
  { id: 'requests', label: 'Requests', description: 'Feature requests and bug reports.' },
  { id: 'about', label: 'About', description: 'Builder profile and context.' },
  { id: 'account', label: 'Account', description: 'Profile, security, and account settings.' },
  { id: 'mcp', label: 'MCP', description: 'Connected assistant tools and server status.' },
]);

function json(response, status, payload, extraHeaders = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  response.end(JSON.stringify(payload));
}

function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function readBody(request, limit) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > limit) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  }
  if (!body) throw Object.assign(new Error('A JSON-RPC message is required.'), { status: 400 });
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error('Request body must contain valid JSON.'), { status: 400 }); }
}

function textResult(payload) {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload };
}

function requestOriginAllowed(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && allowedOrigins.has(parsed.origin);
  } catch { return false; }
}

function hasRpcId(message) {
  return Object.prototype.hasOwnProperty.call(message, 'id');
}

function isRpcResponse(message) {
  return message && message.jsonrpc === '2.0' && hasRpcId(message)
    && (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'));
}

export function createMcpHandler({ auth, app, bodyLimit, allowedOrigins = [] }) {
  const originAllowList = new Set(allowedOrigins);

  async function authorize(request) {
    const user = await auth.mcpUser(request);
    if (!user) throw Object.assign(new Error('MCP authentication required.'), { status: 401 });
    return user;
  }

  async function callTool(name, user) {
    if (name === 'get_project_context') {
      return textResult({
        name: 'The Mulch Garden',
        purpose: 'A private productivity and information hub for projects, interests, todos, games, and integrations.',
        authenticatedAs: user.username,
        availablePages: adminPages,
        mcpEndpoint: '/mcp',
      });
    }
    if (name === 'list_board_projects') return textResult({ projects: await app.listBoardProjects(user) });
    if (name === 'list_admin_pages') return textResult({ pages: adminPages });
    throw Object.assign(new Error(`Unknown MCP tool: ${name}`), { code: 'MCP_UNKNOWN_TOOL' });
  }

  async function processMessage(message, user) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
      return rpcError(null, -32600, 'Invalid JSON-RPC request.');
    }
    if (isRpcResponse(message)) return null;
    if (typeof message.method !== 'string') return rpcError(hasRpcId(message) ? message.id : null, -32600, 'Invalid JSON-RPC request.');
    if (!hasRpcId(message)) return null;

    if (message.method === 'initialize') {
      return rpcResult(message.id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO, instructions: 'Use this server for read-only Mulch Garden context. Every tool call is scoped to the authenticated user and should be explained to the user when it is part of a larger workflow.' });
    }
    if (message.method === 'ping') return rpcResult(message.id, {});
    if (message.method === 'tools/list') return rpcResult(message.id, { tools });
    if (message.method === 'tools/call') {
      try {
        return rpcResult(message.id, await callTool(message.params?.name, user));
      } catch (error) {
        return rpcError(message.id, error.code === 'MCP_UNKNOWN_TOOL' ? -32602 : -32603, error.message || 'Tool call failed.');
      }
    }
    return rpcError(message.id, -32601, `Method not found: ${message.method}`);
  }

  return async function handleMcp(request, response) {
    if (!requestOriginAllowed(request, originAllowList)) {
      return json(response, 403, { error: 'Origin is not allowed.' });
    }
    if (request.method === 'GET') {
      return json(response, 405, { error: 'MCP uses POST for JSON-RPC messages.' }, { Allow: 'POST' });
    }
    if (request.method !== 'POST') return json(response, 405, { error: 'Method Not Allowed' }, { Allow: 'POST' });
    let payload;
    try {
      payload = await readBody(request, bodyLimit);
      const user = await authorize(request);
      if (Array.isArray(payload) && payload.length === 0) return json(response, 200, rpcError(null, -32600, 'An empty JSON-RPC batch is invalid.'));
      const batch = Array.isArray(payload);
      const messages = batch ? payload : [payload];
      const replies = [];
      for (const message of messages) {
        const reply = await processMessage(message, user);
        if (reply) replies.push(reply);
      }
      if (replies.length === 0) { response.writeHead(202); response.end(); return; }
      return json(response, 200, batch ? replies : replies[0]);
    } catch (error) {
      const status = error.status || 400;
      const message = Array.isArray(payload) ? null : payload;
      if (message && hasRpcId(message)) return json(response, status, rpcError(message.id, -32000, error.message || 'MCP request failed.'));
      return json(response, status, { error: error.message || 'MCP request failed.' });
    }
  };
}

export { adminPages, tools };
