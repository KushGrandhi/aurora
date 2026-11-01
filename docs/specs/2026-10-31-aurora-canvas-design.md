# aurora Canvas — Design (Plan 2: rich canvas + design canvas)

Status: draft for approval · 2026-10-31 · builds on `docs/specs/2026-10-31-aurora-design.md` (Plan 1, implemented on branch `plan-1-core`)

## 1. Intent and the why

aurora becomes a **universal surface**: whatever an LLM needs to show, it appears on screen as the right interface, immediately, and can be refined in place. Kush's three scenarios:

1. **Analysis.** Asking an LLM for an analysis today yields a static artifact or a SQL table. Wanted: a live, rich, explorable view.
2. **Explaining a project to a colleague.** After discussing a project with Claude, Kush has to ask for a flow diagram and then draw it himself because there is no good surface. Wanted: the flow/architecture diagram generated from what was discussed, on a screen he can show.
3. **Complex designs and problems.** Building a design or website takes many slow iterations. Wanted: describe it, see it rendered, refine it in place — pictures, video, flow and architecture diagrams, websites, anything.

**aurora is a renderer plus a skill.** The calling LLM — whichever one, through a router or a subscription — composes; aurora validates, renders, animates, and reports problems back. aurora never needs its own model to be useful.

## 2. Decisions (made with Kush)

| # | Decision |
|---|---|
| D1 | **The calling LLM composes.** aurora is a tool any LLM (via a router or a subscription) hooks into. aurora's built-in composer (Plan 1) stays only as a fallback for callers without an LLM. |
| D2 | **Hook-in surface: skill + MCP tools**, with HTTP underneath. The skill teaches the spec so any harness can use it. |
| D3 | **Edits are patches by component id**, applied in place with natural, Apple-like animation. |
| D4 | **The LLM authors content** (diagrams, prose, cards, designs). Two delivery paradigms, both live: **direct calls** (tool/HTTP) and **file streaming** (the LLM writes/appends a view file that aurora watches). Components show up the moment they arrive. |
| D5 | **Engines are swappable.** Every engine/component/UI element sits behind a small interface so it can be replaced when something better comes along. Mermaid for breadth of diagram types; a custom architecture/graph component for diagrams that must look great. |
| D6 | **Media is displayed, not generated.** Images and video come from files/URLs the caller provides. |
| D7 | Also in scope: maps, network graphs, timelines, cards, tabs and sections, sparklines in tiles, filters. |
| D8 | **Design canvas:** HTML/CSS/JS or React + Tailwind, transpiled in the browser, run in a sandbox, libraries bundled locally (works offline). Every iteration is a saved version; variants side by side. |
| D9 | **Sharing/hosting is out of scope.** Kush will build the server-hosted part separately; this design must not block it (see §11). |
| D10 | **Layout: grid + tabs + titled sections.** |
| D11 | **The person at the screen can pick.** Choosing an older version or a variant on screen makes it the **current version**; the LLM's next patch builds on it, and `status` reports it. History is linear: going back creates a new version (a copy), nothing is lost. The LLM can send 2–3 **alternatives at once** ("give me three options"), shown side by side; picking one makes it current. Reverts can target the whole view or a single item. Patches carry the version they were made against; if the screen changed the current version since then, the patch still applies on top of the current one and the result says so (the caller is told what changed). |

## 3. Goals, non-goals, anti-goals

**Goals**
- Any topic shown as accurately as possible: data views, diagrams of every common kind, architecture pictures, media, prototypes and websites.
- Fast iteration: a refinement is a small patch that updates the screen in place within a fraction of a second of arriving.
- Motion that feels natural (spring physics, shared-element transitions), never gratuitous.
- Usable from any LLM harness with only a skill + tools (Claude Code, Codex, a local agent, a backend-connected LLM).

**Non-goals (this plan)**
- "Frontend for a backend SaaS" (actions, forms, API binding, auth) — Kush: an LLM connected to the backend plus aurora covers it.
- Sharing, hosting, multi-user, server deployment.
- Generating images/video.
- Making aurora's own LLM composer smarter.

**Anti-goals**
- **Numbers typed by an LLM in data panels.** The Plan 1 rule stays for anything bound to a dataset: numbers come from queries. (Authored content — diagrams, prose, designs — is the LLM's own and is exempt.)
- **Lock-in to one engine.** No component reaches into another's internals; replacing Mermaid or ELK touches one adapter.
- **Janky or gratuitous motion.** Layout jumps, flashes of unstyled content, animations that delay reading.
- **Unsafe execution.** LLM-written code never runs with access to aurora, the machine, or the network.
- **Silent failure.** If something the caller sent can't render, the caller finds out with a reason it can act on.

## 4. Architecture

```
 calling LLM (any harness)
   │ skill teaches the spec
   ├── MCP tools: render / patch / status / profile / version
   ├── HTTP: same operations
   └── file streaming: writes/appends  <workspace>/.aurora/views/<name>.ndjson
                │
 ┌──────────────▼───────────── aurora server ─────────────────────────────┐
 │ op intake → validate (component registry schemas, data rules)         │
 │          → view store (current state + version history per view)      │
 │          → data runtime (Plan 1: DuckDB ingest/profile/queries)        │
 │          → event bus → WebSocket                                       │
 │ render-error intake ← screen reports (diagram parse errors, sandbox)   │
 └──────────────┬────────────────────────────────────────────────────────┘
                ▼
 screen (React) → component registry → engines behind adapters → motion system
```

### 4.1 The view document

```jsonc
{
  "id": "auth-redesign",                 // stable; caller-chosen or generated
  "title": "Auth service redesign",
  "summary": "…",                        // optional; placeholders allowed when data-bound
  "datasets": { "events": "/abs/path/events.parquet" },   // optional (Plan 1 inputs)
  "queries": { "q1": { "sql": "SELECT …" } },             // optional
  "sections": [
    { "id": "overview", "title": "Overview", "layout": "grid",
      "items": [ { "id": "k1", "span": 3, "c": { "type": "kpi", … } } ] },
    { "id": "flows", "title": "Flows", "layout": "tabs",
      "items": [ { "id": "login", "title": "Login", "c": { "type": "diagram", … } } ] }
  ]
}
```

- Plan 1's single grid becomes one section; Plan 1 specs load unchanged (converted on intake).
- Every section and item has a **stable id**; animation and patches key on it.

### 4.2 Patch operations

A patch is an ordered list of ops applied atomically (all validate or none apply):

| op | effect |
|---|---|
| `set` | set view fields (title, summary) |
| `addSection` / `removeSection` / `moveSection` | section level |
| `add` | add an item into a section, optionally `after` an item id |
| `update` | deep-merge into an item (`c` fields, span, title) |
| `replace` | replace an item's component entirely (e.g. "make this a map") |
| `remove` / `move` | item level |
| `addQuery` / `addDataset` | data runtime |

A full `render` is just "replace the whole view". Each accepted patch creates a new **version** of the view (history kept, revertible).

**Persistence** (my call): views and their version history are saved as plain JSON under `~/.aurora/views/<id>/`. Inline data is saved beside them as NDJSON. Old views stay **fully editable** after a restart: the data runtime becomes **per view**, opening that view's DuckDB on demand (re-loading datasets from their paths) and closing it after 10 idle minutes. If a dataset path has disappeared, data-bound items report a problem and authored items still render. Retention: the last 200 views or 30 days, whichever keeps more.

### 4.3 Delivery paradigms (D4)

1. **Direct calls** — MCP tools and HTTP:
   - `profile({data})` → dataset profiles (Plan 1).
   - `render({view})` → `{viewId, version, url, problems[]}`.
   - `patch({viewId, ops})` → `{version, problems[]}`.
   - `status({viewId})` → current version plus any render-time problems reported by the screen.
   - `version({viewId, to})` → revert/compare.
   A caller wanting a live build-up sends `render` with the frame (title, sections) and then a `patch` per component as it writes them; each appears with its entrance animation.
2. **File streaming** — the caller appends JSON lines to `<workspace>/.aurora/views/<name>.ndjson`: the first line is a view (or a Plan 1 spec), later lines are patches. aurora watches the directory, applies lines as they land (partial lines wait), and writes problems to `<name>.problems.json` beside it so a file-only harness can read them. Any harness that can write files can stream.
3. Both paths feed the **same op intake**, so validation, versions and animation are identical.

**Server and folders** (my call): one shared local server (port 4317, as in Plan 1). The MCP entry point is a small stdio command, `aurora mcp`, that each harness spawns; it starts the shared server if it isn't running, forwards calls to it, and on connect **registers its working directory's `.aurora/views/` for watching**. `aurora watch <dir>` registers a folder by hand. Because watching is tied to an MCP connection or an explicit command, writing view files in a folder aurora doesn't know about is reported by the skill as a mistake ("connect aurora or run `aurora watch`").

### 4.4 Validation and feedback to the caller

- **Static** (on intake): component schemas from the registry, ids unique, references resolve, data-bound rules from Plan 1 (single-row headline numbers, SQL guard, unit inference).
- **Where the no-typed-numbers rule applies** (my call): to **data-bound components only**, meaning those whose `dataBound()` returns query ids (kpi, chart, table, and cards/map/graph/timeline when fed by a query); their values must come from query results, and their labels/titles follow the Plan 1 digit rule. **Authored content is free**: `text`, the summary, diagrams, architecture, authored cards/timelines and designs may contain numbers ("3 replicas"). Placeholders `{query.field|format}` remain available in any prose, and the skill tells callers to use them whenever a figure comes from an attached dataset.
- **Render-time** (from the screen): diagram parse errors, layout failures, sandbox runtime errors and console errors. The screen reports them over the WebSocket; the server attaches them to the view version.
- **No screen connected** (my call): `render`/`patch` open the screen automatically (Plan 1 behaviour) and wait for its first report; items not yet confirmed by a screen are reported as `unverified` in tool results, `status` and `problems.json`, never as fine. Server-side headless verification is a later option, not in this plan.
- Problems are returned in tool results (synchronous static ones immediately; `render`/`patch` also wait briefly — target ≤ 1.5 s — for the first render-time report when a screen is connected) and through `status`. Each problem names the item id, what failed and a hint.
- Invalid items never break the rest of the view: they render as a small inline "couldn't render: reason" card in place.

## 5. Component registry (D5)

Every component is one module that registers:

```ts
interface ComponentDef<C> {
  type: string;                       // "diagram", "map", …
  schema: ZodType<C>;                 // validation + JSON schema for the skill and constrained decoding
  doc: { summary: string; example: C; guidance: string };   // feeds the generated skill
  dataBound?: (c: C) => string[];     // query ids it reads (Plan 1 rules apply to these)
  Render: React.FC<{ c: C; ctx: RenderCtx }>;               // ctx: results, theme, report(problem), motion
}
```

Engines (Mermaid, ELK, MapLibre, Vega-Lite, the sandbox runtime, the code highlighter) sit behind **adapter interfaces** owned by the component that uses them, e.g. `DiagramEngine.render(source, theme) → {svg} | {error}`. Swapping an engine replaces one adapter file.

The skill's component reference is **generated from the registry** (`aurora skill` writes `SKILL.md`), so adding a component updates what LLMs know.

### 5.1 Catalog

Existing (Plan 1, migrated to the registry): `kpi` (gains optional `sparkline: {query, x, y}`), `chart` (Vega-Lite), `table`, `text`.

New:

| type | what | engine (swappable) |
|---|---|---|
| `diagram` | Mermaid source: flowchart, sequence, state, class, ER, gantt, mindmap, timeline, journey, etc. Themed to aurora tokens. | Mermaid |
| `architecture` | nodes (label, kind/icon, group), edges (label, style, animated flow), groups/boundaries; auto-layout; for system and project diagrams that must look great | ELK layout + custom SVG/React rendering; icons from a bundled open icon set |
| `graph` | larger network graphs (hundreds–thousands of nodes) with pan/zoom, from data or authored | Cytoscape.js or Sigma.js |
| `map` | points, routes, choropleth (bundled Natural Earth boundaries), from data | MapLibre + free OSM-based style (online tiles) |
| `timeline` | events and spans over time, authored or from data | custom |
| `cards` | grid/list of entities (title, subtitle, image, tags, fields) | custom |
| `media` | image, image gallery, video (file path or URL), caption | native elements |
| `code` | syntax-highlighted code or config, optional diff view | Shiki (or equivalent) |
| `callout` | note / tip / warning / decision box | custom |
| `steps` | numbered process with short descriptions | custom |
| `design` | design canvas (§7) | sandbox runtime |
| `custom` | raw HTML/JS escape hatch, same sandbox as `design` | sandbox runtime |

Containers: `section` (grid or tabs), plus `tabs` within a grid item if needed.

**Filters/params** (from Plan 1 design §11): view-level params (select, range, date range, search) bound to queries; changing one re-runs dependent queries and animates affected panels.

## 6. Motion system (D3)

- Library: **Motion (framer-motion)** for React — spring physics, layout animations, shared-element transitions. (Plan 1's CSS/View-Transition animations are replaced by it.)
- Principles (Apple HIG-like): springs not linear tweens; motion follows cause (a patched item animates from where it was); short (150–450 ms); interruptible; nothing animates that the reader must wait for; `prefers-reduced-motion` turns motion into simple fades.
- Behaviours:
  - **Enter:** items rise and fade in on a spring, staggered by arrival.
  - **Patch update:** the item morphs in place (layout animation), with a brief accent glow on what changed.
  - **Replace:** crossfade + size morph between old and new component.
  - **Move/reflow:** neighbours glide to new positions (shared layout).
  - **Diagrams:** nodes appear in reading order, edges draw along their paths; on patch, unchanged nodes stay put, new ones grow in, removed ones fade.
  - **Numbers:** tiles count to new values (Plan 1).
  - **Tabs/sections:** content slides with a shared underline indicator.
- The motion system exposes a tiny API to components (`ctx.motion`) so engines can participate without importing the library directly.

## 7. Design canvas (D8)

- Component `design`: `{ framework: "html" | "react", files: { [path: string]: string }, entry?: string, viewport?: "desktop" | "tablet" | "phone", data?: string[] /* query ids injected as window.aurora.data */ }`.
- **Projects, not snippets** (my call): any number of files with relative imports between them (a small in-browser module resolver over `files`), multiple pages via in-frame hash routing, local images/video through media token URLs (allowed by the frame's CSP), and bundled open-license fonts (e.g. Inter) served from `/lib/fonts`.
- Runs in a **sandboxed iframe** (`sandbox="allow-scripts"`, no same-origin, CSP blocks all network except aurora's own `/lib/*` route). Libraries served locally: React, ReactDOM, Tailwind (browser build), Sucrase (JSX transpile), plus an approved small set (e.g. Motion, an icon set). No CDN; works offline.
- **Iteration:** patches can replace a file or apply search/replace edits to it (cheap for small changes). Every accepted change is a new version; the screen shows a version strip with instant switching and a side-by-side **variants** mode (up to 3 versions or caller-sent alternatives). Picking one on screen makes it current (D11).
- **Viewport switcher:** desktop / tablet / phone frames.
- **Errors:** runtime and console errors from inside the frame are reported as render-time problems for the caller (§4.4).
- `custom` uses the same runtime with a single HTML file; both get a visible "custom" badge when they show data (Plan 1 rule).

## 8. Media and files

- `media` items reference a path or URL. aurora serves local files **only** when they are referenced by an accepted view: intake registers each path and serves it at an unguessable token URL. No arbitrary file reads (lesson from the Plan 1 review's cross-site finding).
- Supported: common image and video formats the browser plays natively.

## 9. The skill

- `aurora skill` generates `SKILL.md` from the registry: when to use aurora, the two delivery paradigms, the view/patch format, each component's summary + example + guidance, how to read problems and fix them, and patterns (build up a view part by part; refine with patches; diagrams for explanations; design canvas for UI).
- Installed for Claude Code at `~/.claude/skills/aurora/` (replaces the Plan 1 bridge skill). The same markdown is usable by other harnesses (e.g. referenced from an `AGENTS.md`).

## 10. Security

- Plan 1 protections stay (local-only Origin/Host checks, JSON content-type, SQL sandbox).
- Sandboxed frames for `design`/`custom`; no network; no access to the parent page.
- Media served only by registered tokens.
- File streaming only watches `<workspace>/.aurora/views/` directories aurora was started for (configurable list).

## 11. Not blocking server hosting (D9)

- The screen talks to the server only through the event protocol (WebSocket) and HTTP; no assumptions that the server shares a filesystem with the screen beyond media tokens.
- Op intake, view store and data runtime are transport-independent modules, so Kush's future server can host them and accept calls from remote LLMs.

## 12. Testing

- Per component: schema tests, a fixture spec, and a Playwright screenshot in a **component gallery** page (light + dark) that doubles as the visual review surface.
- Patch semantics: unit tests for every op, atomicity, versioning, revert.
- File streaming: tests for appended lines, partial lines, malformed lines (reported, not fatal).
- Render-time feedback: a broken Mermaid diagram and a throwing design both produce problems the caller can read.
- Motion: a smoke test that patches don't remount unchanged items (identity preserved), and reduced-motion mode.

## 13. Suggested build order

1. View document v2, patch ops, versions, op intake; Plan 1 specs converted; component registry with existing components migrated.
2. MCP server + HTTP endpoints + file streaming + problems feedback; generated skill.
3. Motion system (enter, patch morph, replace, reflow, reduced motion).
4. `diagram`, `code`, `callout`, `steps`, `media`, `cards`, `timeline`.
5. `architecture` (ELK + custom rendering + animated edges).
6. `map`, `graph`, filters/params, KPI sparklines.
7. Design canvas: sandbox runtime, local libs, versions strip, variants, viewport switcher; `custom` on the same runtime.

## 13a. Plan 1 compatibility (my call)

- The existing `{data, intent}` input keeps working on HTTP (`POST /api/render`), the CLI and a `compose` MCP tool: it runs the built-in composer, which now emits a v2 view. The Plan 1 bridge skill is replaced by the generated skill, which covers both shapes.
- Plan 1 roadmap items: `refine` becomes caller patches; `save` becomes view persistence; the `json` component is added to the catalog (collapsible tree); the on-screen refine text box is dropped (the calling LLM refines).

## 14. Left to the builder

Exact library choices where a row says "or" (Cytoscape vs Sigma, Shiki vs alternative), icon set choice (open license), spring constants, gallery page design, file-watch implementation, MCP SDK usage details, version storage format (plain JSON on disk under `~/.aurora/views/`), and the exact wording/structure of the generated skill.
