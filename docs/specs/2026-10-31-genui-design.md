# genui — Generative Interface Layer — Design

Status: draft for approval · 2026-10-31 · working name "genui" (rename freely)

## 1. Intent and the why

When an agent finishes a task, its output is data: tables, records, time series, graphs, documents. Today a human has to build a dashboard, deck, or web page to look at it. genui removes that step: any agent hands its result to genui, and an LLM composes the right interface for *that* data, on the spot, in a second or two.

It is the display layer of Jarvis (see `projects/Jarvis/jarvis-ambient-intelligence-plan.md`): the Core produces data, genui turns it into a screen, and every Jarvis surface renders the same output. It follows Jarvis's principles: harness-independent, model-agnostic, local-first, free/open-source.

## 2. Goals

1. **Any data in, a fitting interface out.** Tables, time series, geo, networks, hierarchies, text, mixed results.
2. **Low latency.** Something useful appears on screen fast and the rest streams in.
3. **Diverse forms.** Charts of every kind, tables, maps, network graphs, timelines, KPI tiles, rich text, and an escape hatch for anything else.
4. **Works with any model**, including small local open-weight models, and with any agent harness (Claude Code, Codex, a local agent, Jarvis Core).
5. **Large data.** Millions of rows without slowing down or sending rows to the LLM.

## 3. Non-goals (v1)

- A drag-and-drop dashboard editor or any human authoring UI.
- Multi-user accounts, auth, hosting, or sharing links (Jarvis Core handles identity later).
- Native mobile, terminal, or voice renderers (the spec allows them later; v1 is browser only).
- Writing data back to the source (no editing records).

## 4. Anti-goals (failure even if it "works")

- **The LLM types out data or numbers.** Every number on screen must come from a query executed against the real data. Hallucinated figures would make this worse than useless.
- **A blank screen for seconds.** If nothing appears within ~2s on a cloud model, it has failed its main promise.
- **Lock-in.** Hard dependence on one model vendor, one harness, or a paid service.
- **Running untrusted generated code with access to the machine.** Generated code only runs sandboxed.

## 5. Core architecture

```
 agent / Jarvis Core
        │  MCP tool: render({ data, intent })
        ▼
 ┌──────────────────────── genui server (local, Node/TS) ────────────────────────┐
 │ 1. Ingest     data ref → DuckDB view "data" (CSV, JSON, Parquet, inline JSON)  │
 │ 2. Profile    schema, types, cardinality, min/max, nulls, 5 sample rows        │
 │ 3. Cache      key = schema fingerprint + normalized intent → cached spec?      │
 │ 4. Compose    LLM(profile + intent) → UI spec (streamed, JSON-schema-guided)   │
 │ 5. Execute    each query in spec → DuckDB (read-only) → small result sets     │
 │ 6. Push       spec fragments + query results → browser over WebSocket          │
 └────────────────────────────────────────────────────────────────────────────────┘
        ▼
 "screen" browser tab (React renderer) — draws components as they arrive
```

Key decisions (from the conversation, agreed with Kush):

- **D1. The LLM writes a declarative spec, not code** (hybrid): a JSON UI spec built from a fixed component catalog. A `custom` component (sandboxed HTML/JS) is the escape hatch for views the catalog can't express.
- **D2. The LLM sees only the data's shape** (profile + samples), never the full dataset. It outputs SQL queries and field bindings; rows go from DuckDB straight to the renderer.
- **D3. Charts use Vega-Lite.** Other components are custom.
- **D4. Streaming render + layout cache** for latency.
- **D5. Model-agnostic** with schema-constrained JSON output.
- **D6. Exposed as an MCP tool**, plus a plain HTTP API.
- **D7. Browser first**; spec is surface-neutral so other renderers can come later.
- **D8. Interactivity:** v1 = static views + filters/parameters; v2 = events back to the agent.
- **D9. Ephemeral by default**, optional save of spec + data reference.

## 6. The spec (contract between LLM and renderer)

A single JSON document, validated with a schema (Zod source → JSON Schema for constrained decoding):

```json
{
  "v": 1,
  "title": "Q3 revenue by region",
  "summary": "Revenue was {total.v|currency}, up {growth.pct|percent} vs Q2; {top.region} leads.",  // placeholders only, no digits
  "params": [{ "id": "region", "type": "select", "query": "regions", "default": null }],
  "queries": {
    "total":   { "sql": "SELECT sum(revenue) AS v FROM data WHERE ($region IS NULL OR region=$region)" },
    "byMonth": { "sql": "SELECT month, region, sum(revenue) AS revenue FROM data GROUP BY 1,2 ORDER BY 1" },
    "regions": { "sql": "SELECT DISTINCT region FROM data" },
    "growth":  { "sql": "SELECT (q3-q2)/q2 AS pct FROM (SELECT sum(revenue) FILTER (quarter='Q3') q3, sum(revenue) FILTER (quarter='Q2') q2 FROM data)" },
    "top":     { "sql": "SELECT region FROM data GROUP BY 1 ORDER BY sum(revenue) DESC LIMIT 1" }
  },
  "layout": { "type": "grid", "cols": 12, "items": [
    { "id": "k1", "span": 3,  "c": { "type": "kpi",   "query": "total", "field": "v", "label": "Revenue", "format": "currency" } },
    { "id": "c1", "span": 9,  "c": { "type": "chart", "query": "byMonth", "vegaLite": { "mark": "line", "encoding": { "x": {"field":"month","type":"temporal"}, "y": {"field":"revenue","type":"quantitative"}, "color": {"field":"region"} } } } },
    { "id": "t1", "span": 12, "c": { "type": "table", "query": "byMonth" } }
  ]}
}
```

Rules:
- Components reference data only through `query` ids.
- **No number shown to the user is typed by the LLM** (my call, resolves the anti-goal). Concretely:
  - All prose (`summary`, `text` components, titles that state values) uses placeholders `{queryId.field|format}` that the renderer fills from query results. Formats: `number`, `integer`, `percent`, `currency`, `date`, `compact`, plus `delta` (signed). Derived values (growth, share, rank) are expressed as queries, never computed in prose.
  - The validator rejects any digit in prose outside placeholders, except ordinals/years embedded in labels the user supplied in the intent, and a small allowlist (e.g. "Top 10" when it matches a `LIMIT 10` in the referenced query). On rejection, one repair retry, then the offending text is dropped.
  - Vega-Lite: `data` is always injected by the renderer; `data.values`, `data.url`, and `datum` with numeric literals are stripped. Literals in `transform.filter` and scale domains are allowed (they shape the view, they don't report values).
  - `custom` components only receive query results; anything they display is visibly badged "custom view".
  - Consequence: cached specs are safe to reuse on new data with the same schema, because every value is recomputed.
- **Multiple named datasets in v1** (my call). `render` accepts `data` as one input or a map `{ name: input }`; each becomes a DuckDB view with that name (single input → `data`). The profile lists every dataset. Conventions the prompt teaches:
  - Networks: an `edges` table (`source`, `target`, optional `weight`) and optional `nodes` table; a single edges-only input also works.
  - Hierarchies: a parent-id column (`id`, `parent`) → treemap/sunburst/tree.
  - Geo: lat/lon columns → points; region names/ISO codes → choropleth against **bundled Natural Earth GeoJSON (world countries, admin-1 states/provinces; public domain)**; callers may pass their own GeoJSON as a dataset for anything else.
  - Text/documents: `.md`/`.txt` inputs (or JSON records with a long text field) are ingested as a table `(name, body)`; the `text` component can render a document body by reference (`{"type":"text","doc":{"query":"q","field":"body"}}`) — the LLM selects and arranges documents, it does not rewrite them.
  - Mixed results: an agent passes several named inputs; the layout composes them.
- Params bind into queries as `$name`; changing a param re-runs only dependent queries.
- Layout is ordered so the renderer can draw item-by-item as the stream arrives. The prompt instructs the model to emit queries/items in priority order (KPIs and headline first).

### Component catalog (v1)

| type | purpose | library (builder may swap) |
|---|---|---|
| `kpi` | headline number, optional delta/sparkline | custom |
| `chart` | any Vega-Lite chart (bar, line, area, scatter, heatmap, histogram, box, treemap via vega) | vega-embed |
| `table` | sortable, virtualized table for large results | TanStack Table + virtualizer |
| `text` | markdown narrative / callouts | markdown renderer |
| `map` | points, choropleth, routes | MapLibre GL |
| `graph` | nodes/edges networks | Cytoscape.js or Sigma.js |
| `timeline` | events over time with spans | custom or vis-timeline |
| `cards` | list of entities as cards (records, search results) | custom |
| `json` | collapsible tree for nested/raw data | custom |
| `tabs` / `stack` | layout containers | custom |
| `custom` | escape hatch: LLM-written HTML/JS in a sandboxed iframe (`sandbox="allow-scripts"`, no network, CSP), query results injected via postMessage | — |

## 7. Data handling

- **Inputs** to `render` (one, or a map of named inputs — see §6): a file path (CSV/TSV/JSON/NDJSON/Parquet), a URL to such a file, or inline JSON (small). The calling agent should pass a path for anything large so data does not flow through its own context.
- **Engine:** DuckDB (Node binding) in-process, read-only, with external access disabled for generated SQL (no `read_csv` on arbitrary paths, no `ATTACH`, no `COPY`, no `INSTALL`). genui itself creates the `data` view; generated SQL can only `SELECT` from it. Enforce with a SQL parse/allowlist and DuckDB settings (`enable_external_access=false` after view creation, `lock_configuration=true`).
- **Result limits:** each query result capped (default 10k rows to the browser; tables page server-side beyond that).
- **Nested JSON** is flattened where obvious; otherwise exposed via DuckDB struct/list columns and the `json` component.
- **Profile** is computed once per dataset and cached by file hash/mtime.

## 8. LLM layer

- **Provider adapters:** OpenAI-compatible endpoint (covers Ollama, llama.cpp server, vLLM, LM Studio, OpenAI) and Anthropic. Config picks provider + model; default config points at a local Ollama.
- **Constrained output:** use JSON-schema / grammar-constrained decoding where the provider supports it; otherwise prompt + validate + one repair retry.
- **Streaming parse:** an incremental JSON parser emits each completed `queries` entry and `layout.items[]` entry as soon as it closes, so the server can execute and push it immediately.
- **Validation loop:** each query is dry-run (`EXPLAIN`) when it arrives; on failure the error goes back for a single targeted repair of that query without blocking other components.
- **Prompt budget:** for wide data (>40 columns) the profile is compressed (names + types + cardinality only, samples truncated) so the prompt stays small enough for the local first-component target.
- **Prompt inputs:** profile, intent string (optional; if absent, "best overview of this data"), catalog description, a few compact examples. Keep it short to keep time-to-first-token low; mark the static part for prompt caching where providers support it.
- **Fallback:** if the model fails entirely, render a deterministic default view (table + auto-chosen chart per column type) so the user always sees their data.

## 9. Latency plan

Definitions (my call): the deterministic default view (§8 fallback) is drawn first and is not counted as success. "First component" means the **first LLM-composed component**; it replaces the matching default panel in place (the default view is a placeholder that composed items swap into, then it disappears).

Targets (my calls; tune after measuring; local target measured on Kush's MacBook Air 13" M4, assumed 16 GB unified memory):

Local-model implications (my calls): on 16 GB, candidate models are roughly 3–8B parameters at 4-bit quantization (≈2–5 GB), leaving room for the browser and DuckDB; 14B is a stretch goal only if eval shows a big quality jump. The 3 s target is only reachable if the **static prompt prefix (instructions + catalog + examples) is KV-cached** by the backend so each render pre-fills just the profile + intent (~300–800 tokens). Order the prompt static-first, and the local adapter must keep the model warm (no unload between renders). The eval harness (§13) picks the default local model; MLX-based serving is an allowed alternative backend if it beats llama.cpp/Ollama on this machine.
| moment | target |
|---|---|
| default view on screen | < 400 ms |
| profile for 1M-row Parquet | < 300 ms |
| first component on screen (cloud model) | < 1.5 s |
| first component on screen (local model on Kush's Mac) | < 3 s |
| cache hit (same shape + intent) | < 150 ms |
| param change re-query | < 100 ms |

Levers: streaming (above); show the deterministic default skeleton instantly while the LLM composes; layout cache keyed by schema fingerprint (column names + types) + normalized intent; data never in the prompt; small prompt.

## 10. Delivery and surfaces

- `genui serve` runs a local server (HTTP + WebSocket + MCP over stdio and streamable HTTP).
- One persistent **screen** tab at `http://localhost:<port>/` shows the latest render, with a history sidebar of past renders this session. The MCP `render` tool returns the render URL and pushes to the open screen; if none is open, it opens one in the default browser.
- MCP tools: `render({ data, intent?, title? }) → { renderId, url }`, `refine({ renderId, instruction })` (re-compose with the previous spec as context, e.g. "make it a map"), `save({ renderId })`.
- HTTP: same operations as JSON endpoints so Jarvis Core and scripts can call without MCP.

## 11. Interactivity

- v1: hover tooltips, table sort/search, chart zoom where Vega supports it, params (select, range, date range, search) wired to queries, plus a text box on the screen for `refine` instructions.
- v2 (design for, don't build): components emit events (`click row`, `select points`) to the calling agent over MCP notifications / WebSocket, enabling drill-down conversations.

## 12. Saving

`save` writes `{spec, dataRef, profileHash, createdAt}` to `~/.genui/saved/`. Re-opening re-runs queries against the current data (if still present). Plain JSON on disk, no database.

## 13. Quality: evaluation harness

Model-agnosticism is only real if measured. Ship a `genui eval` command with a fixture set (~20 datasets × intents: sales time series, geo points, org chart/hierarchy, social graph, logs, survey results, nested API JSON, wide 100-column table, 5M-row Parquet). Per model it reports: spec validity rate, query success rate, render success rate, time-to-first-component, total time, and a screenshot gallery for eyeballing. This is how a local model gets picked and prompts get tuned.

## 14. Tech stack (my calls, builder may adjust with reason)

- TypeScript throughout, pnpm workspace monorepo:
  - `packages/spec` — Zod schema, JSON Schema export, types
  - `packages/engine` — ingest, profile, DuckDB execution, SQL guard, LLM adapters, streaming parser, cache
  - `packages/renderer` — React + Vite, component catalog
  - `packages/server` — HTTP/WS server, MCP server, CLI (`serve`, `eval`)
- Tests: Vitest for engine/spec; Playwright for renderer smoke tests and the eval screenshot gallery.
- Everything free/open-source; no paid service required. Map tiles: default to a free OSM-based style; offline tiles are a later improvement (note: maps need internet in v1).

## 15. Build order (suggested milestones)

1. Spec schema + DuckDB ingest/profile + deterministic default view rendered in browser (no LLM). Proves the data path and renderer.
2. LLM compose (non-streaming) with one provider (Ollama) + validation/repair.
3. Streaming end-to-end + layout cache.
4. Full component catalog + params.
5. MCP server + `refine` + `save`.
6. Anthropic adapter + eval harness; pick default local model from results.
7. `custom` sandboxed escape hatch.

## 16. Left to the builder

Exact library choices within each component, visual design/theme (clean, dark/light), prompt wording and examples, port/config file format, cache eviction, how history is stored in-session, the precise SQL guard implementation, and folder layout inside packages.
