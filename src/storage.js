const API_BASE = String(globalThis.MULCH_API_BASE || '').replace(/\/$/, '');

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(`${API_BASE}${path}`, { credentials: 'include', headers, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

export async function getCurrentUser() { return (await request('/api/auth/me')).user; }
export async function login(username, password) {
  const user = (await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })).user;
  return user;
}
export async function logout() { try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); } finally { localStorage.removeItem('mg_api_token'); } }
export async function loadState() { return request('/api/state'); }
export async function loadMembers() { return (await request('/api/members')).members; }
export async function loadBoardProjects() { return (await request('/api/board/projects')).projects; }
export async function removeBoardProject(id) { return request(`/api/board/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
export async function loadBoardSocial() { return request('/api/board/social'); }
export async function boardSocialAction(action, payload = {}) { return request('/api/board/social', { method: 'POST', body: JSON.stringify({ action, ...payload }) }); }
export async function loadSupportRequests() { return (await request('/api/requests')).requests; }
export async function createSupportRequest(payload) { return (await request('/api/requests', { method: 'POST', body: JSON.stringify(payload) })).request; }
export async function updateSupportRequest(id, payload) { return (await request(`/api/requests/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) })).request; }
export async function loadChatMessages() { return (await request('/api/chat/messages')).messages; }
export async function loadDailyWordle() { return request('/api/wordle/today'); }
export async function sendChatMessage(message) { return (await request('/api/chat/messages', { method: 'POST', body: JSON.stringify({ message }) })).message; }
export async function loadAdminUsers() { return (await request('/api/admin/users')).users; }
export async function createAdminUser(user) { return (await request('/api/admin/users', { method: 'POST', body: JSON.stringify(user) })).user; }
export async function saveState(state) { return request('/api/state', { method: 'PUT', body: JSON.stringify(state) }); }
export async function updateAccount(account) { return (await request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(account) })).user; }
