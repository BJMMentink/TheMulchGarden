# Cloudflare Pages + Worker + D1

This deployment keeps the website and God’s Eye in the browser, with account and key APIs on a Cloudflare Worker. Visitors do not download or install an app. The local development version continues to use the upstream God’s Eye Vite server.

## Pages build

Configure the Pages project at the repository root. The checked-in `.nvmrc` pins the upstream-supported Node 24 line.

- Build command: `pnpm --dir vendor/gods-eye-view install --frozen-lockfile && npm run build:godseye && npm run build:pages`
- Build output directory: `_site`
- `build:pages` copies the main site, its source modules, and the generated `public/godseye/` app into `_site`.
- The God’s Eye bundle in `public/godseye/` is generated and intentionally ignored by Git.
- Keep the repository’s root `functions/` directory enabled. Its `/godseye/*` gate verifies the Mulch Garden session before serving app files. The key dialog uses the same-origin `/api/setup/*` routes.

## Worker and database

1. Create a Worker named `the-mulch-garden-api` on the Workers Free plan and bind the `the-mulch-garden` D1 database as `DB`.
2. Apply `schema.sql` to a fresh database. For an existing database, apply all unapplied migrations, including `migrations/0005_add_godside_provider_keys.sql`.
3. Set `FRONTEND_ORIGIN` to the exact Pages hostname.
4. Store `BOOTSTRAP_PASSWORD_HASH` as a Worker secret, or use the one-time `BOOTSTRAP_PASSWORD` secret to hash the initial password inside the Worker. Remove bootstrap secrets after the first sign-in and change the password. Never put secrets in Git or chat.
5. Set `GODSIDE_KEY_ENCRYPTION_SECRET` as a Worker secret: 32 cryptographically random bytes encoded as base64url. Keep a secure backup; losing or rotating it without re-encrypting records makes stored keys unreadable.
6. Replace the D1 placeholder in the root `wrangler.toml` with the database ID. The database ID is not a secret.

The first Worker request creates the initial `Ben` account when a bootstrap secret is present. The local Node server and Worker use the same API routes, but their password-hash formats differ. The app stores provider keys in D1 as per-user AES-256-GCM envelopes; the native POWER UP status route never returns key values. The runtime route only returns enabled browser keys (Google Maps and Cesium ion) to that same signed-in account. Server-side keys, including OpenAI, are not included in browser runtime config.

## Current God’s Eye boundary

The Cloudflare build includes the genuine browser app, its normal side controls/filters, and the native POWER UP dialog. The `/godseye/*` route and key APIs are limited to signed-in members and admins. Keys entered in POWER UP are saved encrypted to that account and used by the app’s supported runtime paths.

This is not yet full feature parity with the local companion. Cloudflare does not currently implement every upstream `/api/*` data/provider route; live-data panels that depend on those routes may be unavailable. Local receiver hardware and OS services cannot be reached from a Cloudflare-hosted app. Do not describe the Cloudflare build as the complete upstream service until those routes are ported and tested.

## Strict $0 boundary

Cloudflare Free has hard request, CPU, and D1 usage limits. God’s Eye’s member-only Pages middleware runs before its app files, so those requests consume Workers/Pages Function quota; a large app load uses multiple requests. If a free limit is reached, requests can fail rather than silently upgrade. Keep the account on Free and stop if Cloudflare requests a paid plan or payment method.

Cloudflare hosting being free does not make provider services free. Google Maps and OpenAI can create usage charges; other providers have their own limits and terms. Do not enter a key unless you have reviewed its provider plan, restrictions, and quotas. No key should be added to this repository or pasted into chat.

No Cloudflare resources are created or deployed by the local build/test process. Deployment requires the account owner to configure Pages, D1, and Worker secrets in Cloudflare.
