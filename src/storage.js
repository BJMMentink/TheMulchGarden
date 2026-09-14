const API_BASE = String(globalThis.MULCH_API_BASE || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const token = localStorage.getItem('mg_api_token');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

export async function getCurrentUser() { return (await request('/api/auth/me')).user; }
export async function login(username, password) {
  const user = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })).user;
  if (user.token) localStorage.setItem('mg_api_token', user.token);
  return user;
}
export async function logout() { try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); } finally { localStorage.removeItem('mg_api_token'); } }
export async function loadState() { return request('/api/state'); }
export async function loadMembers() { return (await request('/api/members')).members; }
export async function loadChatMessages() { return (await request('/api/chat/messages')).messages; }
export async function loadDailyWordle() { return request('/api/wordle/today'); }
export async function sendChatMessage(message) { return (await request('/api/chat/messages', { method: 'POST', body: JSON.stringify({ message }) })).message; }
export async function loadAdminUsers() { return (await request('/api/admin/users')).users; }
export async function createAdminUser(user) { return (await request('/api/admin/users', { method: 'POST', body: JSON.stringify(user) })).user; }
export async function saveState(state) { return request('/api/state', { method: 'PUT', body: JSON.stringify(state) }); }
export async function updateAccount(account) { return (await request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(account) })).user; }
