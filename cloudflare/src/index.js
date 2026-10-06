import { decryptGodsideKey, encryptGodsideKey, godsideKeyStatuses, normalizeGodsideKey, validateGodsideProvider, GODSIDE_PROVIDERS } from '../../src/godside-crypto.js';
import { encryptGodseyeSetupUpdates, godseyeSetupStatus } from '../../src/godside-setup.js';

const SESSION_COOKIE = 'mg_session';
const DEFAULT_SESSION_DAYS = 14;
// Keep comfortably below Cloudflare Workers' 100,000-iteration PBKDF2 cap.
const PASSWORD_ITERATIONS = 50000;
const PASSWORD_KEY_BITS = 256;
const MIN_PASSWORD_LENGTH = 12;
const MAX_BODY_BYTES = 100000;
// One owner/admin plus up to three invited members matches the small private
// audience this app is designed for without growing account surface area.
const MAX_ACCOUNTS = 4;
const CHAT_MAX_MESSAGE_LENGTH = 280;
const CHAT_MAX_MESSAGES = 100;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const MCP_PROTOCOL_VERSION = '2025-03-26';
const MCP_ADMIN_PAGES = Object.freeze([
  { id: 'landing', label: 'Home', description: 'The garden landing page.' },
  { id: 'portfolio', label: 'Portfolio', description: 'Projects and working rhythm.' },
  { id: 'board', label: 'Board', description: 'Projects, groups, ideas, and files.' },
  { id: 'requests', label: 'Requests', description: 'Feature requests and bug reports.' },
  { id: 'about', label: 'About', description: 'Builder profile and context.' },
  { id: 'account', label: 'Account', description: 'Profile, security, and account settings.' },
  { id: 'mcp', label: 'MCP', description: 'Connected assistant tools and server status.' },
]);
const MCP_TOOLS = Object.freeze([
  { name: 'get_project_context', description: 'Return a concise, read-only overview of the Mulch Garden project and its available workspaces.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'list_board_projects', description: 'List the projects currently visible on the authenticated user\'s Mulch Garden board.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
  { name: 'list_admin_pages', description: 'List the quick-cycle pages available in the Mulch Garden administrator view.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false } },
]);

const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
});

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

const initialGameState = () => ({ version: 1, currentRound: 0, questionIndex: 0, roundQuestionIds: [], answers: [], completedRounds: 0 });

const initialState = () => ({
  version: 1,
  onboarding: { completed: false, version: 0 },
  interests: SEEDED_INTERESTS.map((item) => ({ ...item })),
  projects: DEFAULT_PROJECTS.map((item) => ({ ...item, todos: item.todos.map((todo) => ({ ...todo })) })),
  todos: DEFAULT_TODOS.map((todo) => ({ ...todo, tags: [...todo.tags] })),
  feedback: [],
  memories: [],
  board: { githubProfiles: [], folders: [{ id: 'board-folder-inbox', name: 'Inbox' }], projects: [], groups: [], posts: [], replies: [], ideas: [] },
  games: { getToKnowMe: initialGameState() },
});

const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

function corsHeaders(request, env) {
  const configured = String(env.FRONTEND_ORIGIN || '').trim();
  const origin = request.headers.get('Origin');
  const allowed = configured && origin === configured ? origin : '';
  return allowed ? { 'Access-Control-Allow-Origin': allowed, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Protocol-Version', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', Vary: 'Origin' } : {};
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
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
async function timingSafeSecretEquals(provided, expected) {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(String(provided || ''))),
    crypto.subtle.digest('SHA-256', encoder.encode(String(expected || ''))),
  ]);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
  const left = new Uint8Array(providedHash);
  const right = new Uint8Array(expectedHash);
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}
async function derive(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, PASSWORD_KEY_BITS));
}
async function createPasswordHash(password, enforcePolicy = true) {
  if (typeof password !== 'string' || password.length > 200 || (enforcePolicy && password.length < MIN_PASSWORD_LENGTH)) throw new Error(`Password must be ${MIN_PASSWORD_LENGTH}–200 characters.`);
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

function publicUser(user) { return { id: user.id, username: user.username, role: user.role || 'user' }; }
function cookie(token, maxAge) { return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`; }
function expiredCookie() { return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`; }
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

function godsideEncryptionSecret(env) {
  if (!env.GODSIDE_KEY_ENCRYPTION_SECRET) throw Object.assign(new Error('Secure key storage is not configured.'), { status: 503 });
  return env.GODSIDE_KEY_ENCRYPTION_SECRET;
}

async function godsideKeyStatus(env, user) {
  godsideEncryptionSecret(env);
  const result = await env.DB.prepare('SELECT provider, envelope_json FROM godside_provider_keys WHERE user_id = ?').bind(user.id).all();
  return json({ providers: godsideKeyStatuses(result.results || []) });
}

async function godseyePowerUpStatus(env, user) {
  godsideEncryptionSecret(env);
  const result = await env.DB.prepare('SELECT provider, envelope_json FROM godside_provider_keys WHERE user_id = ?').bind(user.id).all();
  return json(godseyeSetupStatus(result.results || []));
}

async function saveGodseyePowerUpKeys(request, env, user) {
  const secret = godsideEncryptionSecret(env);
  const updates = await readJson(request);
  const operations = await encryptGodseyeSetupUpdates(updates, secret, user.id);
  const statements = operations.map((operation) => operation.envelope
    ? env.DB.prepare(`INSERT INTO godside_provider_keys (user_id, provider, envelope_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET envelope_json = excluded.envelope_json, updated_at = excluded.updated_at`)
      .bind(user.id, operation.provider, JSON.stringify(operation.envelope), new Date().toISOString())
    : env.DB.prepare('DELETE FROM godside_provider_keys WHERE user_id = ? AND provider = ?')
      .bind(user.id, operation.provider));
  await env.DB.batch(statements);
  const stored = await env.DB.prepare('SELECT provider, envelope_json FROM godside_provider_keys WHERE user_id = ?').bind(user.id).all();
  return json({
    ok: true,
    saved: operations.map((operation) => operation.envVar),
    status: godseyeSetupStatus(stored.results || []),
  });
}

async function godsideRuntimeConfig(env, user) {
  const secret = godsideEncryptionSecret(env);
  const result = await env.DB.prepare('SELECT provider, envelope_json FROM godside_provider_keys WHERE user_id = ?').bind(user.id).all();
  const keys = {};
  for (const row of result.results || []) {
    const provider = GODSIDE_PROVIDERS[row.provider];
    if (provider?.exposure !== 'browser') continue;
    let envelope;
    try { envelope = JSON.parse(row.envelope_json); } catch { continue; }
    if (envelope.enabled !== true) continue;
    keys[row.provider] = await decryptGodsideKey(envelope, secret, user.id, row.provider);
  }
  return json({ keys });
}

async function saveGodsideKey(request, env, user) {
  const secret = godsideEncryptionSecret(env);
  const body = await readJson(request);
  const provider = String(body?.provider || '');
  if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
  const value = normalizeGodsideKey(body?.key);
  const encrypted = { ...await encryptGodsideKey(value, secret, user.id, provider), enabled: body?.enabled === true };
  await env.DB.prepare(`INSERT INTO godside_provider_keys (user_id, provider, envelope_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET envelope_json = excluded.envelope_json, updated_at = excluded.updated_at`)
    .bind(user.id, provider, JSON.stringify(encrypted), new Date().toISOString()).run();
  return json({ ok: true, provider });
}

async function setGodsideKeyEnabled(request, env, user, provider) {
  godsideEncryptionSecret(env);
  if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
  const body = await readJson(request);
  if (typeof body?.enabled !== 'boolean') throw new Error('Choose whether to enable this provider.');
  const stored = await env.DB.prepare('SELECT envelope_json FROM godside_provider_keys WHERE user_id = ? AND provider = ?').bind(user.id, provider).first();
  if (!stored) throw Object.assign(new Error('That provider key is not saved.'), { status: 404 });
  let envelope;
  try { envelope = JSON.parse(stored.envelope_json); } catch { throw Object.assign(new Error('Stored provider key is invalid.'), { status: 500 }); }
  envelope.enabled = body.enabled;
  await env.DB.prepare('UPDATE godside_provider_keys SET envelope_json = ?, updated_at = ? WHERE user_id = ? AND provider = ?').bind(JSON.stringify(envelope), new Date().toISOString(), user.id, provider).run();
  return json({ ok: true, provider, enabled: body.enabled });
}

async function deleteGodsideKey(env, user, provider) {
  godsideEncryptionSecret(env);
  if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
  await env.DB.prepare('DELETE FROM godside_provider_keys WHERE user_id = ? AND provider = ?').bind(user.id, provider).run();
  return json({ ok: true, provider });
}

async function readJson(request) {
  const declaredLength = Number(request.headers.get('Content-Length') || 0);
  if (declaredLength > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  return text ? JSON.parse(text) : {};
}

function safeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function normalizeStateUrls(state, rejectInvalid = false) {
  const board = state?.board;
  if (!board || typeof board !== 'object') return state;
  const checkItems = (items, field = 'repoUrl') => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (!item || typeof item !== 'object' || !item[field]) continue;
      const normalized = safeHttpUrl(item[field]);
      if (!normalized && rejectInvalid) throw new Error('Only http:// and https:// links are allowed.');
      item[field] = normalized;
    }
  };
  checkItems(board.githubProfiles, 'url');
  checkItems(board.githubProfiles, 'profileUrl');
  checkItems(board.projects);
  checkItems(board.posts);
  checkItems(board.replies);
  checkItems(board.ideas);
  if (state.profile?.avatarDataUrl && !/^data:image\/(?:png|jpeg|webp);base64,/.test(String(state.profile.avatarDataUrl))) {
    if (rejectInvalid) throw new Error('Profile images must be PNG, JPEG, or WebP data.');
    state.profile.avatarDataUrl = '';
  }
  return state;
}

async function loginRateKey(request, username) {
  const address = request.headers.get('CF-Connecting-IP') || 'unknown';
  return digest(`login:${address}:${String(username || '').trim().toLowerCase()}`);
}

async function assertLoginAllowed(request, env, username) {
  const key = await loginRateKey(request, username);
  const row = await env.DB.prepare('SELECT window_started, attempts FROM login_attempts WHERE key_digest = ?').bind(key).first();
  const now = Date.now();
  if (row && now - Number(row.window_started) < LOGIN_WINDOW_MS && Number(row.attempts) >= LOGIN_MAX_FAILURES) {
    const retryAfter = Math.max(1, Math.ceil((Number(row.window_started) + LOGIN_WINDOW_MS - now) / 1000));
    throw Object.assign(new Error('Too many login attempts. Please wait before trying again.'), { status: 429, retryAfter });
  }
}

async function recordLoginFailure(request, env, username) {
  const key = await loginRateKey(request, username);
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO login_attempts (key_digest, window_started, attempts)
    VALUES (?, ?, 1)
    ON CONFLICT(key_digest) DO UPDATE SET
      attempts = CASE WHEN login_attempts.window_started < ? THEN 1 ELSE login_attempts.attempts + 1 END,
      window_started = CASE WHEN login_attempts.window_started < ? THEN excluded.window_started ELSE login_attempts.window_started END
  `).bind(key, now, now - LOGIN_WINDOW_MS, now - LOGIN_WINDOW_MS).run();
}

async function clearLoginFailures(request, env, username) {
  const key = await loginRateKey(request, username);
  await env.DB.prepare('DELETE FROM login_attempts WHERE key_digest = ?').bind(key).run();
}

async function login(request, env) {
  const body = await readJson(request);
  const username = String(body.username || '').trim();
  await assertLoginAllowed(request, env, username);
  const user = await env.DB.prepare('SELECT id, username, password_hash, role FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    await recordLoginFailure(request, env, username);
    throw new Error('Username or password is incorrect.');
  }
  await clearLoginFailures(request, env, username);
  const token = randomToken();
  const days = Number(env.SESSION_DAYS || DEFAULT_SESSION_DAYS);
  await env.DB.prepare('INSERT INTO sessions (digest, user_id, expires_at) VALUES (?, ?, ?)').bind(await digest(token), user.id, Date.now() + days * 86400000).run();
  return json({ user: publicUser(user) }, 200, { 'Set-Cookie': cookie(token, days * 86400) });
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
    const stored = normalizeStateUrls(row ? JSON.parse(row.state_json) : initialState());
    return json({ ...initialState(), ...stored, memories: Array.isArray(stored.memories) ? stored.memories : [] });
  }
  const body = await readJson(request);
  if (body.version !== 1 || !Array.isArray(body.interests) || !Array.isArray(body.projects)) throw new Error('Invalid application state.');
  normalizeStateUrls(body, true);
  await env.DB.prepare('INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at').bind(user.id, JSON.stringify(body), new Date().toISOString()).run();
  return json(body);
}

function normalizeSocialBoard(stored) {
  stored.board = stored.board || {};
  stored.board.groups = Array.isArray(stored.board.groups) ? stored.board.groups : [];
  stored.board.posts = Array.isArray(stored.board.posts) ? stored.board.posts : [];
  stored.board.replies = Array.isArray(stored.board.replies) ? stored.board.replies : [];
  stored.board.ideas = Array.isArray(stored.board.ideas) ? stored.board.ideas : [];
  return stored;
}

async function boardProjects(env, user) {
  return json({ projects: await boardProjectsData(env, user) });
}

async function boardProjectsData(env, user) {
  const result = await env.DB.prepare('SELECT users.id AS ownerId, users.username, user_state.state_json FROM user_state JOIN users ON users.id = user_state.user_id').all();
  const projects = [];
  for (const row of result.results || []) {
    let stored;
    try { stored = JSON.parse(row.state_json); } catch { stored = {}; }
    for (const project of Array.isArray(stored.board?.projects) ? stored.board.projects : []) {
      const visible = row.ownerId === user.id || project.visibility === 'all' || (Array.isArray(project.memberIds) && project.memberIds.includes(user.id));
      if (visible) projects.push({ ...project, ownerId: row.ownerId, ownerUsername: project.ownerUsername || row.username });
    }
  }
  projects.sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || '')));
  return projects;
}

async function boardSocial(env, user) {
  const result = await env.DB.prepare('SELECT users.id AS ownerId, users.username, user_state.state_json FROM user_state JOIN users ON users.id = user_state.user_id').all();
  const rows = result.results || []; const groups = []; const posts = []; const replies = []; const ideas = [];
  for (const row of rows) {
    let stored; try { stored = normalizeSocialBoard(JSON.parse(row.state_json)); } catch { stored = normalizeSocialBoard({}); }
    for (const group of stored.board.groups) {
      const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];
      if (row.ownerId !== user.id && !['public', 'circle'].includes(group.visibility) && !memberIds.includes(user.id)) continue;
      const pendingIds = Array.isArray(group.pendingIds) ? group.pendingIds : [];
      const applicants = row.ownerId === user.id ? rows.filter((candidate) => pendingIds.includes(candidate.ownerId)).map((candidate) => ({ id: candidate.ownerId, username: candidate.username })) : [];
      groups.push({ ...group, ownerId: row.ownerId, ownerUsername: group.ownerUsername || row.username, isOwner: row.ownerId === user.id, isMember: row.ownerId === user.id || memberIds.includes(user.id), pending: pendingIds.includes(user.id), memberCount: memberIds.length, pendingApplicants: applicants });
    }
    for (const post of stored.board.posts) posts.push({ ...post, ownerId: row.ownerId, ownerUsername: post.ownerUsername || row.username });
    for (const reply of stored.board.replies) replies.push({ ...reply, ownerId: row.ownerId, ownerUsername: reply.ownerUsername || row.username });
    for (const idea of stored.board.ideas) ideas.push({ ...idea, ownerId: row.ownerId, ownerUsername: idea.ownerUsername || row.username });
  }
  const visibleGroupIds = new Set(groups.filter((group) => group.isMember).map((group) => group.id));
  groups.sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
  posts.filter((post) => visibleGroupIds.has(post.groupId)).sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
  replies.sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')));
  return json({ groups, posts: posts.filter((post) => visibleGroupIds.has(post.groupId)), replies: replies.filter((reply) => visibleGroupIds.has(reply.groupId)), ideas: ideas.filter((idea) => !idea.archivedAt && (idea.ownerId === user.id || visibleGroupIds.has(idea.groupId))).sort((left, right) => String(right.updatedAt || right.createdAt || '').localeCompare(String(left.updatedAt || left.createdAt || ''))) });
}

async function boardSocialAction(request, env, user) {
  const body = await readJson(request); const action = String(body.action || ''); const now = new Date().toISOString();
  const result = await env.DB.prepare('SELECT users.id AS ownerId, users.username, user_state.state_json FROM user_state JOIN users ON users.id = user_state.user_id').all();
  const rows = result.results || [];
  const parsed = rows.map((row) => { let stored; try { stored = normalizeSocialBoard(JSON.parse(row.state_json)); } catch { stored = normalizeSocialBoard({}); } return { row, stored }; });
  const foundGroup = (groupId) => { for (const item of parsed) { const group = item.stored.board.groups.find((candidate) => candidate.id === groupId); if (group) return { ...item, group }; } return null; };
  const save = (ownerId, stored) => env.DB.prepare('UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(stored), now, ownerId).run();
  if (action === 'create-group') {
    const name = String(body.name || '').trim(); if (!name) throw new Error('Group name is required.');
    const visibility = ['public', 'private', 'circle'].includes(body.visibility) ? body.visibility : 'public';
    const own = parsed.find((item) => item.row.ownerId === user.id); if (!own) throw new Error('Account state is unavailable.');
    const memberIds = [...new Set([user.id, ...(Array.isArray(body.memberIds) ? body.memberIds.map(String) : [])])]; const groupId = userId(); own.stored.board.groups.unshift({ id: groupId, name: name.slice(0, 80), description: String(body.description || '').trim().slice(0, 240), visibility, ownerId: user.id, ownerUsername: user.username, memberIds, pendingIds: [], createdAt: now, updatedAt: now }); await save(user.id, own.stored); return json({ ok: true, groupId });
  }
  if (action === 'join-group') {
    const found = foundGroup(String(body.groupId || '')); if (!found) throw Object.assign(new Error('Group not found.'), { status: 404 }); if (found.row.ownerId === user.id || found.group.memberIds?.includes(user.id)) return json({ ok: true }); if (found.group.visibility === 'private') throw Object.assign(new Error('This private group is invite-only.'), { status: 403 });
    found.group.memberIds = Array.isArray(found.group.memberIds) ? found.group.memberIds : []; found.group.pendingIds = Array.isArray(found.group.pendingIds) ? found.group.pendingIds : []; if (found.group.visibility === 'circle') { if (!found.group.pendingIds.includes(user.id)) found.group.pendingIds.push(user.id); } else if (!found.group.memberIds.includes(user.id)) found.group.memberIds.push(user.id); found.group.updatedAt = now; await save(found.row.ownerId, found.stored); return json({ ok: true });
  }
  if (action === 'approve-group-member') {
    const found = foundGroup(String(body.groupId || '')); if (!found || found.row.ownerId !== user.id) throw Object.assign(new Error('Only the group owner can approve members.'), { status: 403 }); const applicantId = String(body.userId || ''); found.group.pendingIds = (found.group.pendingIds || []).filter((id) => id !== applicantId); found.group.memberIds = Array.isArray(found.group.memberIds) ? found.group.memberIds : []; if (!found.group.memberIds.includes(applicantId)) found.group.memberIds.push(applicantId); found.group.updatedAt = now; await save(user.id, found.stored); return json({ ok: true });
  }
  if (action === 'create-post') {
    const found = foundGroup(String(body.groupId || '')); if (!found || !(found.row.ownerId === user.id || found.group.memberIds?.includes(user.id))) throw Object.assign(new Error('Join this group before posting.'), { status: 403 }); const text = String(body.body || '').trim(); if (!text) throw new Error('Post text is required.'); const own = parsed.find((item) => item.row.ownerId === user.id); own.stored.board.posts.unshift({ id: userId(), groupId: found.group.id, body: text.slice(0, 2000), repoUrl: String(body.repoUrl || '').trim().slice(0, 500), repoPath: String(body.repoPath || '').trim().slice(0, 300), repoLine: String(body.repoLine || '').trim().slice(0, 40), repoQuery: String(body.repoQuery || '').trim().slice(0, 120), snippet: String(body.snippet || '').trim().slice(0, 1200), ownerId: user.id, ownerUsername: user.username, createdAt: now, updatedAt: now }); await save(user.id, own.stored); return json({ ok: true });
  }
  if (action === 'create-reply') {
    const postId = String(body.postId || ''); let post = null; for (const item of parsed) { const candidate = item.stored.board.posts.find((entry) => entry.id === postId); if (candidate) { post = candidate; break; } } if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 }); const found = foundGroup(post.groupId); if (!found || !(found.row.ownerId === user.id || found.group.memberIds?.includes(user.id))) throw Object.assign(new Error('Join this group before replying.'), { status: 403 }); const text = String(body.body || '').trim(); if (!text) throw new Error('Reply text is required.'); const own = parsed.find((item) => item.row.ownerId === user.id); own.stored.board.replies.push({ id: userId(), postId, groupId: found.group.id, body: text.slice(0, 1000), ownerId: user.id, ownerUsername: user.username, createdAt: now }); await save(user.id, own.stored); return json({ ok: true });
  }
  if (action === 'create-idea') {
    const title = String(body.title || '').trim(); if (!title) throw new Error('Idea title is required.'); const groupId = String(body.groupId || ''); if (groupId) { const found = foundGroup(groupId); if (!found || !(found.row.ownerId === user.id || found.group.memberIds?.includes(user.id))) throw Object.assign(new Error('Join this group before adding an idea.'), { status: 403 }); }
    const own = parsed.find((item) => item.row.ownerId === user.id); const ideaId = userId(); own.stored.board.ideas.unshift({ id: ideaId, title: title.slice(0, 100), detail: String(body.detail || '').trim().slice(0, 500), groupId, stage: 'spark', ownerId: user.id, ownerUsername: user.username, createdAt: now, updatedAt: now }); await save(user.id, own.stored); return json({ ok: true, ideaId });
  }
  if (action === 'move-idea' || action === 'archive-idea') {
    const ideaId = String(body.ideaId || ''); const own = parsed.find((item) => item.row.ownerId === user.id); const idea = own?.stored.board.ideas.find((item) => item.id === ideaId); if (!idea) throw Object.assign(new Error('Idea not found or not editable.'), { status: 404 });
    if (action === 'archive-idea') idea.archivedAt = now; else { const stage = String(body.stage || ''); if (!['spark', 'shape', 'test', 'ready'].includes(stage)) throw new Error('Invalid idea stage.'); idea.stage = stage; } idea.updatedAt = now; await save(user.id, own.stored); return json({ ok: true });
  }
  throw new Error('Unknown board action.');
}

async function removeBoardProject(env, user, projectId) {
  const result = await env.DB.prepare('SELECT users.id AS ownerId, user_state.state_json FROM user_state JOIN users ON users.id = user_state.user_id').all();
  for (const row of result.results || []) {
    let stored;
    try { stored = JSON.parse(row.state_json); } catch { stored = {}; }
    const projects = Array.isArray(stored.board?.projects) ? stored.board.projects : [];
    if (!projects.some((project) => project.id === projectId)) continue;
    if (row.ownerId !== user.id && user.role !== 'admin') throw Object.assign(new Error('You cannot remove another user\'s project.'), { status: 403 });
    stored.board.projects = projects.filter((project) => project.id !== projectId);
    await env.DB.prepare('UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(stored), new Date().toISOString(), row.ownerId).run();
    return json({ ok: true });
  }
  throw Object.assign(new Error('Project not found.'), { status: 404 });
}

async function chatMessages(request, env, user) {
  if (request.method === 'GET') {
    const result = await env.DB.prepare('SELECT id, user_id AS userId, username, message, created_at AS createdAt FROM chat_messages ORDER BY created_at DESC LIMIT ?').bind(CHAT_MAX_MESSAGES).all();
    return json({ messages: (result.results || []).reverse() });
  }
  const body = await readJson(request);
  const message = String(body.message || '').trim();
  if (!message) throw new Error('Message is required.');
  if (message.length > CHAT_MAX_MESSAGE_LENGTH) throw new Error(`Messages must be ${CHAT_MAX_MESSAGE_LENGTH} characters or fewer.`);
  const createdAt = new Date().toISOString();
  const id = userId();
  await env.DB.prepare('INSERT INTO chat_messages (id, user_id, username, message, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, user.id, user.username, message, createdAt).run();
  return json({ message: { id, userId: user.id, username: user.username, message, createdAt } }, 201);
}

async function dailyWordle() {
  const date = new Date().toISOString().slice(0, 10);
  const response = await fetch(`https://www.nytimes.com/svc/wordle/v2/${date}.json`);
  if (!response.ok) throw new Error('Daily Wordle is temporarily unavailable.');
  const payload = await response.json();
  return json({ date, answer: String(payload.solution || '').toLocaleUpperCase() });
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

function mcpRpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function mcpRpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function mcpTextResult(payload) { return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload }; }

function mcpOriginAllowed(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;
  if (origin === 'null') return false;
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.origin === String(env.FRONTEND_ORIGIN || '').trim();
  } catch { return false; }
}

function mcpHasId(message) { return Object.prototype.hasOwnProperty.call(message, 'id'); }
function mcpIsResponse(message) {
  return message && message.jsonrpc === '2.0' && mcpHasId(message)
    && (Object.prototype.hasOwnProperty.call(message, 'result') || Object.prototype.hasOwnProperty.call(message, 'error'));
}

async function mcpUser(request, env) {
  const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  const configuredUsername = String(env.MCP_USERNAME || '').trim();
  if (env.MCP_TOKEN && bearer && await timingSafeSecretEquals(bearer, env.MCP_TOKEN)) {
    if (!configuredUsername) return null;
    return env.DB.prepare('SELECT id, username, role FROM users WHERE username = ? COLLATE NOCASE LIMIT 1').bind(configuredUsername).first();
  }
  const user = await currentUser(request, env);
  if (configuredUsername && user?.username?.toLowerCase() !== configuredUsername.toLowerCase()) return null;
  return user;
}

async function mcpRoute(request, env) {
  if (!mcpOriginAllowed(request, env)) return json({ error: 'Origin is not allowed.' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
  if (request.method === 'GET') return json({ error: 'MCP uses POST for JSON-RPC messages.' }, 405, { Allow: 'POST' });
  if (request.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, { Allow: 'POST' });
  let payload;
  try {
    payload = await readJson(request);
    await ensureBootstrap(env);
    const user = await mcpUser(request, env);
    if (!user) throw Object.assign(new Error('MCP authentication required.'), { status: 401 });
    if (Array.isArray(payload) && payload.length === 0) return json(mcpRpcError(null, -32600, 'An empty JSON-RPC batch is invalid.'));

    const processMessage = async (message) => {
      if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') {
        return mcpRpcError(null, -32600, 'Invalid JSON-RPC request.');
      }
      if (mcpIsResponse(message)) return null;
      if (typeof message.method !== 'string') return mcpRpcError(mcpHasId(message) ? message.id : null, -32600, 'Invalid JSON-RPC request.');
      if (!mcpHasId(message)) return null;
      if (message.method === 'initialize') return mcpRpcResult(message.id, { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'mulch-garden', version: '0.1.0' }, instructions: 'Use this server for read-only Mulch Garden context. Every tool call is scoped to the authenticated user and should be explained to the user when it is part of a larger workflow.' });
      if (message.method === 'ping') return mcpRpcResult(message.id, {});
      if (message.method === 'tools/list') return mcpRpcResult(message.id, { tools: MCP_TOOLS });
      if (message.method === 'tools/call') {
        const name = message.params?.name;
        try {
          if (name === 'get_project_context') return mcpRpcResult(message.id, mcpTextResult({ name: 'The Mulch Garden', purpose: 'A private productivity and information hub for projects, interests, todos, games, and integrations.', authenticatedAs: user.username, availablePages: MCP_ADMIN_PAGES, mcpEndpoint: '/mcp' }));
          if (name === 'list_board_projects') return mcpRpcResult(message.id, mcpTextResult({ projects: await boardProjectsData(env, user) }));
          if (name === 'list_admin_pages') return mcpRpcResult(message.id, mcpTextResult({ pages: MCP_ADMIN_PAGES }));
          return mcpRpcError(message.id, -32602, `Unknown MCP tool: ${name}`);
        } catch (error) {
          return mcpRpcError(message.id, -32603, error.message || 'Tool call failed.');
        }
      }
      return mcpRpcError(message.id, -32601, `Method not found: ${message.method}`);
    };

    const batch = Array.isArray(payload);
    const messages = batch ? payload : [payload];
    const replies = [];
    for (const message of messages) {
      const reply = await processMessage(message);
      if (reply) replies.push(reply);
    }
    if (replies.length === 0) return new Response(null, { status: 202 });
    return json(batch ? replies : replies[0]);
  } catch (error) {
    const status = error.status || (error.message?.includes('required') ? 401 : 400);
    const message = Array.isArray(payload) ? null : payload;
    return json(message && mcpHasId(message) ? mcpRpcError(message.id, -32000, error.message || 'MCP request failed.') : { error: error.message || 'MCP request failed.' }, status);
  }
}

async function supportRequests(request, env, user, requestId = '') {
  const rows = (await env.DB.prepare('SELECT users.id AS ownerId, users.username, user_state.state_json FROM user_state JOIN users ON users.id = user_state.user_id').all()).results || [];
  const parsed = rows.map((row) => { let stored; try { stored = JSON.parse(row.state_json); } catch { stored = initialState(); } stored.feedback = Array.isArray(stored.feedback) ? stored.feedback : []; return { row, stored }; });
  if (request.method === 'GET') {
    const requests = parsed.filter((item) => user.role === 'admin' || item.row.ownerId === user.id).flatMap((item) => item.stored.feedback.map((entry) => ({ ...entry, ownerId: item.row.ownerId, ownerUsername: entry.ownerUsername || item.row.username }))).sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
    return json({ requests });
  }
  const body = await readJson(request); const now = new Date().toISOString();
  if (request.method === 'POST') {
    const kind = body.kind === 'bug' ? 'bug' : 'feature'; const title = String(body.title || '').trim(); const description = String(body.description || '').trim();
    if (!title || !description) throw new Error('A title and description are required.');
    const own = parsed.find((item) => item.row.ownerId === user.id); if (!own) throw new Error('Account state is unavailable.');
    const created = { id: userId(), kind, featureScope: kind === 'feature' && body.featureScope === 'existing' ? 'existing' : kind === 'feature' ? 'new' : '', title: title.slice(0, 120), description: description.slice(0, 2000), projectId: String(body.projectId || '').slice(0, 120), projectName: String(body.projectName || '').slice(0, 120), bugType: kind === 'bug' ? String(body.bugType || 'other').slice(0, 60) : '', screenshotDataUrl: kind === 'bug' && /^data:image\/(?:png|jpeg|webp);base64,/.test(String(body.screenshotDataUrl || '')) ? String(body.screenshotDataUrl).slice(0, 500000) : '', status: 'new', ownerId: user.id, ownerUsername: user.username, createdAt: now, updatedAt: now };
    own.stored.feedback.unshift(created); await env.DB.prepare('UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(own.stored), now, user.id).run(); return json({ request: created }, 201);
  }
  requireAdmin(user); const status = ['new', 'reviewing', 'planned', 'resolved', 'closed'].includes(body.status) ? body.status : '';
  for (const item of parsed) { const entry = item.stored.feedback.find((candidate) => candidate.id === requestId); if (!entry) continue; if (status) entry.status = status; entry.updatedAt = now; await env.DB.prepare('UPDATE user_state SET state_json = ?, updated_at = ? WHERE user_id = ?').bind(JSON.stringify(item.stored), now, item.row.ownerId).run(); return json({ request: { ...entry, ownerUsername: entry.ownerUsername || item.row.username } }); }
  throw Object.assign(new Error('Request not found.'), { status: 404 });
}

async function route(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/mcp') return mcpRoute(request, env);
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
  if (request.method === 'GET' && url.pathname === '/api/godside/app-config') return json({ available: true, url: '/godseye/?embed=1' });
  if (request.method === 'GET' && url.pathname === '/api/setup/status') return godseyePowerUpStatus(env, user);
  if (request.method === 'POST' && url.pathname === '/api/setup/keys') return saveGodseyePowerUpKeys(request, env, user);
  if (request.method === 'GET' && url.pathname === '/api/godside/keys') return godsideKeyStatus(env, user);
  if (request.method === 'GET' && url.pathname === '/api/godside/runtime') return godsideRuntimeConfig(env, user);
  if (request.method === 'PUT' && url.pathname === '/api/godside/keys') return saveGodsideKey(request, env, user);
  const godsideKeyMatch = url.pathname.match(/^\/api\/godside\/keys\/([^/]+)$/);
  if (request.method === 'PATCH' && godsideKeyMatch) return setGodsideKeyEnabled(request, env, user, decodeURIComponent(godsideKeyMatch[1]));
  if (request.method === 'DELETE' && godsideKeyMatch) return deleteGodsideKey(env, user, decodeURIComponent(godsideKeyMatch[1]));
  if (request.method === 'GET' && url.pathname === '/api/members') return members(env);
  if (request.method === 'GET' && url.pathname === '/api/board/projects') return boardProjects(env, user);
  if (request.method === 'GET' && url.pathname === '/api/board/social') return boardSocial(env, user);
  if (request.method === 'POST' && url.pathname === '/api/board/social') return boardSocialAction(request, env, user);
  if (url.pathname === '/api/requests' && ['GET', 'POST'].includes(request.method)) return supportRequests(request, env, user);
  if (request.method === 'PATCH' && url.pathname.startsWith('/api/requests/')) return supportRequests(request, env, user, decodeURIComponent(url.pathname.split('/').pop()));
  if (request.method === 'DELETE' && url.pathname.startsWith('/api/board/projects/')) return removeBoardProject(env, user, decodeURIComponent(url.pathname.split('/').pop()));
  if (request.method === 'GET' && url.pathname === '/api/wordle/today') return dailyWordle();
  if (url.pathname === '/api/chat/messages' && ['GET', 'POST'].includes(request.method)) return chatMessages(request, env, user);
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
