import { AsyncLocalStorage } from 'node:async_hooks';

const providerContext = new AsyncLocalStorage();

/** Run one provider request with the calling member's decrypted keys. */
export function withGodseyeProviderContext(context, callback) {
  return providerContext.run(context, callback);
}

/** Read a provider key without mutating process.env. */
export function getGodseyeProviderKey(envVar) {
  const context = providerContext.getStore();
  if (context && Object.hasOwn(context.keys || {}, envVar)) {
    return String(context.keys[envVar] || '').trim();
  }
  return String(process.env[envVar] || '').trim();
}

/** Stable per-account cache/token namespace; never the key value itself. */
export function getGodseyeProviderUserId() {
  return String(providerContext.getStore()?.userId || 'standalone');
}
