// Production API. Keep this value non-secret; authentication uses session tokens.
// Cloudflare Pages uses the same-origin /api proxy. The local server can still
// be pointed at the Worker directly when needed.
globalThis.MULCH_API_BASE = '';
