import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

export async function loadOrCreateLocalEncryptionSecret(path) {
  await mkdir(dirname(path), { recursive: true });
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const secret = randomBytes(32).toString('base64url');
  try {
    await writeFile(path, `${secret}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    return secret;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return (await readFile(path, 'utf8')).trim();
  }
}
