import { copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDirectory = join(projectRoot, '_site');
const publicDirectory = join(projectRoot, 'public');
const sourceDirectory = join(projectRoot, 'src');

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(publicDirectory, outputDirectory, { recursive: true });
await mkdir(join(outputDirectory, 'src'), { recursive: true });

for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) {
    await copyFile(join(sourceDirectory, entry.name), join(outputDirectory, 'src', entry.name));
  }
}

const indexPath = join(outputDirectory, 'index.html');
const indexHtml = await readFile(indexPath, 'utf8');
const revision = String(process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || 'local').slice(0, 12);
const cacheTag = `v=${encodeURIComponent(revision)}`;
const versionedHtml = indexHtml
  .replace('href="./styles.css"', `href="./styles.css?${cacheTag}"`)
  .replace('src="./src/app.js"', `src="./src/app.js?${cacheTag}"`);

if (versionedHtml === indexHtml) {
  throw new Error('Expected the site stylesheet and application script references in public/index.html.');
}

await writeFile(indexPath, versionedHtml);
await writeFile(join(outputDirectory, '.nojekyll'), '');
