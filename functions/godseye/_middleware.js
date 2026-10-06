const API_ORIGIN = 'https://the-mulch-garden-api.bjmmentink.workers.dev';

function response(status, message) {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const GODSEYE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' blob: https://www.youtube.com https://connect.facebook.net https://platform.twitter.com https://maps.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' blob: data: https: wss: ws:",
  "worker-src 'self' blob:",
  "child-src 'self' blob:",
  "frame-src 'self' blob: https://www.youtube-nocookie.com https://www.youtube.com https://www.facebook.com https://platform.twitter.com",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

export async function onRequest(context) {
  const cookie = context.request.headers.get('Cookie') || '';
  if (!cookie) return response(401, 'Sign in to a Mulch Garden account to open God’s Eye.');

  let user;
  try {
    const authResponse = await fetch(`${API_ORIGIN}/api/auth/me`, {
      headers: { Cookie: cookie, Accept: 'application/json' },
    });
    if (!authResponse.ok) return response(401, 'Sign in to a Mulch Garden account to open God’s Eye.');
    user = (await authResponse.json()).user;
  } catch {
    return response(503, 'God’s Eye access could not be checked right now.');
  }
  if (!['user', 'admin'].includes(user?.role)) {
    return response(403, 'God’s Eye is available to signed-in members and admins.');
  }

  const asset = await context.next();
  const headers = new Headers(asset.headers);
  headers.set('Content-Security-Policy', GODSEYE_CSP);
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
}
