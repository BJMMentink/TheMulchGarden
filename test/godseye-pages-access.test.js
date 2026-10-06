import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/godseye/_middleware.js';

test('Cloudflare God’s Eye asset requests deny guests before serving a static file', async () => {
  let assetRequested = false;
  const result = await onRequest({
    request: new Request('https://themulchgarden.pages.dev/godseye/?embed=1'),
    async next() { assetRequested = true; return new Response('<html>app</html>'); },
  });
  assert.equal(result.status, 401);
  assert.equal(assetRequested, false);
});

test('Cloudflare God’s Eye assets require a signed-in member/admin and permit same-site framing and voice', async () => {
  const originalFetch = globalThis.fetch;
  let forwardedCookie = '';
  let assetRequested = false;
  globalThis.fetch = async (_input, init) => {
    forwardedCookie = new Headers(init?.headers).get('Cookie') || '';
    return Response.json({ user: { id: 'member-1', role: 'user' } });
  };
  try {
    const result = await onRequest({
      request: new Request('https://themulchgarden.pages.dev/godseye/?embed=1', {
        headers: { Cookie: 'mg_session=session-token' },
      }),
      async next() { assetRequested = true; return new Response('<html>app</html>', { headers: { 'Cache-Control': 'public, max-age=300' } }); },
    });
    assert.equal(result.status, 200);
    assert.equal(assetRequested, true);
    assert.equal(forwardedCookie, 'mg_session=session-token');
    assert.match(result.headers.get('Content-Security-Policy'), /frame-ancestors 'self'/);
    assert.equal(result.headers.get('Permissions-Policy'), 'camera=(), geolocation=(), microphone=(self)');
    assert.equal(result.headers.get('X-Frame-Options'), 'SAMEORIGIN');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
