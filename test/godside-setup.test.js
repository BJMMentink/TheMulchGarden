import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { decryptGodsideKey } from '../src/godside-crypto.js';
import { encryptGodseyeSetupUpdates, godseyeSetupStatus, validateGodseyeSetupUpdates } from '../src/godside-setup.js';

const secret = randomBytes(32).toString('base64url');

test('native POWER UP status follows God’s Eye registry and never returns saved values', () => {
  const status = godseyeSetupStatus([
    { provider: 'googleMapsApiKey', envelope: { enabled: true, ciphertext: 'cipher-only' } },
    { provider: 'openSkyClientId', envelope: { enabled: true } },
  ]);
  assert.equal(status.store, 'mulch-garden-account');
  assert.equal(status.alwaysShow, true);
  assert.equal(status.keys.find((key) => key.id === 'google-maps').set, true);
  const openSky = status.keys.find((key) => key.id === 'opensky');
  assert.equal(openSky.set, false);
  assert.match(openSky.costNote, /research and non-commercial/i);
  assert.equal(status.keys.find((key) => key.id === 'google-maps').costLabel, 'BILLING REQUIRED');
  assert.deepEqual(openSky.savedEnvVars, ['OPENSKY_CLIENT_ID']);
  assert.equal(status.keys.some((key) => key.id === 'google-maps-server'), false);
  assert.equal(JSON.stringify(status).includes('cipher-only'), false);
});

test('native POWER UP updates validate known key names and encrypt values per user', async () => {
  assert.throws(() => validateGodseyeSetupUpdates({ NOT_A_KEY: 'not-secret' }), /not available/);
  assert.throws(() => validateGodseyeSetupUpdates({ GOOGLE_MAPS_API_KEY: 'bad\nkey' }), /printable/);
  const value = 'AIza-example-private-key-123456';
  const operations = await encryptGodseyeSetupUpdates({ GOOGLE_MAPS_API_KEY: value }, secret, 'member-1');
  assert.equal(operations[0].provider, 'googleMapsApiKey');
  assert.notEqual(operations[0].envelope.ciphertext, value);
  assert.equal(operations[0].envelope.enabled, true);
  assert.equal(await decryptGodsideKey(operations[0].envelope, secret, 'member-1', 'googleMapsApiKey'), value);
  await assert.rejects(decryptGodsideKey(operations[0].envelope, secret, 'member-2', 'googleMapsApiKey'));
});
