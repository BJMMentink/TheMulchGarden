# Contributing to The Mulch Garden

Keep changes small and testable.

- Keep product/domain logic in `src/` modules and keep DOM code in `src/app.js` or a future presentation module.
- Add configuration values to `src/config.js`; do not scatter thresholds or limits through feature code.
- Keep external integrations behind adapters. Never make the Interest Engine depend on a provider SDK.
- Update `docs/DECISIONS.md` when a choice changes the architecture or data model.
- Run `node --test` before handing off a milestone.
- Prefer browser-native APIs and no dependency when they meet the need.

