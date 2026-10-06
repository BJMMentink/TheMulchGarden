import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LOCAL_PROVIDER_ENV = Object.freeze([
  'GOOGLE_MAPS_API_KEY',
  'GOOGLE_MAPS_SERVER_API_KEY',
  'OPENAI_API_KEY',
  'AISSTREAM_API_KEY',
  'FIRMS_MAP_KEY',
  'TOMTOM_API_KEY',
  'CESIUM_ION_TOKEN',
  'OPENSKY_CLIENT_ID',
  'OPENSKY_CLIENT_SECRET',
  'LL2_API_TOKEN',
]);

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Start the upstream browser app on a loopback-only companion port. */
export async function startGodsideViewServer(projectRoot, port, sitePort, dataDirectory) {
  const upstreamRoot = join(projectRoot, 'vendor', 'gods-eye-view');
  const viteEntry = join(upstreamRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const configFile = join(upstreamRoot, 'server', 'standalone', 'vite.config.js');
  if (!existsSync(viteEntry)) {
    return { available: false, port, message: 'God’s Eye View dependencies are not installed yet.' };
  }

  const localAncestors = [
    `http://localhost:${sitePort}`,
    `http://127.0.0.1:${sitePort}`,
  ].join(' ');
  const environment = {
    ...process.env,
    HOST: '127.0.0.1',
    PORT: String(port),
    DATA_DIR: resolve(projectRoot, dataDirectory),
    GEV_EMBED_FRAME_ANCESTORS: localAncestors,
  };
  for (const name of LOCAL_PROVIDER_ENV) environment[name] = '';

  const child = spawn(process.execPath, [viteEntry, '--config', configFile, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: upstreamRoot,
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  let exited = false;
  child.once('error', () => { exited = true; });
  child.once('exit', () => { exited = true; });
  process.once('exit', () => { if (!exited) child.kill(); });

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/?embed=1`, { signal: AbortSignal.timeout(800) });
      if (response.status === 401 || response.ok) return { available: true, port, child };
      if (response.status >= 500) return { available: true, port, child };
    } catch {
      await delay(150);
    }
  }
  if (!exited) child.kill();
  return { available: false, port, message: 'The local God’s Eye View app did not finish starting.' };
}
