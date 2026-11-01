# genui

A universal screen for LLMs: whichever model you are working with composes a view (KPIs with sparklines, charts, tables and filters; architecture and Mermaid diagrams; network graphs, maps, timelines; code, images, video, cards, steps, callouts, prose, JSON), and genui validates it, draws it with spring motion, keeps every version and reports problems back. Views are built up part by part and refined in place with patches by id. Numbers in data-bound panels always come from DuckDB queries; the model never types data.

Design: `docs/specs/2026-10-31-genui-canvas-design.md` (Plan 2) · `docs/specs/2026-10-31-genui-design.md` (Plan 1) · Plans: `docs/superpowers/plans/`

![Component gallery](docs/screenshots/gallery-light.png)

## Use it from Claude Code (or any MCP harness)

```bash
npm install && (cd packages/renderer && npx vite build)
claude mcp add --scope user genui -- "$PWD/node_modules/.bin/tsx" "$PWD/packages/server/src/cli.ts" mcp
npm run genui -- skill        # writes ~/.claude/skills/genui/SKILL.md, generated from the component registry
```

Then ask for something visual ("show an overview of projects.csv", "explain the auth flow on screen"). `genui mcp` starts the shared server on port 4317 if it isn't running and registers the session's folder for file streaming. Tools: `render`, `patch`, `status`, `profile`, `version` (history / pick / revertItem) and `compose` (genui's own composer, a fallback).

**File streaming** works from any harness that can write files: append JSON lines to `<project>/.genui/views/<name>.ndjson` (line 1 a view, later lines `{"ops": [...], "baseVersion": N}`); genui applies each line as it lands and writes `<name>.problems.json` beside it. The folder must be registered: by an MCP session started there, or `npm run genui -- watch <project>`.

**Components.** `kpi` (optional `sparkline`), `chart` (Vega-Lite), `table`, `text`, `json`, `diagram` (Mermaid), `architecture` (ELK-laid-out system picture with icons and animated edges), `graph` (Cytoscape network, 1,000+ nodes), `map` (MapLibre with bundled country shapes: points, routes, choropleth; OSM street tiles optional, works offline), `timeline`, `cards`, `media`, `code` (Shiki, diffs), `callout`, `steps`. The skill documents each one from the registry; `npm run genui -- gallery` (or `POST /api/gallery`) puts every component's example on the screen. Heavy engines load only when a view uses them.

**Filters.** A view's `params` (`select`, `range`, `daterange`, `search`) become a filter row above its sections. Queries read them as DuckDB-bound variables (`$region`, `$price_min`/`$price_max`, `$when_from`/`$when_to`) — values are never pasted into SQL. Changing a filter re-runs only the queries that use it; `status` shows the current values and `POST /api/views/:id/params {name, value}` sets one.

**Media** is displayed, never generated: `media` and `cards` show existing images and videos by absolute path or URL. A local file is served only because an accepted view references it, at an unguessable `/media/<token>` URL (Range requests for video, SVG sandboxed); everything else is a 404.

**HTTP**: `POST /api/views {view}` · `POST /api/views/:id/patch {ops, baseVersion?}` · `GET /api/views/:id` · `GET /api/views/:id/status` · `GET /api/views/:id/history` · `GET /api/views/:id/versions/:n` · `POST /api/views/:id/pick {version}` · `POST /api/views/:id/revert {itemId, version}` · `POST /api/views/:id/params {name, value}` · `POST /api/profile {data}` · `POST /api/watch {dir}` · `POST /api/gallery` · `GET /media/<token>`. The screen picks up everything over `GET /ws`.

On the screen, the version chip lists every version; choosing one previews it and **Use this version** makes it current (a new version, so nothing is lost). A caller's next patch builds on it and its result says `rebased: true`.

Views persist as JSON under `~/.genui/views/<id>/v<N>.json` (last 200 views or 30 days, whichever keeps more; `GENUI_VIEWS_DIR` overrides the folder).

## Plan 1 entry: genui composes from data + intent

Requires Node 24 and the `claude` CLI logged in (the default provider composes views on your Claude Code subscription: Sonnet at low effort, ~2 s to the first panel). For offline use, set `provider` to `ollama` and pull a model (default `qwen3:8b`).

```bash
npm install
(cd packages/renderer && npx vite build)     # build the screen once
npm run genui -- serve                       # http://localhost:4317
npm run genui -- render sales.csv --intent "monthly revenue by region"
npm run genui -- render orders=orders.parquet docs=./notes/   # several named datasets
```

`render` starts the server in-process if none is running and opens the screen if no tab is connected.

Inputs: CSV, TSV, JSON, NDJSON, Parquet, `.md`/`.txt` files or directories (loaded as a `(name, body)` table), or `http(s)` URLs.

HTTP: `POST /api/render {"data": "<path>" | {"name": "<path>", ...} | {"inline": [...]}, "intent": "..."}` → `{renderId, url}`; the composed view is an ordinary v2 view (`renderId` is its view id), so it can be patched and versioned like any other.

## Config

`~/.genui/config.json` (all optional), overridden by env:

| key | env | default |
|---|---|---|
| `port` | `GENUI_PORT` | `4317` |
| `model` | `GENUI_MODEL` | `sonnet` for claude, `qwen3:8b` for ollama |
| `ollamaUrl` | `GENUI_OLLAMA_URL` | `http://127.0.0.1:11434` |
| `provider` | `GENUI_PROVIDER` | `claude` (Claude Code subscription), `ollama` (local, offline), or `openai` (any OpenAI-compatible server, e.g. the LLM routing server) |
| `effort` | | `low` (claude provider; higher effort thinks first and is slower) |
| `baseUrl` | `GENUI_BASE_URL` | — (required for `openai`, e.g. `http://localhost:8000/v1`) |
| `apiKey` | `GENUI_API_KEY` | — |
| `models` | | per-task model names, e.g. `{"compose": "auto", "repair": "fast"}` |
| `jsonMode` | | `schema` (default), `object`, or `none` if the backend lacks JSON-schema output |
| | `GENUI_FAKE_PROVIDER=1` | canned composition, no model |
| | `GENUI_NO_OPEN=1` | never open a browser |
| | `GENUI_DEBUG_DIR=<dir>` | save the raw model output of any incomplete composition there |

### Using the LLM routing server

```json
// ~/.genui/config.json
{ "provider": "openai", "baseUrl": "http://localhost:8000/v1", "model": "auto", "models": { "repair": "fast" } }
```

Every call is tagged as a `compose` or a `repair`, so the router can send repairs to a small fast model and full compositions to a bigger one.

## Test

```bash
npx vitest run                               # unit + integration
(cd packages/renderer && npx playwright test) # browser smoke test (uses installed Chrome)
npx tsx scripts/latency.ts [model]           # real-model timings
```

## Measured latency (MacBook Air M4, 16 GB, qwen3:8b Q4_K_M, Ollama 0.18.2)

`npx tsx scripts/latency.ts`, 2026-10-31:

| input | profile | default view | first LLM panel | total | panels | cache-hit total |
|---|---|---|---|---|---|---|
| sales.csv (240 rows) | 49 ms | 74 ms | 18.1 s (incl. cold model load) | 43.8 s | 4 | 37 ms |
| events.parquet (1M rows) | 107 ms | 120 ms | 10.7 s | 108.9 s | 9 | 120 ms |
| docs directory | 24 ms | 28 ms | 4.7 s | 16.2 s | 3 | 19 ms |

What these show:
- Profiling, the default view and cache hits all beat their targets (300 ms / 400 ms / 150 ms).
- The first LLM panel misses the 3 s local target. Breakdown on sales.csv: prompt 1,622 tokens, prefill 2.9 s cold → 0.1 s once Ollama has cached the static prefix; generation ~18.7 tok/s; ~600 output tokens per view. Constrained decoding costs nothing measurable (18.7 vs 18.5 tok/s for plain JSON).
- So the bottleneck is generation speed × output length. That's for Plan 4 (model choice via `genui eval`, smaller/faster models, a more compact part format), not fixed here.
