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
      if (request.method === 'GET' && path === '/api/state') return send(response, 200, await app.getState(user));
      if (request.method === 'PUT' && path === '/api/state') return send(response, 200, await app.saveState(user, body));
      return send(response, 404, { error: 'Not found.' });
    } catch (error) { return send(response, error.status || (error.message.includes('required') ? 401 : 400), { error: error.message || 'Request failed.' }); }
  };
}
