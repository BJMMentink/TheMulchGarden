import { createSessionToken, expiredSessionCookie, hashPassword, parseCookies, sessionCookie, tokenDigest, verifyPassword } from '../lib/auth.js';

const publicUser = (user) => ({ id: user.id, username: user.username });

export function createAuthController(repository, config) {
  async function startSession(user, response) {
    const token = createSessionToken();
    await repository.createSession(user.id, tokenDigest(token), Date.now() + config.sessionDays * 24 * 60 * 60 * 1000);
    response.setHeader('Set-Cookie', sessionCookie(token, config.secureCookies, config.sessionDays * 24 * 60 * 60));
    return { ...publicUser(user), token };
  }
  return {
    async current(request) {
      const token = parseCookies(request.headers.cookie).mg_session; if (!token) return null;
      const session = await repository.findSession(tokenDigest(token)); if (!session) return null;
      const user = (await repository.users.read('users', [])).find((item) => item.id === session.userId && item.username);
      return user ? publicUser(user) : null;
    },
    async register() { throw Object.assign(new Error('Account creation is disabled.'), { status: 403 }); },
    async login(body, request, response) {
      const user = await repository.findUserByUsername(String(body.username || '').trim());
      if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new Error('Username or password is incorrect.');
      return startSession(user, response);
    },
    async logout(request, response) {
      const token = parseCookies(request.headers.cookie).mg_session; if (token) await repository.deleteSession(tokenDigest(token));
      response.setHeader('Set-Cookie', expiredSessionCookie()); return { ok: true };
    },
    async update(body, user) {
      const stored = (await repository.users.read('users', [])).find((item) => item.id === user.id);
      if (!stored || !(await verifyPassword(body.currentPassword, stored.passwordHash))) throw new Error('Current password is incorrect.');
      const username = String(body.username || '').trim();
      if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw new Error('Username must be 3–32 letters, numbers, underscores, or hyphens.');
      const existing = await repository.findUserByUsername(username); if (existing && existing.id !== user.id) throw new Error('That username is already in use.');
      return publicUser(await repository.updateUser(user.id, { username, passwordHash: body.newPassword ? await hashPassword(body.newPassword) : stored.passwordHash }));
    },
  };
}
