# Architectural Decision Record

## ADR-001: Vanilla browser modules and Node standard library

**Decision:** Use semantic HTML, CSS custom properties, browser-native JavaScript ES modules, and a Node standard-library static server.

**Why:** Node is already installed, npm is not available, and the app needs low resource usage, fast startup, local simplicity, and future replaceable presentation. A framework would add installation and runtime weight before it solves a current problem.

**Revisit when:** The UI gains enough independent screens/state interactions that manual rendering becomes a measurable maintenance burden.

## ADR-002: JSON repository behind an API boundary

**Decision:** Persist users, sessions, and one versioned JSON state object per user through the server repository; the browser accesses it through same-origin JSON APIs.

**Why:** It is zero-setup, portable, and sufficient for a personal V1. A boundary keeps future SQLite/Postgres or hosted database options from leaking into the UI.

## ADR-006: GitHub Pages frontend with Cloudflare Worker/D1 backend

**Decision:** Host the static frontend on GitHub Pages and the production API/data on Cloudflare's free Worker and D1 services.

**Why:** GitHub Pages cannot execute the MVC backend. This split preserves a free deployment path while keeping business logic and presentation separated. The local Node server remains the simplest development adapter.

## ADR-005: Password and session handling use Node crypto

**Decision:** Use salted scrypt password hashes and random, hashed session tokens in HttpOnly cookies.

**Why:** This provides a standards-aligned baseline without pulling dependencies into the free/local foundation. Production hosting must still add HTTPS, rate limiting, backups, and operational secret management.

## ADR-003: Interest scores are shared domain data

**Decision:** Onboarding writes the same `interests` collection used by the Interest Engine and future providers.

**Why:** Onboarding must create useful signal rather than a second configuration system. A creator and a topic can both contribute to a content score.

## ADR-004: No private YouTube history

**Decision:** Future YouTube monitoring must use public/explicitly configured sources and user feedback.

**Why:** The product vision explicitly avoids private watch-history access and should remain understandable and portable.
# Decision: catalog-driven onboarding

## Status

Accepted for V1.

## Decision

The first-launch sequence uses a small local catalog of public creators, games, and topics. Each step ranks candidates from configured popularity plus tag overlap with saved interests and choices already made in the sequence. The catalog is intentionally editable source code and does not require private YouTube history, a third-party API, or paid infrastructure.

## Why

This gives the user useful starting choices immediately while keeping startup fast, deterministic, free, and testable. The ranking seam can later consume public provider data without coupling the UI to YouTube or another service.

## Consequences

- Existing interests and prior onboarding selections remain visible and influence later steps.
- Catalog popularity is a refreshable starter signal, not a promise of live rankings.
- Feedback controls and provider adapters remain future work.
