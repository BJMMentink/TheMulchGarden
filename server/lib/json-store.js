import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class JsonStore {
  constructor(directory) { this.directory = directory; }
  async read(name, fallback) {
    await mkdir(this.directory, { recursive: true });
    try { return JSON.parse(await readFile(join(this.directory, `${name}.json`), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; return fallback; }
  }
  async write(name, value) {
    await mkdir(this.directory, { recursive: true });
    const target = join(this.directory, `${name}.json`);
    const temporary = `${target}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, target);
  }
}

