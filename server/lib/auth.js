import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 4 || password.length > 200) throw new Error('Password must be 4–200 characters.');
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N: 16_384, r: 8, p: 1 });
  return `scrypt:${salt.toString('base64url')}:${Buffer.from(key).toString('base64url')}`;
}

export async function verifyPassword(password, encodedHash) {
  try {
    const [, saltText, keyText] = encodedHash.split(':');
    const expected = Buffer.from(keyText, 'base64url');
    const actual = Buffer.from(await scrypt(password, Buffer.from(saltText, 'base64url'), expected.length, { N: 16_384, r: 8, p: 1 }));
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}

export const createSessionToken = () => randomBytes(32).toString('base64url');
export const tokenDigest = (token) => createHash('sha256').update(token).digest('base64url');
export function parseCookies(header = '') { return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value)); }
export function sessionCookie(token, secure, maxAge) { return `mg_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`; }
export const expiredSessionCookie = () => 'mg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
