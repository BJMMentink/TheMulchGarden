# The Mulch Garden

The Mulch Garden is a lightweight, mobile-first MVC web application for projects, next actions, and a shared Interest Engine that will later power curated content.

## Run locally

Requirements: Node.js 24.14–24.x or 26.x for the embedded God’s Eye View companion. If its vendored `node_modules` folder is missing, install its dependencies once with `corepack pnpm --dir vendor/gods-eye-view install --frozen-lockfile`; then start the whole site from the repository root. Visitors do not install anything.

```powershell
node server.js
```

Open <http://127.0.0.1:4173>. Run the unit tests with:

```powershell
node --test test/*.test.js
```

Sign in with the provisioned local `Ben` account using the temporary password `adm1n`, then change it from Account settings. Passwords must be at least 4 characters for this private, low-risk personal app and are still salted and hashed; they are never stored in plaintext. Usernames, password hashes, sessions, and application data are stored in the ignored `data/` directory, and public registration is disabled. A fresh clone should set `BOOTSTRAP_PASSWORD_HASH` to a locally generated hash before first launch; the hash is intentionally not in this public repository.

## Current V1

- MVC backend with JSON API routes, server-side user data, secure session cookies, and scrypt password hashing.
- A Games tab with the first game, Get to know me: twenty-question rounds that progressively build editable interest signals.
- Get to know me uses a light preference-based tone and accent that updates as the interest map grows.
- Account settings includes a small editable-interest summary of known likes, dislikes, and open areas.
- A shared bottom-right Garden chat keeps short username-prefixed messages with Discord-style gap timestamps.
- Seeded creator preferences: Nuxinor 5/5, Luke Stephens 5/5, and Asmongold 5/5.
- Add and rate creators, topics, games, and keywords.
- Personal and professional projects with lightweight todo lists for SaberDueler and GMCHE art class.
- Responsive UI designed for a phone first, with a wider desktop layout.
- A member/admin-only World panel embedding the genuine God’s Eye View app, including its side controls, data filters, and native POWER UP key dialog. Keys entered there are encrypted and scoped to the signed-in account. Provider usage can have separate charges; see [`docs/GODSIDE.md`](docs/GODSIDE.md) for local setup, Cloudflare support, and cost limits.
- Tested Interest Engine module with explicit interfaces for future content scoring and feedback.

## Project map

- `public/`: browser entry point and design tokens/styles.
- `src/config.js`: centralized configuration and shared option definitions.
- `src/default-data.js`: portable seed/default state.
- `src/storage.js`: browser API client boundary.
- `src/interest-engine.js`: presentation-independent interest creation, rating, scoring, and feedback primitives.
- `src/get-to-know-me.js`: presentation-independent twenty-question game state and answer logic.
- `src/app.js`: thin UI composition and event wiring.
- `server/`: backend configuration, JSON repository, authentication, controllers, and router.
- `server.js`: dependency-free MVC web server and static asset host.
- `docs/`: product scope, architecture, decisions, acceptance criteria, and milestone handoff.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PRODUCT-SCOPE.md`](docs/PRODUCT-SCOPE.md) before extending the project.

## Free hosting

GitHub remains the source-control repository and the `master` branch is connected to Cloudflare Pages. For the Pages build, use the checked-in Node version and run `pnpm --dir vendor/gods-eye-view install --frozen-lockfile && npm run build:godseye && npm run build:pages`; set the build output directory to `_site`. The generated `/godseye/` app is protected by a member-only Pages Function; its native key dialog saves to the encrypted per-user Cloudflare D1 vault. The Pages proxy forwards `/api/*` to the Cloudflare Worker and D1 database. Cloudflare's app bundle is not yet full feature parity with the upstream provider API routes; see [`docs/GODSIDE.md`](docs/GODSIDE.md).

The local Node/Vite version has the upstream data-provider server. The Cloudflare build includes the browser app and member/key flows, but its full live-data API parity is not complete yet; some upstream data panels can be unavailable there. Pages Functions and D1 also have free-tier request/usage limits. Do not add a paid plan or a provider key without reviewing its own billing and quotas.

The local Node MVC server is still used for development. Cloudflare stores production users, sessions, and application state in D1. Never commit `data/`, password hashes intended as secrets, API keys, or other production secrets. The old GitHub Pages workflow has been removed so GitHub Pages is no longer part of the production path.
