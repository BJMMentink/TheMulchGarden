import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare/src/index.js';
import { handleGodsidePublicFeed } from '../cloudflare/src/godside-public-feeds.js';
import { validateCycloneSnapshot } from '../vendor/gods-eye-view/src/layers/cyclones/source.js';

test('CelesTrak feed is allowlisted, validated, and cached for six hours', async () => {
  const calls = [];
  const feed = 'ISS (ZARYA)\n1 25544U 98067A   26278.50000000  .00000000  00000-0  00000-0 0  9999\n2 25544  51.6400  20.0000 0001000  20.0000  30.0000 15.50000000000000\n';
  const response = await handleGodsidePublicFeed(
    new Request('https://site.example/api/celestrak/stations'),
    { fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return new Response(feed); } },
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^ISS \(ZARYA\)/);
  assert.equal(new URL(calls[0].url).hostname, 'celestrak.org');
  assert.equal(calls[0].init.cf.cacheTtl, 21_600);
  assert.match(calls[0].init.headers['User-Agent'], /gods-eye-view-celestrak-proxy/);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=21600');

  const invalid = await handleGodsidePublicFeed(
    new Request('https://site.example/api/celestrak/not-a-feed'),
    { fetchImpl: async () => { throw new Error('must not fetch an arbitrary group'); } },
  );
  assert.equal(invalid.status, 404);
});

test('hosted NOAA cyclones expose bounded current advisories without a key or forecast-image requests', async () => {
  const now = Date.UTC(2026, 9, 5, 12);
  const calls = [];
  const response = await handleGodsidePublicFeed(
    new Request('https://site.example/api/cyclones'),
    {
      now: () => now,
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return Response.json({ activeStorms: [{
          id: 'al092026', name: 'Mabel', classification: 'TS',
          longitudeNumeric: -65, latitudeNumeric: 24,
          lastUpdate: '2026-10-05T11:00:00Z',
          forecastAdvisory: { issuance: '2026-10-05T11:00:00Z', advNum: '012', url: 'https://www.nhc.noaa.gov/text/MIATCMAT4.shtml' },
          intensity: 55, pressure: 990, movementDir: 320, movementSpeed: 10,
        }] });
      },
    },
  );
  assert.equal(response.status, 200);
  const snapshot = validateCycloneSnapshot(await response.json());
  assert.equal(snapshot.storms[0].name, 'Mabel');
  assert.equal(snapshot.storms[0].geometryStatus, 'unavailable');
  assert.equal(snapshot.storms[0].advisoryNumber, '12');
  assert.equal(calls[0].url, 'https://www.nhc.noaa.gov/CurrentStorms.json');
  assert.equal(calls[0].init.cf.cacheTtl, 300);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=300');

  const invalid = await handleGodsidePublicFeed(
    new Request('https://site.example/api/cyclones'),
    { now: () => now, fetchImpl: async () => Response.json({ activeStorms: [{ id: 'invalid' }] }) },
  );
  assert.equal(invalid.status, 502);
});

test('regional flights use a bounded no-key ADSB.lol request and normalize its response', async () => {
  const calls = [];
  const response = await handleGodsidePublicFeed(
    new Request('https://site.example/api/flights?lat=44.62&lon=-88.12'),
    {
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init });
        return Response.json({
          now: 1_710_000_000,
          ac: [{ hex: 'abc123', lat: 44.7, lon: -88.1, seen: 2, seen_pos: 1, alt_baro: 30000, gs: 250, track: 90 }],
        });
      },
    },
  );
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.states.length, 1);
  assert.equal(snapshot.states[0][0], 'abc123');
  assert.equal(calls[0].url, 'https://api.adsb.lol/v2/lat/44.50/lon/-88.00/dist/250');
  assert.equal(calls[0].init.cf.cacheTtl, 30);
  assert.equal(response.headers.get('x-flight-source'), 'ADSB.lol');
  assert.equal(response.headers.get('vary'), 'Cookie');

  let fetched = false;
  const invalid = await handleGodsidePublicFeed(
    new Request('https://site.example/api/flights?lat=999&lon=0'),
    { fetchImpl: async () => { fetched = true; throw new Error('must not fetch invalid coordinates'); } },
  );
  assert.equal(invalid.status, 400);
  assert.equal(fetched, false);
});

test('military aircraft use the cached public feed and launches stay under the anonymous rate limit', async () => {
  const calls = [];
  const military = await handleGodsidePublicFeed(
    new Request('https://site.example/api/military'),
    { fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ ac: [] }); } },
  );
  assert.equal(military.status, 200);
  assert.equal(calls[0].url, 'https://api.adsb.lol/v2/mil');
  assert.equal(calls[0].init.cf.cacheTtl, 30);

  const launch = await handleGodsidePublicFeed(
    new Request('https://site.example/api/launches'),
    {
      now: () => Date.UTC(2026, 9, 5, 12, 7),
      fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return Response.json({ results: [] }); },
    },
  );
  assert.equal(launch.status, 200);
  assert.equal(calls[1].init.cf.cacheTtl, 900);
  assert.equal(calls[1].url.includes('net__lte=2026-10-05T12%3A00%3A00.000Z'), true);

  const trafficStatus = await handleGodsidePublicFeed(new Request('https://site.example/api/tomtom/status'));
  assert.deepEqual(await trafficStatus.json(), { hasKey: false, available: false, mode: 'openstreetmap' });

  const installations = await handleGodsidePublicFeed(new Request('https://site.example/api/military-installations?south=30&west=-98&north=31&east=-97'));
  assert.deepEqual(await installations.json(), { code: 'OVERPASS_NOT_CONFIGURED', unavailable: true, retryable: false });
});

test('hosted keyless-feed endpoints remain inaccessible to signed-out visitors', async () => {
  const env = {
    DB: {
      prepare() {
        return { bind() { return { async first() { return null; }, async run() { return { success: true }; } }; } };
      },
    },
  };
  const response = await worker.fetch(
    new Request('https://api.example/api/celestrak/stations'),
    env,
  );
  assert.equal(response.status, 401);
});

test('hosted keyless-feed endpoints reject a guest account before any upstream fetch', async () => {
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() {
            return {
              async first() {
                return sql.includes('FROM sessions JOIN users')
                  ? { id: 'guest-1', username: 'Guest', role: 'guest' }
                  : null;
              },
            };
          },
        };
      },
    },
  };
  const response = await worker.fetch(
    new Request('https://api.example/api/cyclones', { headers: { Cookie: 'mg_session=guest-test-token' } }),
    env,
  );
  assert.equal(response.status, 403);
});
