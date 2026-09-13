# V1 Architecture

## Principles

1. Local-first: the first backend stores data locally and has no third-party API or private watch-history dependency.
2. Small surface area: browser-native APIs and Node's standard library are preferred over frameworks and services.
3. Explicit boundaries: storage, domain logic, configuration, and presentation communicate through small functions and plain objects.
4. Portable data: application state is JSON-shaped and stored under one versioned localStorage key so export/import can be added without a migration from opaque structures.
5. Replaceable UI: the Interest Engine does not know about the DOM; CSS custom properties and semantic component classes isolate visual redesigns.

## MVC runtime flow

`server.js` routes `/api/*` requests through `server/router.js` to authentication or application controllers. Controllers use the repository in `server/models/repository.js`; the repository serializes users, sessions, and per-user state as JSON files with atomic replacement. `public/index.html` loads `src/app.js` as an ES module. The browser client calls `src/storage.js`, renders views, and calls `interest-engine.js` for domain operations.

The MVC separation is:

- Model: `src/interest-engine.js`, `src/default-data.js`, and `server/models/repository.js`.
- View: `public/index.html`, `public/styles.css`, and render functions in `src/app.js`.
- Controller: `server/controllers/*` and `server/router.js`.

## Production deployment boundary

The browser can point at either the local Node API or the production Cloudflare Worker by changing `public/runtime-config.js`. The browser API client is the stable boundary; both backends implement the same routes:

- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `PATCH /api/auth/me`
- `GET /api/members`
- `GET /api/state`
- `PUT /api/state`

GitHub Pages is intentionally static. Cloudflare Worker + D1 provides the free production API and database. The Worker uses Web Crypto PBKDF2 and bearer-capable sessions so a GitHub Pages origin can authenticate without depending solely on cross-site cookies. See `cloudflare/README.md` for the one-time dashboard setup.

## Domain interfaces

### State

```js
{
  version: 1,
  onboarding: { completed: Boolean, version: Number },
  interests: [{ id, name, category, rating, source }],
  projects: [{ id, name, type, color, todos: [{ id, title, done }] }],
  todos: [{ id, title, done, projectId, tags, addedBy, assignedTo, createdAt, updatedAt }],
  feedback: [{ contentId, action, createdAt }]
}
```

Todos are a top-level shared collection so tasks can belong to a project without being owned by one project view. `addedBy` and `assignedTo` contain user IDs; `everyone` is the explicit all-users assignment. `GET /api/members` returns only user IDs and usernames for authenticated todo labels.

### Interest Engine

- `createInterest({ name, category, rating, source })` returns a validated interest.
- `clampRating(rating)` normalizes ratings to the configured range.
- `scoreContent(content, interests)` returns `{ score, matches }`; creator and topic/game/keyword signals can combine.
- `recordFeedback(state, contentId, action)` records future feedback controls without requiring a content provider.

Future integrations should adapt external data into a stable content object (`id`, `creator`, `topic`, `title`, `tags`) and call the engine. The engine should not call Gmail, YouTube, or calendar APIs directly.

## Security baseline

- Passwords use Node's `crypto.scrypt` with a random salt; plaintext passwords are never persisted. The current private-app policy accepts 4–200 characters.
- Sessions use high-entropy random tokens. Only a SHA-256 digest is stored server-side.
- Public registration is disabled. Accounts are provisioned server-side and the system is reserved for two known accounts.
- Session cookies are `HttpOnly` and `SameSite=Lax`; production enables `Secure` cookies.
- User data is kept in per-user files under ignored `data/` and writes use a temporary file plus rename.
- A public deployment still needs HTTPS, rate limiting, backups, secret management, monitoring, and a database designed for concurrent writes.

## Future seams

- Replace `storage.js` with an export/import-capable repository without changing the views.
- Add content-provider adapters for YouTube RSS/public metadata, news, Gmail, and calendar behind explicit interfaces.
- Add a ranking policy module that incorporates feedback and recency while keeping the rating model intact.
- Add narration as a consumer of a generated briefing model, not as a responsibility of individual cards.
