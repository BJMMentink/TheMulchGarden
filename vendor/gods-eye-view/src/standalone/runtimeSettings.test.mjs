import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStandaloneRuntimeSettings } from './runtimeSettings.js';

test('loads the signed-in account settings without caching the response', async () => {
  let request;
  const result = await loadStandaloneRuntimeSettings({
    fetchImpl: async (url, options) => {
      request = { url, options };
      return Response.json({
        keys: { googleMapsApiKey: 'private-test-value' },
      });
    },
  });

  assert.deepEqual(result, {
    keys: { googleMapsApiKey: 'private-test-value' },
    warning: null,
  });
  assert.equal(request.url, '/api/godside/runtime');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.credentials, 'same-origin');
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('keeps authentication failures fatal', async () => {
  for (const status of [401, 403]) {
    await assert.rejects(
      loadStandaloneRuntimeSettings({
        fetchImpl: async () => new Response(null, { status }),
      }),
      /Sign in to a Mulch Garden account/,
    );
  }
});

test('starts keyless after an unavailable settings service', async () => {
  const results = await Promise.all([
    loadStandaloneRuntimeSettings({
      fetchImpl: async () => new Response(null, { status: 503 }),
    }),
    loadStandaloneRuntimeSettings({
      fetchImpl: async () => {
        throw new TypeError('offline');
      },
    }),
  ]);

  for (const result of results) {
    assert.deepEqual(result.keys, {});
    assert.match(result.warning, /keyless globe/);
  }
});

test('bounds a settings request that never completes', async () => {
  const result = await loadStandaloneRuntimeSettings({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('Timed out', 'AbortError')),
          { once: true },
        );
      }),
  });

  assert.deepEqual(result.keys, {});
  assert.match(result.warning, /keyless globe/);
});

test('rejects malformed settings instead of passing values into the app', async () => {
  const result = await loadStandaloneRuntimeSettings({
    fetchImpl: async () => Response.json({ keys: [] }),
  });

  assert.deepEqual(result.keys, {});
  assert.match(result.warning, /keyless globe/);
});
