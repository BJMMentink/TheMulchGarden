# V1 Acceptance Criteria and Definition of Done

## Acceptance criteria

- [x] The project exists at `F:\TheMulchGarden` and is a Git repository.
- [x] A fresh launch shows a curated first-launch onboarding flow.
- [x] Onboarding covers creators, gaming, technology/AI, entertainment, and professional interests.
- [x] Onboarding writes to the same Interest Engine data model used by the Interests view.
- [x] Nuxinor, Luke Stephens, and Asmongold are seeded at 5/5.
- [x] Users can add and rate interests in all four supported categories.
- [x] SaberDueler and GMCHE art class are visible as separate projects.
- [x] Users can add and complete todo items locally.
- [x] The layout works at phone and desktop widths without horizontal scrolling.
- [x] Core Interest Engine behavior has automated tests.
- [x] No private YouTube watch-history access or external service is required.
- [x] Username-only login uses server-side sessions and never returns password hashes.
- [x] Public account registration is disabled.
- [x] Signed-in users can change their username and password after verifying the current password.
- [x] Per-user state is persisted by the backend rather than browser-only storage.

## Definition of Done for V1

V1 is done when the acceptance criteria pass on a fresh browser profile, `node --test` passes, the app starts with `node server.js`, the two projects and seeded interests are present, onboarding can be completed or skipped, and the architecture/product decisions are documented in this repository.

## Verification checklist

1. Run `node --test`.
2. Run `node server.js`.
3. Create an account, refresh, sign in again, and confirm the seeded state remains.
4. Open the local URL on desktop and a phone-sized viewport.
5. Complete onboarding, add an interest, add a todo, and complete a todo.
6. Confirm `data/` is ignored and no password hash appears in API responses.
