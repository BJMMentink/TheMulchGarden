# The Mulch Garden

The Mulch Garden is a lightweight, mobile-first MVC web application for projects, next actions, and a shared Interest Engine that will later power curated content.

## Run locally

Requirements: Node.js 20 or newer. There are no runtime or development dependencies.

```powershell
node server.js
```

Open <http://127.0.0.1:4173>. Run the unit tests with:

```powershell
node --test
```

Sign in with the provisioned local `Ben` account using the temporary password `adm1n`, then change it from Account settings. Passwords must be at least 4 characters for this private, low-risk personal app and are still salted and hashed; they are never stored in plaintext. Usernames, password hashes, sessions, and application data are stored in the ignored `data/` directory, and public registration is disabled. A fresh clone should set `BOOTSTRAP_PASSWORD_HASH` to a locally generated hash before first launch; the hash is intentionally not in this public repository.

## Current V1

- MVC backend with JSON API routes, server-side user data, secure session cookies, and scrypt password hashing.
- Dynamic first-launch onboarding for creators, gaming, technology/AI, entertainment, and professional interests. Starter choices are ranked from a small public catalog using popularity plus the user's selections.
- Seeded creator preferences: Nuxinor 5/5, Luke Stephens 5/5, and Asmongold 5/5.
- Add and rate creators, topics, games, and keywords.
- Personal and professional projects with lightweight todo lists for SaberDueler and GMCHE art class.
- Responsive UI designed for a phone first, with a wider desktop layout.
- Tested Interest Engine module with explicit interfaces for future content scoring and feedback.

## Project map

- `public/`: browser entry point and design tokens/styles.
- `src/config.js`: centralized configuration and shared option definitions.
- `src/default-data.js`: portable seed/default state.
- `src/storage.js`: browser API client boundary.
- `src/interest-engine.js`: presentation-independent interest creation, rating, scoring, and feedback primitives.
- `src/app.js`: thin UI composition and event wiring.
- `server/`: backend configuration, JSON repository, authentication, controllers, and router.
- `server.js`: dependency-free MVC web server and static asset host.
- `docs/`: product scope, architecture, decisions, acceptance criteria, and milestone handoff.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PRODUCT-SCOPE.md`](docs/PRODUCT-SCOPE.md) before extending the project.

## Free hosting

The production shape is a static GitHub Pages frontend plus a Cloudflare Worker/D1 API. Both have free tiers suitable for this small personal app, and neither requires committing secrets. Deployment files are in `.github/workflows/pages.yml` and `cloudflare/`.

GitHub Pages publishes the `master` branch through Actions. The Pages build copies only the browser assets; the local Node MVC server is still used for development. Cloudflare stores production users, sessions, and application state in D1. Never commit `data/`, password hashes intended as secrets, API keys, or other production secrets.
