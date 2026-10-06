import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

export const SERVER_CONFIG = Object.freeze({
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 4173),
  godsidePort: Number(process.env.GODSIDE_VIEW_PORT || 4175),
  dataDirectory: process.env.DATA_DIR || join(ROOT, 'data'),
  godsideKeyEncryptionSecret: process.env.GODSIDE_KEY_ENCRYPTION_SECRET || '',
  sessionDays: 14,
  bodyLimitBytes: 100_000,
  secureCookies: process.env.NODE_ENV === 'production',
  mcpToken: process.env.MCP_TOKEN || '',
  mcpUsername: process.env.MCP_USERNAME || '',
  maxAccounts: 2,
  chatMaxMessageLength: 280,
  chatMaxMessages: 100,
});
