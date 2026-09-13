# Free Cloudflare backend

This directory contains the production API adapter for GitHub Pages. It uses a Cloudflare Worker and D1 SQLite database; it has no paid-only services or third-party runtime dependencies.

## One-time Cloudflare setup

1. Create a Worker named `the-mulch-garden-api` on the Workers Free plan.
2. Create a D1 database named `the-mulch-garden` and bind it to the Worker as `DB`.
3. Run `schema.sql` against that D1 database.
4. Set the Worker secret `BOOTSTRAP_PASSWORD_HASH` to the generated hash for the temporary `adm1n` password. Do not put the plaintext password or secret in Git.
5. Set `FRONTEND_ORIGIN` to the exact GitHub Pages URL shown by GitHub.

The Worker creates the initial `Ben` account on its first request when `BOOTSTRAP_PASSWORD_HASH` is present. After signing in, change the password from Account settings. The local server and this Worker intentionally share the same API contract, but their password hashes are not interchangeable because the Worker uses Web Crypto PBKDF2 (50,000 iterations, deliberately below the current Workers limit for this low-volume personal app).

The root `wrangler.toml` is used by Cloudflare's GitHub deployment flow. Replace its D1 placeholder with the database ID after creating the database; this ID is not a secret.

Cloudflare's free plan is sufficient for this lightweight personal app. If the dashboard asks for a payment method or paid plan, stop and do not continue.
