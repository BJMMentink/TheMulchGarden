# Mulch Garden MCP server

Mulch Garden exposes a small, user-scoped MCP endpoint at `/mcp`.

The production endpoint is `https://the-mulch-garden-api.bjmmentink.workers.dev/mcp`. It is deliberately separate from the Pages site's same-origin `/api` proxy; the endpoint is configured as the public, non-secret `MULCH_MCP_ENDPOINT` value in `public/runtime-config.js`.

## Local use

Start the server with an MCP bearer token in the environment:

```powershell
$env:MCP_TOKEN = 'use-a-long-random-token'
$env:MCP_USERNAME = 'the-owner-of-this-connection'
pnpm start
```

The existing browser session can also authenticate the endpoint when the request includes the Mulch Garden session cookie. When `MCP_USERNAME` is set, both bearer-token and session access are restricted to that exact account.

The local `/mcp` handler validates every supplied `Origin` against its loopback origins (`127.0.0.1` and `localhost` on the configured port). Requests from native MCP clients may omit `Origin`; a supplied `null`, malformed, or unrelated origin is rejected. The Cloudflare Worker instead accepts only the exact configured `FRONTEND_ORIGIN` when that header is present. Authentication happens before requests—including notifications—are handled.

Both handlers accept a single JSON-RPC message or a non-empty batch. Notification-only messages and response-only messages are accepted with `202` and an empty body; batch responses omit notifications. The endpoint does not provide server-sent events, so `GET /mcp` returns `405` as allowed by Streamable HTTP. See the [MCP transport specification](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) for the protocol rules.

## Available tools

- `get_project_context`
- `list_board_projects`
- `list_admin_pages`

All current tools are read-only. The server still performs authorization before listing tools or handling a call.

## Dashboard organization

The administrator MCP page presents the server as a small control room:

- **Overview**: endpoint, authentication boundary, configured tool counts, and the request flow.
- **Tools**: searchable tool cards grouped under Foundation, Board, or Navigation, with tags such as `read-only`, `user-scoped`, and `admin`.
- **Usage**: the current honest status of observability. Invocation history is not persisted yet, so the page must not claim live call counts.
- **Organization**: the rules for naming, grouping, and tagging future tools.

The tool-design worksheet generates a metadata preview only. It does not modify `server/mcp.js`, `cloudflare/src/index.js`, or expose a new live capability. A future live tool still requires an implementation, authorization review, tests, and deployment.

The dashboard is rendered inside the administrator's persistent page shell. When adding a new private view, update both the initial-shell rendering and the existing-shell branch in `renderMinimal`; otherwise navigation can select the view without rendering it or binding its controls. MCP filters update the catalog in place so typing does not replace the focused search field.

## Sensitive-data boundary

This MCP server must not store or return Codex billing details, payment information, API keys, OAuth refresh tokens, passwords, or other financial credentials. The current tools do not persist those values. Secrets belong in the host secret manager, never in source files, plugin manifests, tool results, or logs.

Before adding any tool that handles money or account credentials, implement OAuth 2.1 user authorization and application-layer authenticated encryption for stored values. Use HTTPS in every deployed environment, bind every record to the authenticated user, and require explicit confirmation for consequential actions.

The Cloudflare token comparison uses a fixed-length SHA-256 digest and constant-time byte comparison. Do not replace it with a direct secret-string equality check or expose tokens in responses or telemetry.

The `workspace-helpers` plugin includes a local HTTP MCP configuration pointing at `http://127.0.0.1:4173/mcp`. Keep `MCP_TOKEN` outside source control.
