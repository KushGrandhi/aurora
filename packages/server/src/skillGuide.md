# genui — show anything as a live interface

genui is a local screen that shows whatever you compose: analyses with KPIs, charts, tables and filters over data files; architecture and Mermaid diagrams; network graphs, maps and timelines; code, images, video, cards, steps and callouts; prose and JSON. **You compose the view; genui validates it, renders it with motion, keeps every version and tells you what went wrong.** Use it instead of dumping tables or long explanations in the terminal whenever seeing beats reading.

## When to use

- A task produced data worth looking at (query results, benchmarks, metrics, file breakdowns, CSV/JSON/Parquet).
- Explaining a project, a flow or a decision to someone: build a view with sections and tabs.
- The user says show, visualize, chart, dashboard, or "put it on the screen".

Tell the user the URL in one line; don't also print the content in the terminal.

## Pick the right component

- **Analysis of data:** `kpi` tiles (with a `sparkline` for the trend) on top, `chart` for the shape, `table` for the rows, and view `params` as filters when the reader will want to slice it.
- **Explaining a project or system:** `architecture` for the parts and what talks to what (polished, auto-laid-out); `diagram` (Mermaid) for flows, sequences and state machines; `steps` for processes and setup; `callout` for decisions, risks and tips; `code` for the excerpt that matters; `text` for the narrative.
- **Showing work:** `code` (or a diff), `media` for screenshots and recordings that already exist, `cards` for collections (projects, people, files).
- **Places:** `map`. **Relationships with many nodes:** `graph`. **History, schedules, milestones:** `timeline`. **Raw structures:** `json`.
- Wide components (`architecture`, `diagram`, `chart`, `table`, `map`, `graph`, `timeline`, `code`, `cards`, `media`) read best at `span` 12; `kpi` at 3–4; `callout`, `steps`, `text` at 6–12. A left-to-right flowchart in a half-width card gets small: give it 12.

## Two ways to deliver

**1. Tools (preferred when available):** `mcp__genui__render`, `mcp__genui__patch`, `mcp__genui__status`, `mcp__genui__profile`, `mcp__genui__version` (and `mcp__genui__compose`, a fallback that lets genui's own model design a view from data + intent). Over HTTP the same operations are `POST localhost:4317/api/views {view}`, `POST /api/views/<id>/patch {ops, baseVersion}`, `GET /api/views/<id>/status`, `POST /api/profile {data}`.

**2. File streaming (any harness that can write files):** append JSON lines to `<project>/.genui/views/<name>.ndjson`. Line 1 is a view; each later line is a patch `{"ops": [...], "baseVersion": N}`. Lines apply as they land (a line waits until its newline). genui writes `<name>.problems.json` beside the file after every line: read it to see problems. The folder is watched only when genui's MCP server runs in that project or after `genui watch <project>`; if nothing appears, that's why.

## The view document

```json
{
  "v": 2, "id": "auth_redesign", "title": "Auth service redesign", "summary": "Optional one-liner.",
  "datasets": { "events": "/abs/path/events.parquet" },
  "queries": { "total": { "sql": "SELECT count(*) AS n FROM events" } },
  "sections": [
    { "id": "overview", "title": "Overview", "layout": "grid", "items": [
      { "id": "k_total", "span": 3, "c": { "type": "kpi", "query": "total", "field": "n", "label": "Events" } }
    ] },
    { "id": "flows", "title": "Flows", "layout": "tabs", "items": [
      { "id": "login", "title": "Login", "c": { "type": "text", "md": "1. Client posts credentials…" } }
    ] }
  ]
}
```

- Ids (view, sections, items, queries, datasets) match `^[A-Za-z_]\w*$` and are unique across the view. They are how patches find things and how motion keeps identity: keep them stable.
- `layout: "grid"` places items on 12 columns (`span` 1–12, default 12). `layout: "tabs"` shows each item as a tab named by its `title`.
- `datasets` values: an absolute path (csv, tsv, json, ndjson, parquet, a folder of .md), `{"path", "format"}`, or `{"inline": [rows]}` for small data you already hold.

## Patch ops

A patch is a list of ops applied all-or-nothing; any bad op rejects the whole patch with a problem naming it.

| op | shape |
|---|---|
| `set` | `{"op":"set","title"?,"summary"?}` |
| `addSection` | `{"op":"addSection","section":{…},"after"?:"<sectionId>"\|null}` |
| `removeSection` | `{"op":"removeSection","id"}` |
| `moveSection` | `{"op":"moveSection","id","after"?:"<sectionId>"\|null}` |
| `add` | `{"op":"add","section":"<sectionId>","item":{…},"after"?:"<itemId>"\|null}` |
| `update` | `{"op":"update","id","item":{"span"?,"title"?,"c"?:{…fields to deep-merge}}}` |
| `replace` | `{"op":"replace","id","item":{…whole new item}}` (e.g. turn a table into a chart) |
| `remove` | `{"op":"remove","id"}` |
| `move` | `{"op":"move","id","section":"<sectionId>","after"?:"<itemId>"\|null}` |
| `addQuery` | `{"op":"addQuery","id","sql"}` (also replaces a query's SQL) |
| `addDataset` | `{"op":"addDataset","name","input"}` |
| `addParam` | `{"op":"addParam","name","param":{…}}` (adds or replaces a filter) |
| `removeParam` | `{"op":"removeParam","name"}` |

`after` omitted appends; `after: null` puts it first. Always pass `baseVersion` (the version your last call returned). The person can pick an older version on screen; if they did, your patch still applies on top of what they picked and the result says `"rebased": true` — call `status` to see what is current.

## Filters (params)

A view's `params` become one row of filters above its sections. Queries read them as bound variables; genui never pastes values into SQL, so hostile input is just a value.

```json
"params": {
  "region": { "type": "select", "label": "Region", "options": { "query": "regions", "field": "region" } },
  "price":  { "type": "range", "label": "Price", "min": 0, "max": 500 },
  "when":   { "type": "daterange", "label": "Order date" },
  "q":      { "type": "search", "label": "Product" }
}
```

- `select` → `$name` (null means "All"; options from a list or from a query's column), `search` → `$name` (text), `range` → `$name_min` and `$name_max`, `daterange` → `$name_from` and `$name_to` (ISO dates or null).
- Write queries that work when a filter is unset: `WHERE ($region IS NULL OR region = $region)`, `AND ($when_from IS NULL OR date >= $when_from::DATE)`, `AND ($q = '' OR product ILIKE '%' || $q || '%')`.
- Changing a filter on screen re-runs only the queries that use it. `status` shows current values under `params`; set one with `POST /api/views/<id>/params {"name","value"}`.
- A query that uses a `$var` no param provides is an error.

## Media

Media is displayed, never generated: `media` and `cards` show images and videos that already exist. Use absolute local paths (png, jpg, gif, webp, avif, svg, mp4, webm, mov, m4v, ogg) or http(s) URLs. genui serves a local file only because an accepted view references it, at a private token URL. A missing or unsupported file comes back as a warning on the item.

## Build up, then refine

1. `render` the frame: title, sections, maybe the first item. The URL comes back; the screen opens by itself.
2. Add one component per `patch` as you write it; each animates in.
3. Refine with small patches (`update` a field, `replace` a component, `move` things) instead of re-rendering.

## Problems

Every result carries `problems`: `{itemId?, severity: "error"|"warning"|"unverified", message, hint?}`.
- `error`: the item shows as a "couldn't render" card. Fix it with a patch (usually `replace` or `update` that item, or `addQuery`).
- `unverified`: no screen has confirmed the item yet (no screen open, or still drawing). Check `status` in a moment; not a failure.
- Render-time errors from the screen show up in `status` and `problems.json`.

## Data rules

- `profile` the data first: you get columns, types, stats and sample rows without reading the file yourself.
- Numbers in data-bound components (kpi, chart, table, json/text reading a query) must come from queries: never type a figure into a label or title of those. Labels name the measure in words.
- A headline number (kpi, or a `{query.field|format}` placeholder in prose) reads the first row, so its query must return exactly one row (an aggregate, or `ORDER BY … LIMIT 1`).
- Queries must read from a dataset table (`FROM <dataset>`); constant SELECTs are rejected. Alias columns descriptively (`AS total_revenue`, `AS size_mb`): units and formats are inferred from names.
- Authored content (your own prose, explanations, JSON values) is free: "3 replicas" is fine. When a figure comes from an attached dataset, write a placeholder like `{total.n|integer}` instead. Formats: number, integer, percent, currency, date, compact, delta, bytes, kilobytes, megabytes, gigabytes.
