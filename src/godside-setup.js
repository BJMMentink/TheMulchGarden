import { KEY_SETUP_KEYS } from '../vendor/gods-eye-view/src/keySetupCore.mjs';
import { encryptGodsideKey } from './godside-crypto.js';

// The visible names come from God’s Eye’s own key registry. Storage IDs stay
// inside Mulch Garden and are never sent back as secret material.
export const GODSEYE_SETUP_FIELDS = Object.freeze({
  GOOGLE_MAPS_API_KEY: 'googleMapsApiKey',
  OPENAI_API_KEY: 'openAiApiKey',
  AISSTREAM_API_KEY: 'aisStreamApiKey',
  FIRMS_MAP_KEY: 'nasaFirmsMapKey',
  TOMTOM_API_KEY: 'tomTomApiKey',
  CESIUM_ION_TOKEN: 'cesiumIonToken',
  OPENSKY_CLIENT_ID: 'openSkyClientId',
  OPENSKY_CLIENT_SECRET: 'openSkyClientSecret',
  LL2_API_TOKEN: 'launchLibraryApiToken',
});

const VISIBLE_FIELDS = new Set(
  KEY_SETUP_KEYS.filter((entry) => !entry.hidden).flatMap((entry) => entry.envVars),
);

function envelopeFor(record) {
  if (record?.envelope) return record.envelope;
  if (typeof record?.envelope_json === 'string') {
    try { return JSON.parse(record.envelope_json); } catch { return null; }
  }
  return null;
}

export function godseyeSetupStatus(records = []) {
  const enabled = new Set(records.filter((record) => envelopeFor(record)?.enabled === true).map((record) => record.provider));
  const keys = KEY_SETUP_KEYS.filter((entry) => !entry.hidden).map((entry) => {
    const savedEnvVars = entry.envVars.filter((envVar) => enabled.has(GODSEYE_SETUP_FIELDS[envVar]));
    const set = savedEnvVars.length === entry.envVars.length;
    return {
      id: entry.id,
      title: entry.title,
      unlocks: entry.unlocks,
      getUrl: entry.getUrl,
      envVars: [...entry.envVars],
      tier: entry.tier,
      costLabel: entry.costLabel,
      costNote: entry.costNote,
      clientExposed: Boolean(entry.clientExposed),
      set,
      savedEnvVars,
      managed: 'account',
    };
  });
  return {
    keys,
    setCount: keys.filter((key) => key.set).length,
    total: keys.length,
    store: 'mulch-garden-account',
    alwaysShow: true,
  };
}

export function validateGodseyeSetupUpdates(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Key updates must be a JSON object.');
  }
  const entries = Object.entries(body);
  if (!entries.length || entries.length > 16) throw new Error('Add or remove at least one key.');
  const updates = {};
  for (const [envVar, rawValue] of entries) {
    if (!VISIBLE_FIELDS.has(envVar) || !Object.hasOwn(GODSEYE_SETUP_FIELDS, envVar)) {
      throw new Error('That key is not available in POWER UP.');
    }
    if (rawValue === null) {
      updates[envVar] = null;
      continue;
    }
    if (typeof rawValue !== 'string') throw new Error('Enter a text key value.');
    const value = rawValue.trim();
    if (!value || value.length > 512 || !/^[\x21-\x7e]+$/.test(value)) {
      throw new Error('Keys must be 1–512 printable characters with no spaces.');
    }
    updates[envVar] = value;
  }
  return updates;
}

export async function encryptGodseyeSetupUpdates(body, secret, userId) {
  const updates = validateGodseyeSetupUpdates(body);
  const operations = await Promise.all(Object.entries(updates).map(async ([envVar, value]) => {
    const provider = GODSEYE_SETUP_FIELDS[envVar];
    if (value === null) return { envVar, provider, envelope: null };
    return {
      envVar,
      provider,
      envelope: { ...await encryptGodsideKey(value, secret, userId, provider), enabled: true },
    };
  }));
  return operations;
}
