function send(response, status, payload) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(payload)); }
async function readBody(request, limit) { let body = ''; for await (const chunk of request) { body += chunk; if (Buffer.byteLength(body) > limit) throw Object.assign(new Error('Request body too large.'), { status: 413 }); } return body ? JSON.parse(body) : {}; }

export function createRouter({ auth, app, bodyLimit }) {
  return async function route(request, response) {
    const path = new URL(request.url || '/', 'http://localhost').pathname;
    try {
      if (!path.startsWith('/api/')) return false;
      const body = ['POST', 'PUT', 'PATCH'].includes(request.method) ? await readBody(request, bodyLimit) : {};
      if (request.method === 'GET' && path === '/api/auth/me') return send(response, 200, { user: await auth.current(request) });
      if (request.method === 'POST' && path === '/api/auth/login') return send(response, 200, { user: await auth.login(body, request, response) });
      if (request.method === 'POST' && path === '/api/auth/logout') return send(response, 200, await auth.logout(request, response));
      const user = await app.requireUser(request);
      if (request.method === 'PATCH' && path === '/api/auth/me') return send(response, 200, { user: await auth.update(body, user) });
      if (request.method === 'GET' && path === '/api/members') return send(response, 200, { members: await app.listMembers() });
      if (request.method === 'GET' && path === '/api/board/projects') return send(response, 200, { projects: await app.listBoardProjects(user) });
      if (request.method === 'GET' && path === '/api/board/social') return send(response, 200, await app.listBoardSocial(user));
      if (request.method === 'POST' && path === '/api/board/social') return send(response, 200, await app.boardSocialAction(user, body));
      const boardProjectMatch = path.match(/^\/api\/board\/projects\/([^/]+)$/);
      if (request.method === 'DELETE' && boardProjectMatch) return send(response, 200, await app.removeBoardProject(user, decodeURIComponent(boardProjectMatch[1])));
      if (request.method === 'GET' && path === '/api/wordle/today') return send(response, 200, await app.dailyWordle());
      if (request.method === 'GET' && path === '/api/chat/messages') return send(response, 200, { messages: await app.listChatMessages() });
      if (request.method === 'POST' && path === '/api/chat/messages') return send(response, 201, { message: await app.createChatMessage(user, body) });
      if (request.method === 'GET' && path === '/api/admin/users') return send(response, 200, { users: await auth.listAdminUsers(user) });
      if (request.method === 'POST' && path === '/api/admin/users') return send(response, 201, { user: await auth.createAdminUser(body, user) });
      if (request.method === 'GET' && path === '/api/state') return send(response, 200, await app.getState(user));
      if (request.method === 'PUT' && path === '/api/state') return send(response, 200, await app.saveState(user, body));
      return send(response, 404, { error: 'Not found.' });
    } catch (error) { return send(response, error.status || (error.message.includes('required') ? 401 : 400), { error: error.message || 'Request failed.' }); }
  };
}
