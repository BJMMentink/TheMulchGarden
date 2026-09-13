import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SERVER_CONFIG } from './server/config.js';
import { createAuthController } from './server/controllers/auth-controller.js';
import { createAppController } from './server/controllers/app-controller.js';
import { createRouter } from './server/router.js';
import { Repository } from './server/models/repository.js';

const PROJECT_ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_ROOT = join(PROJECT_ROOT, 'public');
const SOURCE_ROOT = join(PROJECT_ROOT, 'src');
const MIME_TYPES = Object.freeze({ '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' });
const repository = new Repository(SERVER_CONFIG.dataDirectory);
const auth = createAuthController(repository, SERVER_CONFIG);
const app = createAppController(repository, auth, SERVER_CONFIG);
const routeApi = createRouter({ auth, app, bodyLimit: SERVER_CONFIG.bodyLimitBytes });

function staticPath(requestUrl) {
  const requestedPath = decodeURIComponent(new URL(requestUrl, 'http://localhost').pathname);
  const relativePath = requestedPath === '/' ? 'index.html' : requestedPath.slice(1);
  const base = requestedPath.startsWith('/src/') ? SOURCE_ROOT : PUBLIC_ROOT;
  const candidate = normalize(join(requestedPath.startsWith('/src/') ? PROJECT_ROOT : PUBLIC_ROOT, relativePath));
  return candidate === base || candidate.startsWith(`${base}${sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
  if (request.url?.startsWith('/api/')) { await routeApi(request, response); return; }
  if (request.method !== 'GET') { response.writeHead(405); response.end('Method Not Allowed'); return; }
  try {
    const filePath = staticPath(request.url || '/');
    if (!filePath) throw Object.assign(new Error('Forbidden'), { code: 'E_FORBIDDEN' });
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  } catch (error) {
    response.writeHead(error.code === 'E_FORBIDDEN' ? 403 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error.code === 'E_FORBIDDEN' ? 'Forbidden' : 'Not Found');
  }
});

await repository.ensureBootstrapAccount();
server.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => console.log(`The Mulch Garden is running at http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`));
