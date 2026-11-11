# Hosted aurora: design

**Goal (Kush, 2026-11-08):** lift aurora from a local single-user tool into a basic hosted service on Kush's domain
that any MCP harness can connect to, without building accounts or IAM. Local mode keeps working unchanged.

## Decisions

| Topic | Decision |
|---|---|
| Identity | No accounts. A **workspace key**: a stateless JWT (HS256, `{ws, iat}`) signed with `AURORA_SECRET`. Whoever holds it owns the workspace. |
| How the key travels | `Authorization: Bearer <key>` on every MCP and API request. Never in a URL, never logged. |
| Getting a key | `POST /api/keys` (and a one-button page at `/`), gated by an optional invite code `AURORA_INVITE` and an IP rate limit. |
| Revocation | Rotating `AURORA_SECRET` invalidates all keys; a small deny-list file (`denied.json`, workspace ids) blocks one. |
| Sharing | Each view gets a **view-only share link** `/v/<token>`, token = `<wsId>_<32 random hex>`, stored per workspace, revocable by minting a new one. Edit access exists only through the bearer key. |
| MCP transport | Streamable HTTP at `/mcp` (SDK `StreamableHTTPServerTransport`, stateless), same tools as today. Stdio stays for local mode. |
| Isolation | One **tenant** per workspace: its own `ViewStore`, `DataRuntime`, `Intake` and screens, under `<dataDir>/ws/<id>/`. Created on first use, idle ones evicted. |
| Data | Hosted mode never reads paths outside the workspace folder. Datasets are inline (works today) or **uploaded** once (`POST /api/uploads`, MCP tool `upload`), max 25 MB each, 200 MB per workspace. Media: http(s) URLs or uploads. |
| Filter state | In hosted mode a viewer's filter changes apply to **that viewer only** (queries run for their socket); the author's values (set through MCP) are the defaults every new viewer opens on. |
| Screenshots | One warm browser, **2 at a time**, a queue of at most 8 (`503` + `Retry-After` beyond it), results **cached by view version and options**, **30 looks per workspace per hour**. |
| Off in hosted mode | The built-in composer (it spends the host's LLM key), the project-folder file watcher, opening a browser, `localhost`-only host checks (replaced by `AURORA_PUBLIC_URL`'s host). |
| Design sandbox | Unchanged: designs already run in an opaque-origin sandbox with no cookies to steal. A separate design domain waits until pages are public. |
| Deploy | One container (Node 22 + Chromium), a persistent volume for `<dataDir>`, Caddy in front for TLS on `aurora.<domain>`. |

## Non-goals

Accounts, OAuth, billing, multiple servers, public galleries, a separate design origin. Claude.ai web connectors may
require OAuth; that is a later, separate step (Claude Code and most MCP clients accept a static bearer header).

## Acceptance

From a clean machine with only a key: `claude mcp add --transport http aurora https://aurora.<domain>/mcp --header
"Authorization: Bearer <key>"`, then a request in Claude Code produces a view; its share link opens in any browser;
another key can't read or change it; a revoked link stops working; `look` returns pictures; local mode still passes
every existing test.

## MVP scope (Kush, 2026-11-10)

Only two goals: others connect their Claude (any MCP harness) to the hosted aurora, and share a view by link. Kept
because a public box is unsafe without them: workspace isolation, inline-only data (no server files, no fetching),
invite-required keys, a body cap. Out of the MVP: uploads, per-viewer filters, `look` on hosted, the screenshot queue,
DuckDB limits, quotas, mint rate limits, a deny-list, OAuth. The plan's Global Constraints are binding where they differ
from the table above.
