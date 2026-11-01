# genui Plan 2b — Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The calling LLM can show any common kind of picture on the genui screen: Mermaid diagrams, good-looking architecture diagrams, network graphs, maps, timelines, cards, images and video, code, callouts and steps. It also gets KPI sparklines and view-level filters that re-run queries. Every component is checked, animated and reported back like the Plan 2a ones.

**Architecture:** Each component is one spec-side `ComponentDef` (schema, doc, data binding, semantic `check`, `media` refs) plus one renderer module. Heavy engines (Mermaid, ELK, Cytoscape, MapLibre, Shiki) sit behind small adapter files in `renderer/src/engines/`. They are lazy-loaded, so a view only downloads the engines it uses. The server gains a media registry, which serves only files that accepted views reference, at token URLs. It also gains view params: filter values held per view, which re-run the queries that reference them.

**Tech Stack:** Plan 2a stack plus `mermaid` 12.x, `elkjs` 0.12.x, `cytoscape` 3.34.x, `maplibre-gl` 6.x, `world-atlas` 2.x + `topojson-client` 3.x, `i18n-iso-countries` 7.x, `shiki` 4.x, `lucide-react` 1.x.

**Spec:** `docs/specs/2026-10-31-genui-canvas-design.md` (§5.1 catalog, §5 adapters, §6 motion for diagrams, §8 media, §12 testing, §5.1 filters/params). The Plan 2a foundation is merged on `plan-1-core`.

**Scope:** `diagram`, `architecture`, `graph`, `map`, `timeline`, `cards`, `media` (+ media tokens), `code`, `callout`, `steps`, filters/params, KPI sparklines, the component gallery and the generated skill's guidance for them. **Not here (Plan 2c):** `design`/`custom` sandbox, side-by-side variants, viewport switcher.

## Global Constraints

- The calling LLM composes; genui validates, renders, animates and reports problems (D1).
- Engines are swappable: each engine is used only through its adapter in `packages/renderer/src/engines/`; no component imports another component's internals (D5).
- Engines: Mermaid for diagrams; ELK layout + custom SVG/React rendering for `architecture`; MapLibre with bundled Natural Earth boundaries for `map`, with online OSM raster tiles as an optional layer (§5.1).
- No CDN: every library and asset is bundled by Vite or served by genui (D8 spirit; the screen works offline except optional map tiles).
- Engines load lazily: the main entry chunk must not contain Mermaid, ELK, Cytoscape, MapLibre or Shiki.
- Media is displayed, never generated (D6). Local files are served **only** when an accepted view references them, at unguessable token URLs; nothing else is readable (§8, §10).
- No-typed-numbers applies only to data-bound components (those whose `dataBound()` is non-empty): their figures come from query results and their titles/labels follow the Plan 1 digit rule. Authored content is free (§4.4).
- Render-time failures (e.g. a Mermaid parse error) reach the caller as problems through the screen report; invalid items render as the inline fallback card and never break the view (§4.4).
- Motion follows Plan 2a: springs (`SPRING`, `SPRING_SOFT`), 150–450 ms, interruptible, reduced motion → fades. Diagrams: nodes appear in reading order, edges draw along their paths. On patch, unchanged nodes stay put, new ones grow in and removed ones fade (§6).
- Charts and colours follow the dataviz palette already in `renderer/src/theme.ts`: categorical hues in fixed order, text in ink tokens and never in series colours. Light and dark come from the same tokens.
- Filters sit in one row above the view's sections. Changing one re-runs only the queries that reference it, and the affected panels animate (§5.1, dataviz interaction rules).
- SQL params are always bound by DuckDB, never interpolated into SQL text.

## Review Focus

1. **Broken Mermaid source** (a typo in a flowchart): the item shows the fallback card with Mermaid's message. `status` and the tool result carry that message as an error for the item, and the rest of the view renders. → Task 7 e2e `broken mermaid becomes a problem`.
2. **Architecture referencing missing ids** (an edge to an undefined node, a node in an undefined group, a group cycle): a static error names the id; nothing crashes in ELK. → Task 1 test `architecture check names missing ids`.
3. **Media path probing** (a token for a file no view references, `..` in the URL, a guessed token, a symlink swapped after registration): 404, never the file. → Task 3 test `media serves only registered files`.
4. **Offline screen** (OSM tiles unreachable): the map still shows bundled country shapes, points and routes; no blank canvas. → Task 10 e2e `map works offline`.
5. **Hostile or invalid filter values** (a select value that isn't an option, `'; DROP TABLE` in search, a range outside min/max, a param the view doesn't define): rejected or bound as a value; queries never see interpolated text. → Task 3 test `param values are validated and bound`.

---

## File Structure

```
packages/spec/src/
  registry.ts                 + check?, media?, doc.fixture?
  params.ts                   ParamSchema, paramVars(), validateParamValue()
  view.ts / ops.ts            + View.params, ops addParam / removeParam
  events.ts                   + ViewEvent media/params, ScreenMessage param
  components/                 + diagram architecture graph map timeline cards media code callout steps; kpi gains sparkline
packages/engine/src/
  validateView.ts             + check(), param references, media refs
  sql.ts                      explainQuery(db, sql, params?)
packages/server/src/
  media.ts                    MediaRegistry: tokens, /media/<token> with Range
  intake.ts                   + media map, param values, re-run on param change
  dataRuntime.ts              run(..., params?)
  gallery.ts                  galleryView()
  assets/gallery/             sample.svg
  server.ts / cli.ts          /media, /api/gallery, `genui gallery`
  skillGuide.md               + patterns for diagrams, architecture, filters, media
packages/renderer/src/
  registry.tsx                lazy renderers + Suspense, ctx.media
  engines/                    mermaid.ts elk.ts highlight.ts graph.ts map.ts (adapters)
  sparkline.ts                sparklinePath()
  components/                 Diagram Architecture Graph MapView Timeline Cards Media Code Callout Steps FilterBar
  gallery: rendered from the server's gallery view (no separate page)
```

---

### Task 1: Component definitions (spec side)

**Files:**
- Modify: `packages/spec/src/registry.ts`, `packages/spec/src/components/{index,kpi}.ts`
- Create: `packages/spec/src/components/{diagram,architecture,graph,map,timeline,cards,media,code,callout,steps}.ts`
- Test: `packages/spec/test/components.test.ts`

**Interfaces:**
- Produces:
  - `ComponentDef` gains `check?: (c: C) => string | null` (semantic error beyond the schema), `media?: (c: C) => string[]` (local paths or URLs it displays), and `doc.fixture?: { datasets: Record<Id, { inline: unknown[] }>; queries: Record<Id, { sql: string }> }`. Data-bound examples must carry a fixture whose queries the example reads; dataset and query names are prefixed with the component type, e.g. `map_cities`.
  - Schemas (all `type` literal + fields below; `title?: string` belongs on the item, not `c`):
    - `diagram`: `{ source: string (min 1), caption?: string }`. Authored.
    - `architecture`: `{ nodes: {id: Id; label: string; kind?: Kind; group?: Id; note?: string}[] (1..200); edges: {from: Id; to: Id; label?: string; style?: "solid"|"dashed"|"dotted"; flow?: boolean}[]; groups?: {id: Id; label: string; parent?: Id}[]; direction?: "right"|"down" }` where `Kind = "service"|"database"|"queue"|"cache"|"client"|"user"|"storage"|"function"|"gateway"|"external"|"model"`. `check`: duplicate node/group ids, edge endpoints, group refs, parent cycles. Authored.
    - `graph`: `{ nodes?: {id: string; label?: string; group?: string; size?: number}[]; edges?: {from: string; to: string; weight?: number}[]; query?: { edges: Id; nodes?: Id }; layout?: "force"|"circle"|"grid" }`. Edge query columns are `source, target[, weight]` and node query columns are `id[, label, group, size]`. `check`: needs `edges` or `query`. Data-bound when `query`.
    - `map`: `{ points?: { query: Id; lat: string; lon: string; label?: string; size?: string } | { lat: number; lon: number; label?: string }[]; routes?: { path: [number, number][] /* [lon, lat] */; label?: string }[]; choropleth?: { query: Id; key: string /* ISO alpha-3, numeric or name */; value: string }; center?: [number, number]; zoom?: number; tiles?: "osm"|"none" }`. Data-bound on the point/choropleth queries.
    - `timeline`: `{ events?: {date: string; end?: string; title: string; detail?: string; group?: string}[]; query?: { id: Id; date: string; title: string; end?: string; group?: string } }`. `check`: events or query; dates parse (`!isNaN(Date.parse)`).
    - `cards`: `{ items?: {title: string; subtitle?: string; image?: string; tags?: string[]; fields?: Record<string, string|number>}[]; query?: { id: Id; title: string; subtitle?: string; image?: string; tags?: string; fields?: string[] }; layout?: "grid"|"list" }`. `media` returns authored `image`s.
    - `media`: `{ items: {src: string; kind?: "image"|"video"; caption?: string; alt?: string}[] (1..60); layout?: "single"|"gallery" }`. `media` returns every `src`; kind inferred from the extension when absent.
    - `code`: `{ code: string; lang?: string; filename?: string; highlight?: number[]; diff?: boolean /* code is a unified diff */ }`.
    - `callout`: `{ tone: "note"|"tip"|"warning"|"decision"; title?: string; md: string }`. `placeholders` → `[md]`.
    - `steps`: `{ steps: {title: string; detail?: string; status?: "done"|"current"|"todo"}[] (1..30) }`.
    - `kpi` gains `sparkline?: { query: Id; x: string; y: string }`; `dataBound` includes it.

- [ ] **Step 1: Write failing tests**:
  - `registry has every 2b component`: the registered types include all ten new types.
  - `every example validates and data-bound examples carry fixtures`: for every def, `def.schema.safeParse(def.doc.example)` succeeds and `def.check?.(example)` is null. When `def.dataBound?.(example)` is non-empty, every id it returns is in `doc.fixture.queries`. Fixture dataset and query names are unique across all defs.
  - `architecture check names missing ids`: an edge `to: "ghost"` gives a message containing `ghost`; `group: "nogroup"` gives `nogroup`; groups `a.parent=b, b.parent=a` give a message containing `cycle`; duplicate node `x` gives `x`.
  - `media refs`: `getComponent("media").media({type:"media", items:[{src:"/a.png"},{src:"https://x/y.mp4"}]})` returns `["/a.png","https://x/y.mp4"]`, and cards returns its images.
  - `kpi sparkline is data-bound`: a kpi with `query: "q"` and `sparkline.query: "s"` gives `dataBound` → `["q","s"]`.
  - `graph and timeline need data`: `{type:"graph"}` → check non-null; timeline with `date:"soon"` → message contains `soon`.
- [ ] **Step 2: Run** `npx vitest run packages/spec` → new tests FAIL.
- [ ] **Step 3: Implement** the defs. Each doc says when to pick the component and when not to: diagram for flows, sequences and states written in Mermaid; architecture for system pictures that must look polished; graph for many nodes from data. Register them in `components/index.ts`.
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat(spec): plan 2b component definitions`.

---

### Task 2: View params and validation

**Files:**
- Create: `packages/spec/src/params.ts`
- Modify: `packages/spec/src/{view,ops,events,index}.ts`, `packages/engine/src/validateView.ts`, `packages/engine/src/sql.ts`
- Test: `packages/spec/test/params.test.ts`, `packages/engine/test/validateView.test.ts` (add)

**Interfaces:**
- Produces:
  - `ParamSchema` (discriminated on `type`):
    - `{type:"select", label, options: string[] | {query: Id; field: string}, default?: string | null}` (null means "All")
    - `{type:"range", label, min: number, max: number, step?: number, default?: [number, number]}`
    - `{type:"daterange", label, default?: [string, string]}`
    - `{type:"search", label, default?: string}`
  - `View.params?: Record<Id, Param>`; ops `{op:"addParam", name: Id, param: Param}` (adds or replaces) and `{op:"removeParam", name}` (unknown name → atomic rejection, like other ops).
  - `paramVars(name, param): string[]`: `select`/`search` → `[name]`; `range` → `[name_min, name_max]`; `daterange` → `[name_from, name_to]`.
  - `paramDefaults(params): Record<string, unknown>`: values for every var. Select defaults to `default ?? null`, range to `[min, max]`, daterange to `[null, null]` and search to `""`.
  - `validateParamValue(param, value, options?: string[]): { ok: true; vars: Record<string, unknown> } | { ok: false; message: string }`:
    - select: must be null or one of `options`.
    - range: two numbers with `min ≤ a ≤ b ≤ max`.
    - daterange: two ISO dates or nulls.
    - search: a string of at most 200 characters.
  - `sqlVars(sql): string[]`: the `$name` references outside string literals (reuse the literal-stripping regex from engine `sql.ts`, moved to spec as `stripSqlLiterals`).
  - Events: `ViewEvent` adds `{t:"params", viewId, values: Record<string, unknown> /* by param name */, options: Record<string, string[]>}` and `{t:"media", viewId, urls: Record<string, string>}`. `ScreenMessage` adds `{t:"param", viewId, name, value}`.
  - `explainQuery(db, sql, params?)` binds params like `runQuery`.
  - `validateView` additions:
    - A query whose `sqlVars` include a name that no param provides gets an error with no itemId, naming the query and the var.
    - `def.check(c)` failing gives an error on the item, which is listed in `invalid`.
    - Options-query params must read an existing query.
- [ ] **Step 1: Write failing tests**:
  - `paramVars names`: covers all four types.
  - `defaults`: select → `{region: null}`; range `{min:0,max:10}` → `{price_min:0, price_max:10}`.
  - `validateParamValue rejects bad values`: an option not in the list, `[5, 2]`, `[0, 99]` with max 10, `"x".repeat(201)` and `"not-a-date"` are each rejected with a message; `"'; DROP TABLE data; --"` as search is ok (it is a value).
  - `sqlVars ignores literals`: `SELECT '$no' , $yes FROM t WHERE x = $r_min` → `["yes","r_min"]`.
  - `addParam and removeParam ops`, `removeParam unknown is rejected atomically`.
  - validateView: `query with unknown $var is an error`, `component check failure is invalid` (architecture with a dangling edge), `param options query must exist`.
- [ ] **Step 2: Run** `npx vitest run packages/spec packages/engine` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat: view params and component checks`.

---

### Task 3: Server: media registry and param runtime

**Files:**
- Create: `packages/server/src/media.ts`
- Modify: `packages/server/src/{intake,dataRuntime,server}.ts`
- Test: `packages/server/test/media.test.ts`, `packages/server/test/params.test.ts`

**Interfaces:**
- Consumes: `ComponentDef.media`, `ParamSchema`, `paramDefaults`, `validateParamValue`, `sqlVars`
- Produces:
  - `class MediaRegistry { constructor(opts: { secretFile: string /* ~/.genui/secret, created 0600 with 32 random bytes */ }) }`
    - `register(absPath): string | null`. It returns `/media/<token>` when the path is absolute, exists, is a regular file (resolved through `realpath`) and has one of these extensions: png, jpg, jpeg, gif, webp, avif, svg, mp4, webm, mov, m4v, ogg. Otherwise it returns null. The token is `sha256(secret + realpath)`, hex, first 32 characters, so it is stable across restarts.
    - `serve(token, req, res): Promise<boolean>`. It serves only registered tokens and re-checks `realpath` against the registered one. It honours `Range` (206 with a correct `Content-Range`), and sets `X-Content-Type-Options: nosniff`, plus `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` for SVG.
  - Intake:
    - **Media:** during `evaluate`, every item's `media()` refs are collected. `http(s)` URLs map to themselves. Local paths go through `register`; a null result gives a **warning** on the item: `media file not found or not a supported image/video: <path>`. Each commit and snapshot emits `{t:"media", viewId, urls}`.
    - **Params:** values live in the view's runtime, are not versioned, and start at `paramDefaults`. They are kept across versions while the param still exists with the same type.
    - **Query runs:** every query runs with the current var values. When a query's vars change value, that counts as a change and the query re-runs.
    - **Options queries:** a select's options query runs, and its distinct `field` values (in row order, capped at 200) become the options.
    - `setParam(viewId, name, value): Promise<{ ok: true } | { problem: Problem }>`. Unknown name or invalid value → problem. Otherwise it re-runs only the queries whose `sqlVars` intersect the param's vars, emits their `result` events and emits `{t:"params", ...}`. It goes through the view's queue.
    - `status()` adds `params: Record<string, unknown>`.
    - `screenMessage({t:"param"})` → `setParam`.
  - `DataRuntime.run(viewId, queryId, sql, params?: Record<string, unknown>)`.
  - HTTP: `GET /media/<token>` (origin rules as other GETs; a 404 reveals nothing), plus `POST /api/views/:id/params {name, value}` → `setParam`.
- [ ] **Step 1: Write failing tests**:
  - **`media serves only registered files`** (temp dir, real files):
    - A registered png gives 200 with `image/png`.
    - A token for an unregistered file, `/media/../../etc/passwd`, `/media/<32 random hex>` and a registered path later replaced by a symlink to another file all give 404.
    - `.txt` is not registrable.
  - `media range requests`: `Range: bytes=0-9` on a video file gives 206, `Content-Range: bytes 0-9/<size>` and a body of length 10.
  - `svg is sandboxed`: the response has the CSP header with `sandbox`.
  - `token stable across restarts`: a new registry with the same secret file gives the same token.
  - `intake emits media urls and warns on missing files` (intake with a fake emit).
  - **`param values are validated and bound`**:
    - Use a view with `params.region` (select, options from query) and query `SELECT sum(revenue) AS total_revenue FROM data WHERE ($region IS NULL OR region = $region)`.
    - `setParam` with `"East"` changes the result.
    - `"'; DROP TABLE data; --"` is rejected because it isn't an option.
    - The search param variant with the same text returns 0 rows, and a later query still works (the table exists).
    - Range `[0, 999]` beyond max is rejected.
    - An unknown param name gives a problem.
  - `param change re-runs only dependent queries` (count `result` events).
  - `status reports param values`.
- [ ] **Step 2: Run** `npx vitest run packages/server` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat(server): media tokens and view params`.

---

### Task 4: Renderer infrastructure: lazy engines, media URLs, filters, sparklines

**Files:**
- Modify: `packages/renderer/src/{registry.tsx,store.ts,App.tsx,styles.css}`, `components/{ItemFrame,Kpi}.tsx`
- Create: `packages/renderer/src/sparkline.ts`, `components/FilterBar.tsx`
- Test: `packages/renderer/test/{store,sparkline}.test.ts`, `packages/renderer/e2e/filters.spec.ts`

**Interfaces:**
- Consumes: `params`/`media` events, `ScreenMessage` param
- Produces:
  - Store: `State` gains `media: Record<viewId, Record<string, string>>`, `params: Record<viewId, { values; options }>`.
  - `RenderCtx` gains `media(src: string): string | undefined` (a URL, or undefined while unknown), `theme: { categorical: string[]; ink: string; muted: string; surface: string; hair: string }` (from `theme.ts` tokens for the current mode) and `motion` (Plan 2a).
  - The registry maps a type to `{ load: () => Promise<{ default: Renderer }>; selfReport?: boolean }`, and `rendererFor` returns a `React.lazy` component (cached per type). `ItemFrame` wraps it in `<Suspense fallback={skeleton}>`. Plan 1 components may stay eager except `chart` and `table`, which become lazy too.
  - `sparklinePath(points: {x: number; y: number}[], w: number, h: number, pad = 2): string`. It returns an SVG path `M…L…` scaled to the box, with the y axis inverted. It returns `""` for fewer than 2 points, and a flat line through the middle when all y are equal.
  - `Kpi` draws `c.sparkline` under the value: a 2px line in the first categorical colour plus an end dot, x sorted, about 32px tall, no axes, with a hover title showing the last value.
  - `FilterBar`: one row above the sections, with one control per param:
    - select: a dropdown with "All" for null.
    - range: two number inputs.
    - daterange: two date inputs.
    - search: a text input debounced 250 ms.
    - Changing a control sends `{t:"param"}`; values come from `params` events.
- [ ] **Step 1: Write failing tests**:
  - `sparklinePath`: 3 points in a 100×20 box → starts with `M2,` and contains two `L`; one point → `""`; equal ys → every y equals 10.
  - Store: `media and params events stored per view`.
  - e2e `filter re-runs dependent queries`:
    - Post a view with a select param over `sales.csv` regions, a KPI bound to `$region` and an unrelated KPI.
    - Choose `East` in the filter bar.
    - The bound KPI's text changes, the unrelated KPI's DOM node is the same node, and `GET /status` shows `params.region === "East"`.
  - e2e `kpi sparkline renders`: an `svg path` with a non-empty `d` inside the KPI.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` and `npx playwright test` → PASS. Then run `npx vite build` and check the entry chunk: `grep -l "mermaid\|maplibre\|cytoscape\|elkjs\|shiki" dist/assets/index-*.js` prints nothing.
- [ ] **Step 5: Commit** `feat(renderer): lazy engines, media urls, filter bar, sparklines`.

---

### Task 5: Authored components: callout, steps, cards, timeline, media

**Files:**
- Create: `packages/renderer/src/components/{Callout,Steps,Cards,Timeline,Media}.tsx`, `packages/renderer/src/timeScale.ts`
- Modify: `registry.tsx`, `styles.css`
- Test: `packages/renderer/test/timeScale.test.ts`, `packages/renderer/e2e/components.spec.ts`

**Interfaces:**
- Produces:
  - `timeScale(dates: string[], width: number): { x(date: string): number; ticks: { at: number; label: string }[] }`. It is linear over `[min, max]` padded by 4%. Ticks are 3–7 "nice" steps (day, week, month, quarter, year), labelled `MMM d`, `MMM yyyy` or `yyyy` depending on step.
  - **Callout:** tone icon and accent from the status palette (note = info blue, tip = good, warning = warning, decision = violet categorical). The icon always comes with the tone word, never colour alone. Markdown goes through the same sanitizer as `Text`.
  - **Steps:** a numbered vertical list with status dots; `current` has the accent ring and `done` a check.
  - **Cards:** grid (`auto-fill, minmax(220px, 1fr)`) or list, from authored items or query rows. Images use `ctx.media(src)`. Fields are formatted through `formatValue` with `inferFormat` when data-bound.
  - **Timeline:** groups become lanes, points become dots and spans become rounded bars. Below 560px container width it becomes a vertical list. Hovering shows the detail.
  - **Media:** `single` shows one image or video (with controls) and its caption; `gallery` shows a responsive grid, and a click opens a lightbox with arrow-key navigation and Escape to close. A failed load calls `ctx.report(false, "media: could not load <src>")`.
  - New items enter in reading order (40 ms stagger within the component) under Plan 2a motion rules.
- [ ] **Step 1: Write failing tests**:
  - `timeScale`: dates across 3 years give year ticks, across 2 weeks give day ticks, and `x(min) < x(max)`.
  - e2e `authored components render and report`:
    - Post a view with one of each of the five, using an SVG test asset registered as media.
    - Every item becomes visible, `status.unverified` is `[]`, and there are no error problems.
    - The media lightbox opens on click and closes on Escape.
  - e2e `missing media is a warning, not a crash`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(renderer): callout, steps, cards, timeline, media`.

---

### Task 6: Code

**Files:**
- Create: `packages/renderer/src/engines/highlight.ts`, `components/Code.tsx`
- Test: `packages/renderer/test/highlight.test.ts`, e2e in `components.spec.ts`

**Interfaces:**
- Produces:
  - `highlight(code: string, lang: string | undefined, mode: "light" | "dark"): Promise<string>`. This is the adapter: it lazy-imports `shiki` `createHighlighter` with themes `github-light`/`github-dark` and the languages ts, tsx, js, json, python, sql, bash, yaml, toml, go, rust, java, css, html, markdown and diff. An unknown or missing lang falls back to `text`. The result is HTML.
  - `diffLineKind(line: string): "add" | "del" | "hunk" | "meta" | "ctx"`:
    - `+` (but not `+++`) → add
    - `-` (but not `---`) → del
    - `@@` → hunk
    - `diff `, `index `, `+++` or `---` → meta
    - anything else → ctx
  - `Code`:
    - The header shows the filename (or lang) and a copy button that copies the raw code.
    - Line numbers are shown, and `highlight` lines get an accent background.
    - With `diff: true`, it highlights as `diff` and tints lines by `diffLineKind`.
    - Code longer than 40 lines collapses with a "Show all N lines" toggle.
    - It is self-reporting: it reports after highlighting resolves.
- [ ] **Step 1: Write failing tests**: `diffLineKind` table (all five kinds, plus `+++ b/x` → meta); `highlight` (node) on `const a = 1` with lang ts contains `<span` and `const`; `highlight` with lang `nonsense` doesn't throw.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** unit + e2e (`code highlights and copies`) → PASS.
- [ ] **Step 5: Commit** `feat(renderer): code component`.

---

### Task 7: Diagram (Mermaid)

**Files:**
- Create: `packages/renderer/src/engines/mermaid.ts`, `components/Diagram.tsx`
- Test: `packages/renderer/e2e/diagram.spec.ts`

**Interfaces:**
- Produces:
  - `DiagramEngine = { render(id: string, source: string, mode: "light" | "dark"): Promise<{ svg: string } | { error: string }> }`, exported as `mermaidEngine`.
    - It lazy-imports `mermaid` and initializes once per mode with `startOnLoad: false`, `securityLevel: "strict"`, `theme: "base"` and `themeVariables` from the genui tokens (surface, ink, hair, accent, font `Inter, system-ui`).
    - Parse errors return `{ error }` with Mermaid's first message line.
  - `Diagram`:
    - It renders the SVG inline with `max-width: 100%` and pan/zoom off, and adds the optional caption.
    - **Entrance:** `.node`/`.actor`/`.cluster` elements fade and rise in DOM (reading) order, 30 ms apart. Edge paths draw via `stroke-dasharray` and `stroke-dashoffset` over 400 ms.
    - **On re-render after a patch:** elements whose ids existed before appear without the entrance; only new ids animate.
    - **Reduced motion:** opacity only.
    - It is self-reporting: `{error}` → `ctx.report(false, "mermaid: <message>")` and the fallback card shows the message.
- [ ] **Step 1: Write failing e2e tests**:
  - `flowchart, sequence and state diagrams render` (each item contains an `svg` and reports ok).
  - **`broken mermaid becomes a problem`**: source `graph TD; A-->` gives a fallback card. `GET /status` has an error problem for the item whose message starts with `render failed: mermaid:`, and a sibling text item reports ok.
  - `patching a diagram animates only new nodes` (count elements carrying the entrance class after adding one node: exactly 1).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(renderer): mermaid diagrams`.

---

### Task 8: Architecture

**Files:**
- Create: `packages/renderer/src/engines/elk.ts`, `components/Architecture.tsx`, `components/archIcons.ts`
- Test: `packages/renderer/test/elk.test.ts`, `packages/renderer/e2e/architecture.spec.ts`

**Interfaces:**
- Produces:
  - `layoutArchitecture(c: Architecture): Promise<ArchLayout>`. This is the adapter. It uses `elkjs/lib/elk.bundled.js` with these options:
    - `algorithm: "layered"`, `elk.direction: RIGHT | DOWN`
    - `elk.edgeRouting: ORTHOGONAL`
    - `elk.layered.spacing.nodeNodeBetweenLayers: 72`, `elk.spacing.nodeNode: 32`
    - `elk.hierarchyHandling: INCLUDE_CHILDREN`
    - groups are compound nodes, with `elk.padding: [top=36,left=16,bottom=16,right=16]`
    - node size is `w = clamp(140, 56 + 7.4 × label length, 260)`, `h = 60` (72 when a note is present)
  - `ArchLayout = { width; height; nodes: Record<id, Box>; groups: Record<id, Box>; edges: Record<edgeKey, { points: [number, number][]; label?: [number, number] }> }`, where `Box = {x, y, w, h}` uses absolute coordinates and `edgeKey = "<from>-><to>#<index in c.edges>"`.
  - `Architecture` (SVG inside a responsive viewBox):
    - **Groups:** rounded dashed boundaries with a label.
    - **Nodes:** cards (14px radius, surface fill, hair outline, shadow) with a lucide icon by kind and the label and note in ink tokens.
    - **Edges:** orthogonal paths with rounded corners and an arrowhead. `dashed`/`dotted` styles apply. `flow: true` animates a dash pattern along the path (≈1.2 s loop, off under reduced motion). The edge label sits in a small pill.
    - **Motion:** nodes are `motion.g` keyed by id with `animate={{x, y}}` (SPRING), so a patch moves existing nodes to their new layout. New nodes scale 0.9→1 and fade in, in reading order (by layout x then y). Removed nodes fade. Edges draw with `pathLength` 0→1.
    - **Hover:** hovering a node dims unrelated nodes and edges to 25%.
    - It is self-reporting after the layout resolves; a layout error is reported as `architecture: <message>`.
- [ ] **Step 1: Write failing tests**:
  - `layoutArchitecture gives every node, group and edge a geometry` (node: 5 nodes, 1 group, 5 edges). Every node box sits inside its group's box, every edge has at least 2 points, and `direction: "down"` puts the source above the target.
  - `layout is deterministic` (same input → same output).
  - e2e:
    - `architecture renders with icons and labels`.
    - `patch keeps unchanged nodes and moves them`: tag node DOM, add a node and edge, then the tag survives and the new node is present.
    - `reduced motion disables flow animation` (computed `animation-name` is `none` on the flow paths).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(renderer): architecture diagrams`.

---

### Task 9: Graph

**Files:**
- Create: `packages/renderer/src/engines/graph.ts`, `components/Graph.tsx`
- Test: `packages/renderer/test/graphData.test.ts`, `packages/renderer/e2e/graph.spec.ts`

**Interfaces:**
- Produces:
  - `graphData(c: Graph, results): { nodes: {id; label; group?; size?}[]; edges: {source; target; weight?}[] }`. It works from authored data or query rows. Nodes referenced only by edges are added with `label = id`. Duplicate edges are kept (weights summed).
  - `GraphEngine = { mount(el, data, opts: { layout; theme; reduced }): { update(data): void; destroy(): void } }`, exported as `cytoscapeEngine`:
    - layout `cose` (animated when there are ≤ 300 nodes and motion isn't reduced, otherwise not animated); `circle` and `grid` are also supported
    - node colour by group in categorical order (Other after 8 groups)
    - size scaled from `size` (8–28px)
    - edge width from weight (1–4px)
    - wheel zoom and pan; hover highlights the neighbourhood
    - `update` adds and removes elements without resetting unchanged node positions
  - `Graph`: about 420px tall, with a legend when there are ≥ 2 groups. It is self-reporting after the first layout stops.
- [ ] **Step 1: Write failing tests**: `graphData from query rows` (`source,target,weight` rows plus a nodes query with groups); `edge-only nodes are added`; `duplicate edges sum weight`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** unit + e2e:
  - `graph of 1000 nodes renders within 5 s and reports ok` (inline dataset).
  - `update keeps existing positions` (read a node's position via the canvas data attribute exposed by the component for tests, `data-positions` JSON, before and after a patch adding one edge: unchanged nodes are within 1px).
  → PASS.
- [ ] **Step 5: Commit** `feat(renderer): network graphs`.

---

### Task 10: Map

**Files:**
- Create: `packages/renderer/src/engines/map.ts`, `components/MapView.tsx`, `packages/renderer/src/countries.ts`
- Test: `packages/renderer/test/countries.test.ts`, `packages/renderer/e2e/map.spec.ts`

**Interfaces:**
- Produces:
  - `countryFeatures(): GeoJSON.FeatureCollection`, from `world-atlas/countries-110m.json` via `topojson-client` `feature`, imported as a bundled asset (lazy). Each feature keeps its `id` (numeric ISO string) and `name`.
  - `countryKey(key: string): string | undefined`. It maps ISO alpha-3 (via `i18n-iso-countries` `alpha3ToNumeric`), alpha-2 or a numeric id to the numeric id, and falls back to a case-insensitive name match.
  - `MapEngine = { mount(el, spec: MapSpec, opts: { theme; reduced }): { update(spec): void; destroy(): void } }`, exported as `maplibreEngine`:
    - The style is built in code, never fetched: a background in the surface colour, plus country fill and outline from the bundled features in hair/muted tokens.
    - When `tiles === "osm"` (the default), a raster source `https://tile.openstreetmap.org/{z}/{x}/{y}.png` is added under the country lines at opacity 0.85, with the attribution "© OpenStreetMap contributors".
    - Tile failures are ignored; the bundled layers stay.
    - Points are circles (size from `size` column, 4–18px, first categorical colour, 2px surface ring) with a label on hover.
    - Routes are 2px lines.
    - The choropleth is a sequential single-hue ramp (5 steps from the palette's sequential hue) with a legend.
    - It fits bounds to the data unless `center`/`zoom` are given, and uses `flyTo` (SPRING-like duration 600 ms, instant under reduced motion) on update.
  - `MapView`: 420px tall, self-reporting on the map `load` event.
- [ ] **Step 1: Write failing tests**: `countryKey` (`"USA"` → `"840"`, `"de"` → `"276"`, `"France"` → `"250"`, `"Atlantis"` → undefined); `countryFeatures` has more than 170 features with names.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** unit + e2e:
  - `points, routes and choropleth render` (canvas visible, item reports ok, legend shows the value field).
  - **`map works offline`**: `page.route("https://tile.openstreetmap.org/**", r => r.abort())`, then the item still reports ok and a screenshot is not blank. Check by sampling canvas pixels: more than one distinct colour.
  → PASS.
- [ ] **Step 5: Commit** `feat(renderer): maps`.

---

### Task 11: Gallery and skill guidance

**Files:**
- Create: `packages/server/src/gallery.ts`, `packages/server/assets/gallery/sample.svg`
- Modify: `packages/server/src/{server,cli,skillGuide.md}`, `packages/renderer/e2e/gallery.spec.ts`
- Test: `packages/server/test/gallery.test.ts`

**Interfaces:**
- Consumes: every `ComponentDef.doc` (`example`, `fixture`)
- Produces:
  - `galleryView(): View` with id `gallery`, title "Component gallery", one grid section per registered component (title = type, the item's span 12 for wide components and 6 otherwise). Every example and its fixture's datasets/queries are merged. `media`, plus cards' `image`, have their src replaced by the absolute path of `assets/gallery/sample.svg`.
  - `POST /api/gallery` → renders it (source `caller`) and returns the `IntakeResult`; `genui gallery` calls it.
  - The skill guide gains a "Pick the right component" section:
    - analysis → kpi/chart/table plus filters
    - explaining a project → architecture for the system, diagram for flows and sequences, steps for processes, callout for decisions
    - showing work → code, media, cards
    - data on places → map; relationships → graph; history → timeline
  - It also covers how params bind (`$name`, `$name_min/$name_max`, `$name_from/$name_to`, `($region IS NULL OR region = $region)`), and media rules: absolute paths or URLs, displayed not generated.
- [ ] **Step 1: Write failing tests**:
  - `gallery covers every component and validates`: `validateView(galleryView())` gives no problems, after running fixture queries through a DataRuntime to get row counts.
  - `skill mentions params and every component`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` → PASS. Then the e2e `gallery renders every component in light and dark`:
  - `POST /api/gallery`; wait until `status.unverified` is `[]` and there are no error problems.
  - Take full-page screenshots to `docs/screenshots/gallery-light.png` and `gallery-dark.png`.
  - Open both screenshots and look at them: no overlapping labels, nothing clipped, dark mode is legible. Fix what you see before committing.
  → PASS.
- [ ] **Step 5:** Run `npm run genui -- skill` to regenerate the installed skill. **Commit** `feat: component gallery and skill guidance`.

---

### Task 12: End-to-end with a real LLM caller

**Files:**
- Modify: `README.md` (component list, filters, media, gallery)
- Create: `docs/screenshots/2b-*.png`

- [ ] **Step 1:** Restart the shared server on the new build (`npx vite build`, then `genui serve`).
- [ ] **Step 2:** In a scratch folder, run `claude -p "Using genui, explain the genui project in /Users/kush/Documents/projects/genui to a colleague: an architecture diagram of its packages and how a request flows through them, a sequence diagram of an MCP render call, the build steps, and one key code excerpt. Build it part by part." --allowedTools "mcp__genui__*,Read,Glob,Grep"`. Expected: a view with architecture, diagram, steps and code items; `status` has no errors or unverified items. Take a screenshot.
- [ ] **Step 3:** Run `claude -p "Using genui, analyse <scratch>/projects.csv with a language filter, KPIs with sparklines over last_modified, and a timeline of last activity" --allowedTools "mcp__genui__*"`. Then change the filter on screen and confirm the panels update. Take a screenshot.
- [ ] **Step 4:** Full suite: `npx vitest run` and `npx playwright test` green.
- [ ] **Step 5: Commit** `docs: plan 2b components usage and screenshots`.

---

## Self-review notes

- **Spec coverage:**
  - §5.1 catalog rows diagram/architecture/graph/map/timeline/cards/media/code/callout/steps (T1, T5–T10)
  - kpi sparkline (T1, T4)
  - filters/params (T2–T4)
  - §5 adapters (`engines/*`, T4–T10)
  - §6 diagram motion (T7, T8)
  - §8 media tokens (T3)
  - §10 media/sandboxed SVG (T3)
  - §12 gallery light/dark and broken-Mermaid problem (T7, T11)
  - §9 skill (T11)
  - The `tabs within a grid item` container is not needed: sections already provide tabs. `design`/`custom` are Plan 2c.
- **Types:**
  - `Param`, `paramVars`, `validateParamValue` and `sqlVars` are defined in T2 and consumed by T3/T4.
  - `MediaRegistry` (T3) is consumed by the intake.
  - `RenderCtx.media`/`theme` (T4) are consumed by T5–T10.
  - `ArchLayout` (T8), `graphData` (T9) and `countryKey` (T10) are local to their tasks.
