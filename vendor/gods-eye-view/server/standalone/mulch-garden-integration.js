import { createAuthController } from '../../../../server/controllers/auth-controller.js';
import { loadOrCreateLocalEncryptionSecret } from '../../../../server/lib/local-encryption-secret.js';
import { Repository } from '../../../../server/models/repository.js';
import { SERVER_CONFIG } from '../../../../server/config.js';
import { decryptGodsideKey, GODSIDE_PROVIDERS } from '../../../../src/godside-crypto.js';
import { encryptGodseyeSetupUpdates, godseyeSetupStatus } from '../../../../src/godside-setup.js';
import { GODSEYE_SETUP_FIELDS } from '../../../../src/godside-setup.js';
import { withGodseyeProviderContext } from '../../../../src/godside-provider-context.js';
import { join } from 'node:path';

let vaultPromise;

async function vault() {
  vaultPromise ||= (async () => {
    const repository = new Repository(SERVER_CONFIG.dataDirectory);
    const secret = SERVER_CONFIG.godsideKeyEncryptionSecret || await loadOrCreateLocalEncryptionSecret(
      join(SERVER_CONFIG.dataDirectory, 'godside-key-encryption.secret'),
    );
    return { repository, secret, auth: createAuthController(repository, SERVER_CONFIG) };
  })();
  return vaultPromise;
}

async function signedInUser(request) {
  const { auth } = await vault();
  const user = await auth.current(request);
  return ['user', 'admin'].includes(user?.role) ? user : null;
}

async function enabledProviderKey(request, providerId) {
  const user = await signedInUser(request);
  if (!user) return '';
  const { repository, secret } = await vault();
  const record = (await repository.listGodsideKeys(user.id)).find((item) => item.provider === providerId);
  if (!record || record.envelope?.enabled !== true) return '';
  return decryptGodsideKey(record.envelope, secret, user.id, providerId);
}

async function providerContextForUser(user) {
  const { repository, secret } = await vault();
  const records = await repository.listGodsideKeys(user.id);
  const byProvider = new Map(records.map((record) => [record.provider, record.envelope]));
  const keys = Object.fromEntries(Object.keys(GODSEYE_SETUP_FIELDS).map((envVar) => [envVar, '']));
  for (const [envVar, providerId] of Object.entries(GODSEYE_SETUP_FIELDS)) {
    const provider = GODSIDE_PROVIDERS[providerId];
    const envelope = byProvider.get(providerId);
    if (provider?.exposure !== 'server' || envelope?.enabled !== true) continue;
    keys[envVar] = await decryptGodsideKey(envelope, secret, user.id, providerId);
  }
  return { userId: user.id, keys };
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(JSON.stringify(payload));
}

async function readSetupBody(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Send key updates as JSON.'), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw Object.assign(new Error('Key update is too large.'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Key update is not valid JSON.'), { status: 400 }); }
}

function sameOriginSetupRequest(request) {
  const host = String(request.headers.host || '').toLowerCase();
  const origin = String(request.headers.origin || '').toLowerCase();
  const expected = `${request.socket?.encrypted ? 'https' : 'http'}://${host}`;
  return Boolean(host && origin === expected);
}

/** Vite middleware that ties the upstream app to Mulch Garden's local login and key vault. */
export function mulchGardenIntegrationPlugin() {
  return {
    name: 'mulch-garden-access-and-keys',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        let pathname;
        try { pathname = new URL(request.url || '/', 'http://localhost').pathname; }
        catch { return sendJson(response, 400, { error: 'Invalid request.' }); }

        const requiresMember = pathname === '/' || pathname === '/index.html' || pathname.startsWith('/api/');
        if (!requiresMember) return next();

        let user;
        try { user = await signedInUser(request); }
        catch { return sendJson(response, 503, { error: 'Member access could not be checked.' }); }
        if (!user) return sendJson(response, 401, { error: 'Sign in to a Mulch Garden account to open God’s Eye View.' });

        if (pathname === '/api/setup/status') {
          if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' });
          try {
            const { repository } = await vault();
            return sendJson(response, 200, godseyeSetupStatus(await repository.listGodsideKeys(user.id)));
          } catch {
            return sendJson(response, 503, { error: 'Key settings are temporarily unavailable.' });
          }
        }

        if (pathname === '/api/setup/keys') {
          if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed.' });
          if (!sameOriginSetupRequest(request)) return sendJson(response, 403, { error: 'Key updates must come from this God’s Eye page.' });
          try {
            const { repository, secret } = await vault();
            const body = await readSetupBody(request);
            const operations = await encryptGodseyeSetupUpdates(body, secret, user.id);
            for (const operation of operations) {
              if (operation.envelope) await repository.saveGodsideKey(user.id, operation.provider, operation.envelope);
              else await repository.deleteGodsideKey(user.id, operation.provider);
            }
            const status = godseyeSetupStatus(await repository.listGodsideKeys(user.id));
            return sendJson(response, 200, { ok: true, saved: operations.map((operation) => operation.envVar), status });
          } catch (error) {
            return sendJson(response, error.status || 400, { ok: false, error: error.message || 'Key updates could not be saved.' });
          }
        }

        if (pathname !== '/api/godside/runtime') {
          if (!pathname.startsWith('/api/')) return next();
          try {
            const providerContext = await providerContextForUser(user);
            return withGodseyeProviderContext(providerContext, next);
          } catch {
            return sendJson(response, 503, { error: 'Provider settings are temporarily unavailable.' });
          }
        }
        if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed.' });

        try {
          const { repository, secret } = await vault();
          const records = await repository.listGodsideKeys(user.id);
          const keys = {};
          for (const record of records) {
            if (record.envelope?.enabled !== true || GODSIDE_PROVIDERS[record.provider]?.exposure !== 'browser') continue;
            keys[record.provider] = await decryptGodsideKey(record.envelope, secret, user.id, record.provider);
          }
          return sendJson(response, 200, { keys });
        } catch {
          return sendJson(response, 503, { error: 'Provider settings are temporarily unavailable.' });
        }
      });
    },
  };
}

/** Resolve OpenAI credentials from the authenticated account, never process-wide environment. */
export async function resolveMulchGardenOpenAiKey(request) {
  try { return await enabledProviderKey(request, 'openAiApiKey'); }
  catch { return ''; }
}
