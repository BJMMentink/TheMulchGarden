const SETTINGS_TIMEOUT_MS = 10_000;

const KEYLESS_WARNING =
  'Saved settings are unavailable; God’s Eye is starting with the keyless globe.';

function keylessSettings() {
  return { keys: {}, warning: KEYLESS_WARNING };
}

/**
 * Load this account's saved provider settings without letting a stalled API
 * request leave the whole globe on its initial loading screen. Authentication
 * failures remain fatal; transient/backend failures start the no-key app and
 * never clear or overwrite the saved settings.
 */
export async function loadStandaloneRuntimeSettings({
  fetchImpl = (...args) => fetch(...args),
  timeoutMs = SETTINGS_TIMEOUT_MS,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    try {
      response = await fetchImpl('/api/godside/runtime', {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } catch {
      return keylessSettings();
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'Sign in to a Mulch Garden account to open God’s Eye View.',
      );
    }
    if (!response.ok) return keylessSettings();

    let payload;
    try {
      payload = await response.json();
    } catch {
      return keylessSettings();
    }
    if (
      !payload ||
      typeof payload.keys !== 'object' ||
      payload.keys === null ||
      Array.isArray(payload.keys)
    )
      return keylessSettings();

    return { keys: payload.keys, warning: null };
  } finally {
    clearTimeout(timeout);
  }
}
