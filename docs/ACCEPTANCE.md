# V1 Acceptance Criteria and Definition of Done

## Acceptance criteria

- [x] The project exists at `F:\TheMulchGarden` and is a Git repository.
- [x] The Games tab contains a first game called Get to know me.
- [x] Get to know me presents exactly twenty questions per round, one at a time.
- [x] Answers are stored in the per-user state and update the shared editable Interest Engine data.
- [x] Later rounds use saved interests to tailor question ordering and avoid the immediately previous round.
- [x] Nuxinor, Luke Stephens, and Asmongold are seeded at 5/5.
- [x] Users can add and rate interests in all four supported categories.
- [x] SaberDueler and GMCHE art class are visible as separate projects.
- [x] Users can add, complete, edit, delete, search, and filter shared todo items.
- [x] Todo items show who added them and whether they are for everyone or an individual account.
- [x] Todo creation supports optional project and comma-separated tags.
- [x] The layout works at phone and desktop widths without horizontal scrolling.
- [x] Core Interest Engine behavior has automated tests.
- [x] No private YouTube watch-history access or external service is required.
- [x] Username-only login uses server-side sessions and never returns password hashes.
- [x] Public account registration is disabled.
- [x] Signed-in users can change their username and password after verifying the current password.
- [x] Per-user state is persisted by the backend rather than browser-only storage.
- [x] Admin-only endpoints enforce the administrator role server-side.
- [x] Administrators can toggle between admin mode and user mode; normal users do not see the toggle or admin view.
- [x] Administrators can provision the second account with a selected role without exposing password hashes.

## Definition of Done for V1

V1 is done when the acceptance criteria pass on a fresh browser profile, `node --test` passes, the app starts with `node server.js`, the two projects and seeded interests are present, a twenty-question game round can be completed, and the architecture/product decisions are documented in this repository.

## Verification checklist

1. Run `node --test`.
2. Run `node server.js`.
3. Create an account, refresh, sign in again, and confirm the seeded state remains.
4. Open the local URL on desktop and a phone-sized viewport.
5. Start Get to know me, answer a twenty-question round, confirm an answer appears in Interests, then add a shared todo with tags and an assignee.
6. Confirm `data/` is ignored and no password hash appears in API responses.
