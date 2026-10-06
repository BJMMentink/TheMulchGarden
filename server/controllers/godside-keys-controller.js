import { decryptGodsideKey, GODSIDE_PROVIDERS, encryptGodsideKey, godsideKeyStatuses, normalizeGodsideKey, validateGodsideProvider } from '../../src/godside-crypto.js';

export function createGodsideKeysController(repository, encryptionSecret) {
  function requireEncryption() {
    if (!encryptionSecret) throw Object.assign(new Error('Secure key storage is not configured.'), { status: 503 });
  }

  return {
    async statuses(user) {
      requireEncryption();
      return { providers: godsideKeyStatuses(await repository.listGodsideKeys(user.id)) };
    },
    async save(user, body) {
      requireEncryption();
      const provider = String(body?.provider || '');
      if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
      const value = normalizeGodsideKey(body?.key);
      const encrypted = { ...await encryptGodsideKey(value, encryptionSecret, user.id, provider), enabled: body?.enabled === true };
      await repository.saveGodsideKey(user.id, provider, encrypted);
      return { ok: true, provider, label: GODSIDE_PROVIDERS[provider].label };
    },
    async setEnabled(user, provider, enabled) {
      requireEncryption();
      if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
      if (typeof enabled !== 'boolean') throw new Error('Choose whether to enable this provider.');
      await repository.setGodsideKeyEnabled(user.id, provider, enabled);
      return { ok: true, provider, enabled };
    },
    async runtimeConfig(user) {
      requireEncryption();
      const records = await repository.listGodsideKeys(user.id);
      const keys = {};
      for (const record of records) {
        if (record.envelope?.enabled !== true || GODSIDE_PROVIDERS[record.provider]?.exposure !== 'browser') continue;
        keys[record.provider] = await decryptGodsideKey(record.envelope, encryptionSecret, user.id, record.provider);
      }
      return { keys };
    },
    async serverKey(user, provider) {
      requireEncryption();
      if (!validateGodsideProvider(provider)) return '';
      const record = (await repository.listGodsideKeys(user.id)).find((item) => item.provider === provider);
      if (!record || record.envelope?.enabled !== true || GODSIDE_PROVIDERS[provider].exposure !== 'server') return '';
      return decryptGodsideKey(record.envelope, encryptionSecret, user.id, provider);
    },
    async remove(user, provider) {
      requireEncryption();
      if (!validateGodsideProvider(provider)) throw new Error('Unknown Godside provider.');
      await repository.deleteGodsideKey(user.id, provider);
      return { ok: true, provider };
    },
  };
}
