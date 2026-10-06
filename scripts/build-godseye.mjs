import { spawnSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
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

  if (result.status === 0) {
    const outputDirectory = join(projectRoot, 'public', 'godseye');
    const pluginAssets = join(outputDirectory, 'godseye', 'cesium');
    const publicAssets = join(outputDirectory, 'cesium');

    // vite-plugin-cesium prefixes its output filesystem path with Vite's base
    // URL. The deployment output directory already represents /godseye/, so
    // that prefix creates a redundant public/godseye/godseye/cesium path.
    // Move the runtime assets to the location requested by /godseye/cesium/.
    if (existsSync(pluginAssets)) {
      if (existsSync(publicAssets)) {
        throw new Error('God’s Eye build produced Cesium assets in both expected and nested locations.');
      }
      renameSync(pluginAssets, publicAssets);
      rmSync(join(outputDirectory, 'godseye'), { recursive: true, force: true });
    }

    if (!existsSync(join(publicAssets, 'Cesium.js')) || !existsSync(join(publicAssets, 'Widgets', 'widgets.css'))) {
      throw new Error('God’s Eye build is missing its Cesium runtime assets at public/godseye/cesium/.');
    }
  }
}
