const SESSION_COOKIE = 'mg_session';
const DEFAULT_SESSION_DAYS = 14;
// Keep comfortably below Cloudflare Workers' 100,000-iteration PBKDF2 cap.
const PASSWORD_ITERATIONS = 50000;
const PASSWORD_KEY_BITS = 256;
const MAX_BODY_BYTES = 100000;
const MAX_ACCOUNTS = 2;

const SEEDED_INTERESTS = [
  { id: 'creator-nuxinor', name: 'Nuxinor', category: 'creator', rating: 5, source: 'seed' },
  { id: 'creator-luke-stephens', name: 'Luke Stephens', category: 'creator', rating: 5, source: 'seed' },
  { id: 'creator-asmongold', name: 'Asmongold', category: 'creator', rating: 5, source: 'seed' },
];

const DEFAULT_PROJECTS = [
  { id: 'project-saberdueler', name: 'SaberDueler', type: 'Personal', color: 'violet', todos: [{ id: 'todo-saberdueler-1', title: 'Define the next smallest playable slice', done: false }] },
  { id: 'project-gmche', name: 'GMCHE art class', type: 'Professional', color: 'green', todos: [{ id: 'todo-gmche-1', title: 'Prepare the next art class materials', done: false }] },
];

const DEFAULT_TODOS = [
  { id: 'todo-saberdueler-1', title: 'Define the next smallest playable slice', done: false, projectId: 'project-saberdueler', tags: ['next action'], addedBy: 'system', assignedTo: 'everyone', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'todo-gmche-1', title: 'Prepare the next art class materials', done: false, projectId: 'project-gmche', tags: ['next action'], addedBy: 'system', assignedTo: 'everyone', createdAt: '2026-01-01T00:00:00.000Z' },
];

const initialState = () => ({
  version: 1,
  onboarding: { completed: false, version: 0 },
  interests: SEEDED_INTERESTS.map((item) => ({ ...item })),
  projects: DEFAULT_PROJECTS.map((item) => ({ ...item, todos: item.todos.map((todo) => ({ ...todo })) })),
  todos: DEFAULT_TODOS.map((todo) => ({ ...todo, tags: [...todo.tags] })),
  feedback: [],
  memories: [],
});

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

function corsHeaders(request, env) {
  const configured = String(env.FRONTEND_ORIGIN || '').trim();
  const origin = request.headers.get('Origin');
  const allowed = configured && origin === configured ? origin : '';
  return allowed ? { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS', Vary: 'Origin' } : {};
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(request, env))) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie') || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value));
}

function tokenFrom(request) { return request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || cookies(request)[SESSION_COOKIE] || ''; }

function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', ''); }
function fromB64(value) { const normalized = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(normalized), (char) => char.charCodeAt(0)); }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return b64(bytes); }
async function digest(value) { return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
async function derive(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, PASSWORD_KEY_BITS));
}
async function createPasswordHash(password, enforcePolicy = true) {
  if (typeof password !== 'string' || password.length > 200 || (enforcePolicy && password.length < 4)) throw new Error('Password must be 4–200 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256:${PASSWORD_ITERATIONS}:${b64(salt)}:${b64(await derive(password, salt))}`;
}
async function hashPassword(password) { return createPasswordHash(password, true); }
async function hashBootstrapPassword(password) { return createPasswordHash(password, false); }
async function verifyPassword(password, encoded) {
  try {
    const [scheme, iterationText, saltText, keyText] = String(encoded).split(':');
    if (scheme !== 'pbkdf2-sha256') return false;
    const actual = await derive(typeof password === 'string' ? password : '', fromB64(saltText), Number(iterationText));
    const expected = fromB64(keyText);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < expected.length; index += 1) difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch { return false; }
}

function publicUser(user, token) { return { id: user.id, username: user.username, role: user.role || 'user', ...(token ? { token } : {}) }; }
function cookie(token, maxAge) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`; }
function expiredCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`; }
function userId() { return crypto.randomUUID(); }

async function ensureBootstrap(env) {
  const row = await env.DB.prepare('SELECT id, password_hash, role FROM users WHERE username = ? COLLATE NOCASE').bind('Ben').first();
  if (!row && (env.BOOTSTRAP_PASSWORD || env.BOOTSTRAP_PASSWORD_HASH)) {
    const id = userId();
    const passwordHash = env.BOOTSTRAP_PASSWORD ? await hashBootstrapPassword(env.BOOTSTRAP_PASSWORD) : env.BOOTSTRAP_PASSWORD_HASH;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, 'Ben', passwordHash, 'admin', new Date().toISOString()),
      env.DB.prepare('INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)').bind(id, JSON.stringify(initialState()), new Date().toISOString()),
    ]);
  } else if (row && env.BOOTSTRAP_PASSWORD && env.BOOTSTRAP_PASSWORD_HASH && row.password_hash === env.BOOTSTRAP_PASSWORD_HASH) {
    await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashBootstrapPassword(env.BOOTSTRAP_PASSWORD), row.id).run();
  }
}

async function currentUser(request, env) {
  const rawToken = tokenFrom(request);
  if (!rawToken) return null;
  const tokenDigest = await digest(rawToken);
  return env.DB.prepare('SELECT users.id, users.username, users.role FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.digest = ? AND sessions.expires_at > ?').bind(tokenDigest, Date.now()).first();
}

async function readJson(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  return text ? JSON.parse(text) : {};
}

async function login(request, env) {
  const body = await readJson(request);
  const user = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ? COLLATE NOCASE').bind(String(body.username || '').trim()).first();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) throw new Error('Username or password is incorrect.');
  const token = randomToken();
  const days = Number(env.SESSION_DAYS || DEFAULT_SESSION_DAYS);
  await env.DB.prepare('INSERT INTO sessions (digest, user_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), user.id, Date.now() + days * 86400000).run();
  return json({ user: publicUser(user, token) }, 200, { 'Set-Cookie': cookie(token, days * 86400) });
}

async function updateAccount(request, env, user) {
  const body = await readJson(request);
  const stored = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE id = ?').bind(user.id).first();
  if (!stored || !(await verifyPassword(body.currentPassword, stored.password_hash))) throw new Error('Current password is incorrect.');
  const username = String(body.username || '').trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw new Error('Username must be 3–32 letters, numbers, underscores, or hyphens.');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (existing && existing.id !== user.id) throw new Error('That username is already in use.');
  const passwordHash = body.newPassword ? await hashPassword(body.newPassword) : stored.password_hash;
  await env.DB.prepare('UPDATE users SET username = ?, password_hash = ? WHERE id = ?').bind(username, passwordHash, user.id).run();
  return json({ user: publicUser({ id: user.id, username }) });
}

async function appState(request, env, user) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT state_json FROM user_state WHERE user_id = ?').bind(user.id).first();
    const stored = row ? JSON.parse(row.state_json) : initialState();
    return json({ ...initialState(), ...stored, memories: Array.isArray(stored.memories) ? stored.memories : [] });
  }
  const body = await readJson(request);
  if (body.version !== 1 || !Array.isArray(body.interests) || !Array.isArray(body.projects)) throw new Error('Invalid application state.');
  await env.DB.prepare('INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at').bind(user.id, JSON.stringify(body), new Date().toISOString()).run();
  return json(body);
}

async function members(env) {
  const result = await env.DB.prepare('SELECT id, username FROM users ORDER BY username COLLATE NOCASE').all();
  return json({ members: result.results || [] });
}

function requireAdmin(user) {
  if (user.role !== 'admin') throw Object.assign(new Error('Administrator access required.'), { status: 403 });
}

async function adminUsers(request, env, user) {
  requireAdmin(user);
  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT id, username, role, created_at AS createdAt FROM users ORDER BY username COLLATE NOCASE').all();
    return json({ users: result.results || [] });
  }
  const body = await readJson(request);
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first();
  if (Number(count?.count || 0) >= MAX_ACCOUNTS) throw new Error(`This private app is limited to ${MAX_ACCOUNTS} accounts.`);
  const username = String(body.username || '').trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw new Error('Username must be 3–32 letters, numbers, underscores, or hyphens.');
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (existing) throw new Error('That username is already in use.');
  const password = String(body.password || '');
  const passwordHash = await hashPassword(password);
  const role = body.role === 'admin' ? 'admin' : 'user';
  const id = userId();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, username, passwordHash, role, now),
    env.DB.prepare('INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)').bind(id, JSON.stringify(initialState()), now),
  ]);
  return json({ user: publicUser({ id, username, role }) }, 201);
}

async function route(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return new Response('The Mulch Garden API', { status: 200 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  await ensureBootstrap(env);
  if (request.method === 'GET' && url.pathname === '/api/auth/me') return json({ user: await currentUser(request, env).then((user) => user ? publicUser(user) : null) });
  if (request.method === 'POST' && url.pathname === '/api/auth/login') return login(request, env);
  const user = await currentUser(request, env);
  if (!user) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = tokenFrom(request); if (token) await env.DB.prepare('DELETE FROM sessions WHERE digest = ?').bind(await digest(token)).run();
    return json({ ok: true }, 200, { 'Set-Cookie': expiredCookie() });
  }
  if (request.method === 'PATCH' && url.pathname === '/api/auth/me') return updateAccount(request, env, user);
  if (request.method === 'GET' && url.pathname === '/api/members') return members(env);
  if (url.pathname === '/api/admin/users' && ['GET', 'POST'].includes(request.method)) return adminUsers(request, env, user);
  if (url.pathname === '/api/state' && ['GET', 'PUT'].includes(request.method)) return appState(request, env, user);
  return json({ error: 'Not found.' }, 404);
}

export default {
  async fetch(request, env) {
    try { return withCors(await route(request, env), request, env); }
    catch (error) { return withCors(json({ error: error.message || 'Request failed.' }, error.status || (error.message?.includes('required') ? 401 : 400)), request, env); }
  },
};
