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

- Model: `src/interest-engine.js`, `src/get-to-know-me.js`, `src/profile-summary.js`, `src/default-data.js`, and `server/models/repository.js`.
- View: `public/index.html`, `public/styles.css`, and render functions in `src/app.js`.
- Controller: `server/controllers/*` and `server/router.js`.

## Production deployment boundary

The browser can point at the local Node API or the Cloudflare Pages same-origin proxy by changing `public/runtime-config.js`. In production, Pages forwards `/api/*` to the Cloudflare Worker, which uses D1. The browser API client is the stable boundary; both backends implement the same routes:

- `GET /api/auth/me`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `PATCH /api/auth/me`
- `GET /api/members`
- `GET /api/admin/users` (administrator only)
- `POST /api/admin/users` (administrator only)
- `GET /api/chat/messages`
- `POST /api/chat/messages`
- `GET /api/state`
- `PUT /api/state`

Cloudflare Pages provides the free production frontend and same-origin proxy. Cloudflare Worker + D1 provides the free production API and database. GitHub remains the source repository and deploy trigger; GitHub Pages is not used. The Worker uses Web Crypto PBKDF2 and bearer-capable sessions. See `cloudflare/README.md` for the one-time dashboard setup.

## Domain interfaces

### State

```js
{
  version: 1,
  onboarding: { completed: Boolean, version: Number }, // retained for old saved state compatibility
  interests: [{ id, name, category, rating, source }],
  projects: [{ id, name, type, color, todos: [{ id, title, done }] }],
  todos: [{ id, title, done, projectId, tags, addedBy, assignedTo, createdAt, updatedAt }],
  feedback: [{ contentId, action, createdAt }],
  games: { getToKnowMe: { currentRound, questionIndex, roundQuestionIds, answers, completedRounds } }
}
```

Todos are a top-level shared collection so tasks can belong to a project without being owned by one project view. `addedBy` and `assignedTo` contain user IDs; `everyone` is the explicit all-users assignment. `GET /api/members` returns only user IDs and usernames for authenticated todo labels.

### Interest Engine

- `createInterest({ name, category, rating, source })` returns a validated interest.
- `clampRating(rating)` normalizes ratings to the configured range.
- `scoreContent(content, interests)` returns `{ score, matches }`; creator and topic/game/keyword signals can combine.
- `recordFeedback(state, contentId, action)` records future feedback controls without requiring a content provider.

### Get to know me

`src/get-to-know-me.js` owns the question catalog, game state transitions, and a small preference-to-theme mapping. A round selects twenty questions using tag overlap with saved interests, records each answer, and avoids the immediately previous round when another round starts. The view applies each answer to the shared `interests` collection, so likes and dislikes remain editable in the Interests tab. The current theme is presentation-safe domain output rather than raw CSS logic, allowing a visual redesign later. The question catalog is local, deterministic, and free; it does not call YouTube or inspect private watch history.

`src/profile-summary.js` converts the same ratings into a short, deterministic description for Account settings. It only summarizes saved interests and never calls an AI service or infers facts outside the stored map.

`src/chat-engine.js` owns the presentation-independent timestamp grouping and new-message detection rules. Chat messages are global authenticated records, stored separately from per-user application state. The local adapter serializes them in the ignored `data/chat.json` file; production stores them in the free D1 `chat_messages` table. The browser polls the small capped history at a configured interval, re-renders when new messages arrive, and keeps an unread count while closed so both users see the shared conversation without a realtime service.

Future integrations should adapt external data into a stable content object (`id`, `creator`, `topic`, `title`, `tags`) and call the engine. The engine should not call Gmail, YouTube, or calendar APIs directly.

## Security baseline

- Passwords use Node's `crypto.scrypt` with a random salt; plaintext passwords are never persisted. The current private-app policy accepts 4–200 characters.
- Sessions use high-entropy random tokens. Only a SHA-256 digest is stored server-side.
- Public registration is disabled. Accounts are provisioned server-side and the system is reserved for two known accounts.
- Users have a backend-enforced `user` or `admin` role. Admin mode is a presentation mode available only to administrators; switching to user mode hides admin navigation but does not weaken backend authorization.
- Session cookies are `HttpOnly` and `SameSite=Lax`; production enables `Secure` cookies.
- User data is kept in per-user files under ignored `data/` and writes use a temporary file plus rename.
- A public deployment still needs HTTPS, rate limiting, backups, secret management, monitoring, and a database designed for concurrent writes.

## Future seams

- Replace `storage.js` with an export/import-capable repository without changing the views.
- Add content-provider adapters for YouTube RSS/public metadata, news, Gmail, and calendar behind explicit interfaces.
- Add a ranking policy module that incorporates feedback and recency while keeping the rating model intact.
- Add narration as a consumer of a generated briefing model, not as a responsibility of individual cards.
