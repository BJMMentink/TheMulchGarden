import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { decryptGodsideKey, encryptGodsideKey, godsideKeyStatuses, normalizeGodsideKey } from '../src/godside-crypto.js';

const secret = () => randomBytes(32).toString('base64url');

test('Godside keys encrypt with authenticated, user- and provider-bound envelopes', async () => {
  const key = 'example-provider-secret-123';
  const encryptionSecret = secret();
  const envelope = await encryptGodsideKey(key, encryptionSecret, 'user-1', 'googleMapsApiKey');

  assert.equal(envelope.version, 1);
  assert.notEqual(envelope.iv, envelope.ciphertext);
  assert.equal(JSON.stringify(envelope).includes(key), false);
  assert.equal(await decryptGodsideKey(envelope, encryptionSecret, 'user-1', 'googleMapsApiKey'), key);
  await assert.rejects(decryptGodsideKey(envelope, encryptionSecret, 'user-2', 'googleMapsApiKey'));
  await assert.rejects(decryptGodsideKey(envelope, encryptionSecret, 'user-1', 'openAiApiKey'));
  await assert.rejects(decryptGodsideKey(envelope, secret(), 'user-1', 'googleMapsApiKey'));
});

test('Godside key input is normalized and rejects invalid provider values', async () => {
  assert.equal(normalizeGodsideKey('  example-secret-123  '), 'example-secret-123');
  assert.throws(() => normalizeGodsideKey('short'));
  assert.throws(() => normalizeGodsideKey('valid-looking\nsecond-line'));
  await assert.rejects(encryptGodsideKey('key-example-123', secret(), 'user-1', 'unknownProvider'));
});

test('key status records expose only configured provider flags', () => {
  const statuses = godsideKeyStatuses([{ provider: 'openAiApiKey', envelope: { ciphertext: 'hidden' } }]);
  assert.equal(statuses.length, 9);
  assert.deepEqual(statuses.find((provider) => provider.id === 'openAiApiKey'),
    { id: 'openAiApiKey', label: 'OpenAI voice', exposure: 'server', configured: true, enabled: false });
  assert.equal(JSON.stringify(statuses).includes('hidden'), false);
  assert.equal(godsideKeyStatuses([{ provider: 'googleMapsApiKey', envelope: { enabled: true } }])[1].enabled, true);
});
