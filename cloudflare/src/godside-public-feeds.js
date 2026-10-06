import { launchLibraryRecentUrl, celestrakTleUrl } from '../../vendor/gods-eye-view/src/data/spaceProviderRequests.js';
import { normalizeAdsbLolPointResponse } from '../../vendor/gods-eye-view/src/data/adsbLolFallback.js';
import { validateCycloneSnapshot } from '../../vendor/gods-eye-view/src/layers/cyclones/source.js';

const TLE_GROUPS = new Set([
  'stations', 'visual', 'gps-ops', 'glo-ops', 'galileo', 'geo', 'starlink', 'active',
]);
const MAX_TLE_BYTES = 8 * 1024 * 1024;
const MAX_FLIGHT_BYTES = 4 * 1024 * 1024;
const MAX_LAUNCH_BYTES = 4 * 1024 * 1024;
const MAX_CYCLONE_BYTES = 128 * 1024;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function text(body, status = 200, headers = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function cachedGet(fetchImpl, url, ttlSeconds, headers = {}) {
  return fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    headers: { Accept: 'application/json', ...headers },
    cf: {
      cacheEverything: true,
      cacheTtl: ttlSeconds,
      cacheTtlByStatus: { '200-299': ttlSeconds, '400-599': 0 },
    },
  });
}

function browserCache(ttlSeconds) {
  // These routes are still member-gated. Vary by session so a cached public
  // feed never lets a guest reuse a member's authenticated browser response.
  return {
    'Cache-Control': `private, max-age=${ttlSeconds}`,
    Vary: 'Cookie',
  };
}

async function readLimited(response, maxBytes) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await response.body?.cancel();
    throw new Error('Feed response is too large.');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error('Feed response is too large.');
  return bytes;
}

function finiteCoordinate(value, low, high) {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= low && parsed <= high ? parsed : null;
}

function roundedQuarter(value) {
  const rounded = Math.round(value * 4) / 4;
  return Object.is(rounded, -0) ? 0 : rounded;
}

async function celestrak(request, group, fetchImpl) {
  if (request.method !== 'GET') return text('Method not allowed.', 405, { Allow: 'GET' });
  if (!TLE_GROUPS.has(group)) return text('Unknown CelesTrak group.', 404);
  try {
    const upstream = await cachedGet(
      fetchImpl,
      celestrakTleUrl(group),
      21_600,
      {
        Accept: 'text/plain',
        'User-Agent': 'gods-eye-view-celestrak-proxy/1.0 (+https://github.com/bilawalsidhu/gods-eye-view)',
      },
    );
    if (!upstream.ok) return text('CelesTrak is temporarily unavailable.', 502, { 'Retry-After': '300' });
    const bytes = await readLimited(upstream, MAX_TLE_BYTES);
    const prefix = new TextDecoder().decode(bytes.slice(0, 32 * 1024));
    if (!/^1 \d+/m.test(prefix)) return text('CelesTrak returned an invalid catalog.', 502, { 'Retry-After': '300' });
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        ...browserCache(21_600),
      },
    });
  } catch {
    return text('CelesTrak is temporarily unavailable.', 502, { 'Retry-After': '300' });
  }
}

function cleanCycloneText(value, maxLength, fallback = null) {
  if (typeof value !== 'string') return fallback;
  const textValue = value.trim();
  if (!textValue || textValue.length > maxLength || /[\u0000-\u001f<>]/.test(textValue)) return fallback;
  return textValue;
}

function cycloneTime(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + 5 * 60_000 || now - timestamp > 12 * 60 * 60_000) return null;
  return new Date(timestamp).toISOString();
}

function optionalNumber(value, low, high) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= low && numberValue <= high ? numberValue : null;
}

function cycloneSnapshot(payload, now) {
  if (!Array.isArray(payload?.activeStorms) || payload.activeStorms.length > 32) throw new Error('Invalid cyclone feed.');
  const seen = new Set();
  const storms = payload.activeStorms.map((raw) => {
    if (typeof raw?.id !== 'string' || !/^(?:al|ep|cp)\d{6}$/.test(raw.id) || seen.has(raw.id)) throw new Error('Invalid cyclone feed.');
    seen.add(raw.id);
    const name = cleanCycloneText(raw.name, 80);
    const classification = cleanCycloneText(raw.classification, 16);
    const positionAt = cycloneTime(raw.lastUpdate, now);
    const advisory = raw.forecastAdvisory;
    const issuedAt = cycloneTime(advisory?.issuance, now);
    const advisoryNumber = typeof advisory?.advNum === 'string' && /^\d{1,3}[A-Z]?$/i.test(advisory.advNum)
      ? advisory.advNum.replace(/^0+(?=\d)/, '').toUpperCase()
      : null;
    const longitude = optionalNumber(raw.longitudeNumeric, -180, 180);
    const latitude = optionalNumber(raw.latitudeNumeric, -90, 90);
    if (!name || !classification || !positionAt || !issuedAt || !advisoryNumber || longitude === null || latitude === null) throw new Error('Invalid cyclone feed.');
    const basin = raw.id.slice(0, 2).toUpperCase();
    const outlookBasin = basin === 'AL' ? 'atlc' : basin === 'CP' ? 'cpac' : 'epac';
    let advisoryUrl = null;
    if (typeof advisory.url === 'string') {
      try {
        const candidate = new URL(advisory.url);
        if (candidate.origin === 'https://www.nhc.noaa.gov' && !candidate.username && !candidate.password && !candidate.search && !candidate.hash && /^\/text\/[A-Z0-9]+\.shtml$/.test(candidate.pathname)) advisoryUrl = candidate.href;
      } catch { /* retain the current position without an untrusted external link */ }
    }
    return {
      id: raw.id,
      name,
      classification,
      basin,
      position: { longitude, latitude },
      positionAt,
      advisoryNumber,
      issuedAt,
      windKt: optionalNumber(raw.intensity, 0, 300),
      pressureHpa: optionalNumber(raw.pressure, 800, 1100),
      movement: {
        directionDegrees: optionalNumber(raw.movementDir, 0, 360),
        speedKt: optionalNumber(raw.movementSpeed, 0, 200),
      },
      advisoryUrl,
      outlookUrl: `https://www.nhc.noaa.gov/gtwo.php?basin=${outlookBasin}&fdays=7`,
      // The hosted route intentionally returns lightweight current positions;
      // the NOAA GIS forecast-cone/track requests remain unimplemented.
      geometryStatus: 'unavailable',
      geometryAdvisoryNumber: null,
      forecastPoints: [],
      track: null,
      cone: null,
    };
  });
  return validateCycloneSnapshot({
    schemaVersion: 1,
    source: 'NOAA NHC / CPHC',
    attribution: 'NOAA/NWS National Hurricane Center / Central Pacific Hurricane Center',
    coverage: 'Atlantic and eastern/central North Pacific; not worldwide cyclone coverage.',
    fetchedAt: now,
    stale: false,
    unavailable: false,
    reason: null,
    storms,
  });
}

async function cyclones(request, fetchImpl, now) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  try {
    const upstream = await cachedGet(fetchImpl, 'https://www.nhc.noaa.gov/CurrentStorms.json', 300, {
      Accept: 'application/json',
      'User-Agent': 'Gods Eye View (public NOAA weather context)',
    });
    if (!upstream.ok) return json({ error: 'The public cyclone advisory feed is temporarily unavailable.' }, 502, { 'Retry-After': '300' });
    const payload = JSON.parse(new TextDecoder().decode(await readLimited(upstream, MAX_CYCLONE_BYTES)));
    const snapshot = cycloneSnapshot(payload, now());
    return json(snapshot, 200, { ...browserCache(300), 'X-Feed-Source': 'NOAA NHC / CPHC' });
  } catch {
    return json({ error: 'The public cyclone advisory feed is temporarily unavailable.' }, 502, { 'Retry-After': '300' });
  }
}

async function flights(request, url, fetchImpl) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  const latitude = finiteCoordinate(url.searchParams.get('lat'), -90, 90);
  const longitude = finiteCoordinate(url.searchParams.get('lon'), -180, 180);
  if (latitude === null || longitude === null) {
    return json({ error: 'A valid map center is required for the regional flight feed.' }, 400);
  }
  const lat = roundedQuarter(latitude).toFixed(2);
  const lon = roundedQuarter(longitude).toFixed(2);
  const upstreamUrl = `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/250`;
  try {
    const upstream = await cachedGet(fetchImpl, upstreamUrl, 30);
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json({ error: 'The public flight feed is temporarily unavailable.' }, status, {
        'Retry-After': upstream.headers.get('retry-after') || '30',
      });
    }
    const payload = JSON.parse(new TextDecoder().decode(await readLimited(upstream, MAX_FLIGHT_BYTES)));
    const snapshot = normalizeAdsbLolPointResponse(payload);
    return json(snapshot, 200, {
      ...browserCache(20),
      'X-Flight-Source': 'ADSB.lol',
      'X-Flight-Coverage': '250 nm around the current map center',
      'X-Flight-Count': String(snapshot.states.length),
    });
  } catch {
    return json({ error: 'The public flight feed is temporarily unavailable.' }, 502, { 'Retry-After': '30' });
  }
}

async function military(request, fetchImpl) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  try {
    const upstream = await cachedGet(fetchImpl, 'https://api.adsb.lol/v2/mil', 30);
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json({ error: 'The public military-aircraft feed is temporarily unavailable.' }, status, {
        'Retry-After': upstream.headers.get('retry-after') || '30',
      });
    }
    const bytes = await readLimited(upstream, MAX_FLIGHT_BYTES);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=15',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
        'X-Feed-Source': 'adsb.lol',
        'X-Feed-Cache': 'EDGE',
      },
    });
  } catch {
    return json({ error: 'The public military-aircraft feed is temporarily unavailable.' }, 502, { 'Retry-After': '30' });
  }
}

async function launches(request, fetchImpl, now) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
  try {
    // Stable 15-minute windows make the edge cache effective and keep the
    // anonymous Launch Library request rate well below its published limit.
    const end = new Date(Math.floor(now() / 900_000) * 900_000);
    const upstream = await cachedGet(fetchImpl, launchLibraryRecentUrl(end), 900);
    if (!upstream.ok) {
      const status = upstream.status === 429 ? 429 : 502;
      return json({ error: 'The public launch feed is temporarily unavailable.' }, status, {
        'Retry-After': upstream.headers.get('retry-after') || '900',
      });
    }
    const bytes = await readLimited(upstream, MAX_LAUNCH_BYTES);
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(payload?.results)) throw new Error('Invalid launch feed.');
    return json(payload, 200, {
      ...browserCache(900),
      'X-GEV-Cache': 'EDGE',
    });
  } catch {
    return json({ error: 'The public launch feed is temporarily unavailable.' }, 502, { 'Retry-After': '900' });
  }
}

/** Authenticated keyless public-feed routes used by the hosted God’s Eye app. */
export async function handleGodsidePublicFeed(request, {
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  const url = new URL(request.url);
  const celestrakMatch = url.pathname.match(/^\/api\/celestrak\/([a-z0-9-]+)$/i);
  if (celestrakMatch) return celestrak(request, celestrakMatch[1].toLowerCase(), fetchImpl);
  if (url.pathname === '/api/flights') return flights(request, url, fetchImpl);
  if (url.pathname === '/api/military') return military(request, fetchImpl);
  if (url.pathname === '/api/launches') return launches(request, fetchImpl, now);
  if (url.pathname === '/api/cyclones') return cyclones(request, fetchImpl, now);
  if (url.pathname === '/api/military-installations' && request.method === 'GET') {
    // The upstream layer recognizes a capability miss and falls back to its
    // browser-fetched OpenStreetMap vector tiles and bundled site names.
    return json({ code: 'OVERPASS_NOT_CONFIGURED', unavailable: true, retryable: false });
  }
  if (url.pathname === '/api/tomtom/status' && request.method === 'GET') {
    return json({ hasKey: false, available: false, mode: 'openstreetmap' });
  }
  return null;
}
