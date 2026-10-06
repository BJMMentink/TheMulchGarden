# AI handoff notes

Read this file before making changes to The Mulch Garden. It records project discoveries that are easy to misinterpret when the work is continued by another AI agent.

## Deployment and hosting identity

The Mulch Garden repository is a real Git project and is deployed through Cloudflare configuration in this repository. It is not currently registered as a Codex Sites project.

Evidence in the repository:

- `wrangler.toml` configures the Cloudflare API worker.
- `cloudflare/wrangler.toml` configures the Cloudflare deployment and D1 database.
- The Cloudflare configuration references deployed origins such as `themulchgarden.pages.dev` and `bjmmentink.github.io`.
- There is no `.openai/hosting.json` file in the project.

Operational consequences:

- Edit the checked-out Git project when the user asks to change Mulch Garden.
- Use the Cloudflare deployment workflow when publishing this project through its existing hosting setup.
- Do not assume that a project listed in Codex’s local project list is also registered with the Codex Sites service.
- Before using Sites-specific publishing tools, verify that `.openai/hosting.json` exists and contains a valid Sites `project_id`, or verify the project through the Sites service.
- If Sites reports no matching project, explain the distinction instead of claiming that the site is unavailable or that a deployment occurred.

## MCP implementation

Mulch Garden exposes a user-scoped `/mcp` endpoint in both the local Node server and the Cloudflare worker. The current tools are read-only:

- `get_project_context`
- `list_board_projects`
- `list_admin_pages`

The local server accepts the existing session cookie or a bearer token supplied through `MCP_TOKEN`, with `MCP_USERNAME` binding the connection to one account. The Cloudflare deployment should keep `MCP_TOKEN` in secret configuration, never in source control.

Both HTTP implementations must validate any supplied `Origin` before processing a request. The local server allows only its loopback origins; the Worker allows only the exact `FRONTEND_ORIGIN` configured in Wrangler. Origin-less native clients remain supported. Authenticate every POST before handling it, including notification-only and response-only messages. Implement non-empty JSON-RPC batches, omit replies for notifications, and return `202` with no body when there are no replies. `GET /mcp` is intentionally `405` because the server does not offer SSE. Reference: [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports).

## MCP dashboard discovery

The administrator MCP page is a catalog and teaching surface, not the MCP protocol implementation itself. It now separates four ideas that future agents must keep distinct:

- `Overview` shows exact configured statistics: endpoint count, declared tool count, read-only count, write-action count, and authentication boundary.
- `Tools` organizes the actual server tools by section and searchable safety tags, and includes a worksheet that generates a reviewable tool-definition preview without publishing a live tool.
- `Usage` explicitly labels live invocation history as not collected until request telemetry is deliberately added. Never display invented call counts.
- `Organization` documents the section/tag model and the naming and permission rules used by the catalog.

The page metadata is currently maintained in `src/app.js` next to the MCP renderer. The server tool list remains authoritative in `server/mcp.js` and `cloudflare/src/index.js`; update those implementations when a tool is truly added or removed.

The public MCP URL is the Worker endpoint `https://the-mulch-garden-api.bjmmentink.workers.dev/mcp`, not the Pages domain. `public/runtime-config.js` exposes it as `MULCH_MCP_ENDPOINT` for display/copy in the admin dashboard; this URL is public and contains no credential. The website's `/api` routes use a separate same-origin Pages Function proxy.

The private pages share a persistent shell. A new page must be added to the existing-shell branch of `renderMinimal`, not only to the initial HTML. Otherwise the navigation can select the view while leaving the previous page's content in place and its controls unbound. MCP catalog filtering is updated in place to preserve search focus.

Admin Home and Work sections remember their last selected page independently in user-scoped local storage. When a saved page is no longer in that section or available, navigation falls back to that section's first available page (Home, or Board for Work). A Home/Work section switch must open that remembered/default page, not leave the old section's slide active. The carousel transition completion handler must ignore bubbled transitions from header controls and only finish on the track's own `transform` transition; otherwise fast tab changes can settle at the wrong time. Clicking the expanded brand name routes to Home and selects the Home section.

Do not store or return Codex billing details, payment information, OAuth refresh tokens, passwords, or other financial credentials. Godside's provider API keys are a narrowly scoped exception: keep them encrypted per user as documented in [`GODSIDE.md`](GODSIDE.md), never place them in general app state, and never return plaintext keys to the browser. Before adding a money-related tool, require OAuth 2.1 user authorization, HTTPS, per-user authorization, application-layer authenticated encryption for stored sensitive values, and explicit confirmation for consequential actions.

## Current deployment

As of 2026-09-27, the updated Cloudflare Worker is deployed at `https://the-mulch-garden-api.bjmmentink.workers.dev`. The production MCP connection is bound to the `Ben` account through the Cloudflare secrets `MCP_TOKEN` and `MCP_USERNAME`. The generated token was not written to Git, the plugin package, or chat history. The public `/mcp` endpoint correctly returns `401 Unauthorized` without authentication.

The deployment used the existing Worker and D1 configuration only. No Cloudflare plan upgrade or paid-only service was enabled. The Codex plugin configuration points to the deployed HTTPS endpoint and still requires `MCP_TOKEN` to be supplied through the host’s secure environment.

The MCP page replaces the former Signal page in the administrator view. The admin top bar includes persistent left and right arrows that cycle through the available pages.

## Navigation animation discovery

Keep the primary navigation DOM (especially its `<nav>` element) mounted while changing pages within a section. Replacing it resets the moving `::before` tab indicator to its default Home position, which looks like a Home detour on forward moves and a missing animation on moves back to Home. Update the active indicator on the existing element so every tab direction animates directly. The Home/Portfolio/About navigation is positioned from the header's true midpoint rather than balanced against unequal side controls; the brand open/close jiggle runs in reverse on close.

## God’s Eye View integration

The authenticated member/admin carousel has a third `World` section containing the genuine upstream God’s Eye View app. The local Vite companion and all `/api/godside/*` routes require an authenticated app session. Keys are per-user and encrypted at rest; provider enablement is explicit, browser map keys are returned only to their owning user's app, and OpenAI stays server-side. The companion currently runs locally only; Cloudflare has the encrypted key storage but not the companion service. Read [`GODSIDE.md`](GODSIDE.md) before changing this integration.

## Continuation checklist

Before starting a new task:

1. Read this file and the relevant architecture or decision documents.
2. Check the current Git status and preserve unrelated user changes.
3. Confirm whether the task concerns local development, the Cloudflare deployment, or Codex Sites.
4. Verify hosting and authentication assumptions from project files instead of inferring them from a project label.
5. Record any new discovery in this folder before finishing the task.

## Required discovery rule

Every time an agent makes a discovery about this project—especially a discovery about hosting, deployment, authentication, data storage, integrations, permissions, or existing behavior—the agent must document it in the `docs` folder so future agents do not repeat the same mistake. Update this file or add a more specific document, and link the new document from the relevant index or handoff notes when appropriate.
