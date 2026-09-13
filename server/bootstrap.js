export const BOOTSTRAP_ACCOUNT = Object.freeze({
  username: 'Ben',
  // Keep the bootstrap hash out of public source. The existing local data/ seed
  // remains usable; a fresh setup can provide BOOTSTRAP_PASSWORD_HASH locally.
  passwordHash: process.env.BOOTSTRAP_PASSWORD_HASH || '',
});
