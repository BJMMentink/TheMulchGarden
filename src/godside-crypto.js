const encoder = new TextEncoder();

export const GODSIDE_PROVIDERS = Object.freeze({
  cesiumIonToken: Object.freeze({ label: 'Cesium ion', exposure: 'browser' }),
  googleMapsApiKey: Object.freeze({ label: 'Google Maps', exposure: 'browser' }),
  openAiApiKey: Object.freeze({ label: 'OpenAI voice', exposure: 'server' }),
  aisStreamApiKey: Object.freeze({ label: 'AISStream', exposure: 'server' }),
  nasaFirmsMapKey: Object.freeze({ label: 'NASA FIRMS', exposure: 'server' }),
  tomTomApiKey: Object.freeze({ label: 'TomTom', exposure: 'server' }),
  openSkyClientId: Object.freeze({ label: 'OpenSky client ID', exposure: 'server' }),
  openSkyClientSecret: Object.freeze({ label: 'OpenSky client secret', exposure: 'server' }),
  launchLibraryApiToken: Object.freeze({ label: 'Launch Library', exposure: 'server' }),
});

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlDecode(value) {
  const normalized = String(value).replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - String(value).length % 4) % 4);
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function encryptionKey(secret) {
  if (typeof secret !== 'string' || !secret) throw new Error('Godside key storage is not configured.');
  const raw = base64UrlDecode(secret);
  if (raw.byteLength !== 32) throw new Error('Godside key storage is not configured correctly.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function associatedData(userId, provider) {
  return encoder.encode(`mulch-garden:godside:v1:${userId}:${provider}`);
}

export function validateGodsideProvider(provider) {
  return Object.hasOwn(GODSIDE_PROVIDERS, provider);
}

export function normalizeGodsideKey(value) {
  if (typeof value !== 'string') throw new Error('Enter an API key.');
  const key = value.trim();
  if (key.length < 8 || key.length > 4096 || /[\r\n\0]/.test(key)) throw new Error('API keys must be 8–4096 characters on one line.');
  return key;
}

export async function encryptGodsideKey(value, secret, userId, provider) {
  if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: associatedData(userId, provider), tagLength: 128 },
    key,
    encoder.encode(value),
  );
  return { version: 1, iv: base64UrlEncode(iv), ciphertext: base64UrlEncode(new Uint8Array(ciphertext)) };
}

export async function decryptGodsideKey(envelope, secret, userId, provider) {
  if (!validateGodsideProvider(provider) || envelope?.version !== 1) throw new Error('Stored Godside key is invalid.');
  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlDecode(envelope.iv), additionalData: associatedData(userId, provider), tagLength: 128 },
    key,
    base64UrlDecode(envelope.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function godsideKeyStatuses(records = []) {
  const stored = new Map(records.map((record) => {
    let envelope = record.envelope;
    if (!envelope && typeof record.envelope_json === 'string') {
      try { envelope = JSON.parse(record.envelope_json); } catch { envelope = null; }
    }
    return [record.provider, envelope];
  }));
  return Object.entries(GODSIDE_PROVIDERS).map(([id, provider]) => ({
    id,
    label: provider.label,
    exposure: provider.exposure,
    configured: stored.has(id),
    enabled: stored.get(id)?.enabled === true,
  }));
}
