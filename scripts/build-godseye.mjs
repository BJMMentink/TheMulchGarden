import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const appRoot = join(projectRoot, 'vendor', 'gods-eye-view');
const vite = join(appRoot, 'node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(vite)) {
  console.error('God’s Eye dependencies are missing. Install vendor/gods-eye-view dependencies with its pnpm lockfile, then retry.');
  process.exitCode = 1;
} else {
  const result = spawnSync(process.execPath, [
    vite,
    'build',
    '--config', 'server/standalone/vite.config.js',
    '--base=/godseye/',
    '--outDir=../../public/godseye',
    '--emptyOutDir',
  ], { cwd: appRoot, stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
}
