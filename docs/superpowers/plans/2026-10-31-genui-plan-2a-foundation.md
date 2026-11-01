# genui Plan 2a — Canvas Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any LLM can build and refine a genui view through MCP tools, HTTP or a streamed file: a full view or patches by id, versioned, validated with problems reported back, drawn on a screen with natural spring motion, where the person can pick any version as current.

**Architecture:** The spec package gains a v2 *view document* (sections → items), pure patch ops and a component registry of schemas and docs (no React). The server gains an op intake that validates, versions (ViewStore on disk), runs data through a per-view DuckDB runtime (DataRuntime) and broadcasts view/patch events. Three front doors feed that intake: HTTP, a stdio MCP shim (`genui mcp`) and an NDJSON file watcher. The renderer becomes a v2 store, a renderer-side registry of React components and a Motion-based layout system. Plan 1's composer stays as a fallback; an adapter turns its events into view ops.

**Tech Stack:** existing (Node 24, TS, npm workspaces, Zod 4, DuckDB, ws, React 18 + Vite, Vitest, Playwright) + `@modelcontextprotocol/sdk` (1.32.x), `motion` (12.x, `motion/react`).

**Spec:** `docs/specs/2026-10-31-genui-canvas-design.md` (Plan 1 design: `docs/specs/2026-10-31-genui-design.md`)

**Scope:** design §4 (all), §5 registry + migrated `kpi`/`chart`/`table`/`text` + new `json`, §6 motion, §9 skill, §10 security for new surfaces, §11, §13a, D11 version picking (not side-by-side variants). **Plan 2b:** `diagram`, `architecture`, `graph`, `map`, `timeline`, `cards`, `media` (+ media tokens), `code`, `callout`, `steps`, filters/params, KPI sparklines. **Plan 2c:** `design`/`custom` sandbox, alternatives/variants side by side, viewport switcher.

## Global Constraints

- The calling LLM composes; genui validates, renders, animates and reports problems (D1).
- Edits are patches by stable id, applied atomically: all ops validate or none apply (§4.2).
- Each accepted change creates a new version; history is linear; picking an older version on screen creates a new version copying it (D11).
- Picking on screen makes that version current; a patch made against an older base applies on top of current and its result says `rebased: true` (D11).
- No-typed-numbers applies only to data-bound components (`dataBound()` returns query ids): their values come from queries, their labels follow the Plan 1 digit rule. Authored content is free (§4.4).
- Invalid items never break the view; they render as an inline "couldn't render: reason" card (§4.4).
- No screen connected: open one; items not confirmed by a screen are reported `unverified`, never fine; `render`/`patch` wait ≤ 1500 ms for the first screen report when a screen is connected (§4.4).
- Views persist as plain JSON under `~/.genui/views/<id>/`; inline data saved as NDJSON beside them; retention: last 200 views or 30 days, whichever keeps more (§4.2).
- DataRuntime is per view: DuckDB opened on demand, closed after 10 idle minutes (§4.2).
- File streaming watches only registered `<dir>/.genui/views/` folders; problems written to `<name>.problems.json` (§4.3, §10).
- Motion: springs, 150–450 ms, interruptible, reduced-motion → fades (§6).
- Engines and components are swappable: no component imports another's internals (D5).
- Plan 1 inputs keep working: `POST /api/render {data, intent}`, CLI `render`, MCP `compose` (§13a).
- Plan 1 security stays: local Origin/Host checks, JSON content-type, SQL sandbox; screen→server WS messages pass the same origin check.

## Review Focus

1. **Patch against a missing id** (`update`/`remove`/`move` of an unknown item or section): the whole patch is rejected with a problem naming the id; the view is unchanged. → Task 2 test `rejects ops on unknown ids atomically`.
2. **Concurrent writers** (a file stream and an MCP caller patch the same view at once, or the screen picks mid-patch): versions stay strictly increasing, no lost update. → Task 4 test `serializes concurrent patches`.
3. **Malformed NDJSON line** (truncated JSON, unknown op): reported in `problems.json`, later valid lines still apply. → Task 8 test `bad line reported, later lines applied`.
4. **Screen reconnects or misses events** (laptop sleeps): the client detects the version gap and resyncs to the current snapshot. → Task 11 test `version gap triggers sync`.
5. **Duplicate ids** across sections or a patch adding an existing id: rejected with a problem, never two items with one id (animation identity breaks). → Task 2 test `rejects duplicate ids`.

---

## File Structure

```
packages/spec/src/
  view.ts            ViewSchema v2, SectionSchema, ViewItemSchema, fromPlan1()
  ops.ts             PatchOpSchema, applyOps()
  registry.ts        ComponentDef, registerComponent(), getComponent(), allComponents()
  components/        one file per component def: kpi.ts chart.ts table.ts text.ts json.ts; index.ts registers all
  problems.ts        Problem type
  events.ts          + ViewEvent union (v2), ScreenMessage union
packages/engine/src/
  validateView.ts    validateView(): registry + data rules (reuses validate.ts helpers)
packages/server/src/
  viewStore.ts       ViewStore: versions, persistence, pick, revert, retention
  dataRuntime.ts     DataRuntime: per-view DuckDB, idle close
  intake.ts          Intake: render/patch orchestration, status, screen reports
  composeAdapter.ts  Plan 1 compose events → view ops
  watcher.ts         NDJSON file streaming
  mcp.ts             `genui mcp` stdio shim
  skill.ts           SKILL.md generator
  server.ts          + v2 HTTP routes and WS protocol
  cli.ts             + mcp, watch, skill commands
packages/renderer/src/
  store.ts           v2 view store (replaces Plan 1 store)
  registry.tsx       type → React component; fallback card
  components/        Kpi Chart Table Text Json + Section, Tabs, ItemFrame, VersionStrip
  motion.ts          spring presets, MotionConfig wrapper
  App.tsx            v2 wiring, screen reports, picking
```

---

### Task 1: View document v2 and the component registry (spec side)

**Files:**
- Create: `packages/spec/src/{view,registry,problems}.ts`, `packages/spec/src/components/{kpi,chart,table,text,json,index}.ts`
- Modify: `packages/spec/src/index.ts`, `packages/spec/src/spec.ts` (component schemas move to `components/`, re-exported so Plan 1 imports keep working)
- Test: `packages/spec/test/view.test.ts`, `packages/spec/test/registry.test.ts`

**Interfaces:**
- Produces:
  - `ViewItem = { id: Id; span?: 1..12; title?: string; c: { type: string } & Record<string, unknown> }`
  - `Section = { id: Id; title?: string; layout: "grid" | "tabs"; items: ViewItem[] }`
  - `View = { v: 2; id: Id; title: string; summary?: string; datasets?: Record<Id, DataInputJson>; queries?: Record<Id, Query>; sections: Section[] }` where `DataInputJson = string | {path: string; format?: string} | {inline: unknown[]}`
  - `ViewSchema` (structure only; `c` is passthrough — components are checked by the registry)
  - `fromPlan1(spec: Spec, id: string): View` — one grid section `"main"`, items keep ids/spans, queries carried over
  - `ComponentDef<C> = { type: string; schema: ZodType<C>; doc: { summary: string; example: C; guidance: string }; dataBound?: (c: C) => string[]; placeholders?: (c: C) => string[] /* prose fields */ }`
  - `registerComponent(def)`, `getComponent(type): ComponentDef | undefined`, `allComponents(): ComponentDef[]` — registering a duplicate type throws
  - `Problem = { itemId?: string; severity: "error" | "warning" | "unverified"; message: string; hint?: string }`
  - Registered: `kpi`, `chart`, `table`, `text` (schemas as Plan 1; `text.md` / `text.doc`), `json` `{type:"json", value?: unknown, query?: Id}` (dataBound when `query`)

- [ ] **Step 1: Write failing tests**
  - `fromPlan1 converts a plan 1 spec` (fakeSalesDoc assembled → one section `main`, items equal, queries equal, `v: 2`).
  - `ViewSchema accepts unknown component types structurally` (`c: {type:"diagram", source:"…"}` passes `ViewSchema`).
  - `registry has the migrated components and json` (`allComponents().map(d=>d.type)` ⊇ `["kpi","chart","table","text","json"]`).
  - `registering a duplicate type throws`.
  - `dataBound reports queries` (kpi with delta → `["q","q2"]`; text md → `[]`; json with query → `["q"]`).
  - `every component's doc example validates against its own schema`.
- [ ] **Step 2: Run** `npx vitest run packages/spec` → new tests FAIL.
- [ ] **Step 3: Implement.** `components/index.ts` registers all defs on import; `index.ts` imports it so the registry is always populated.
- [ ] **Step 4: Run** `npx vitest run` → all PASS (Plan 1 suite included).
- [ ] **Step 5: Commit** `feat(spec): view document v2 and component registry`.

---

### Task 2: Patch ops

**Files:**
- Create: `packages/spec/src/ops.ts`
- Test: `packages/spec/test/ops.test.ts`

**Interfaces:**
- Consumes: `View`, `Section`, `ViewItem`
- Produces:
  - `PatchOp` (Zod discriminated on `op`):
    `{op:"set", title?, summary?}` · `{op:"addSection", section, after?}` · `{op:"removeSection", id}` · `{op:"moveSection", id, after?: string | null}` · `{op:"add", section, item, after?}` · `{op:"update", id, item: Partial<ViewItem> /* deep-merged; c merged deeply */}` · `{op:"replace", id, item: ViewItem}` · `{op:"remove", id}` · `{op:"move", id, section, after?: string | null}` · `{op:"addQuery", id, sql}` · `{op:"addDataset", name, input}`
  - `applyOps(view: View, ops: PatchOp[]): { ok: true; view: View; changed: string[] /* item/section ids touched */ } | { ok: false; problem: Problem }` — pure; input not mutated; `after: null` = first position; absent `after` = append.
  - `allIds(view): string[]` (sections + items)

- [ ] **Step 1: Write failing tests** — one per op (`set changes title`, `add appends and after inserts`, `update deep-merges c`, `replace swaps component`, `remove`, `move across sections`, `moveSection`, `addQuery`, `addDataset`), plus:
  - `rejects ops on unknown ids atomically`: `[add ok, update "nope"]` → `ok:false`, `problem.message` contains `"nope"`, original view deep-equals input.
  - `rejects duplicate ids`: `add` with an id already used by any section or item → `ok:false`.
  - `changed lists touched ids`.
  - `input view is not mutated` (deep-freeze input).
- [ ] **Step 2: Run** `npx vitest run packages/spec/test/ops.test.ts` → FAIL.
- [ ] **Step 3: Implement** on a `structuredClone`; deep merge = plain-object recursive merge, arrays replaced.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(spec): atomic patch ops`.

---

### Task 3: View validation

**Files:**
- Create: `packages/engine/src/validateView.ts`
- Modify: `packages/engine/src/validate.ts` (export `fixFormat`, `checkProse`, `normalizeProse`, `sanitizeVegaLite` for reuse; no behavior change)
- Test: `packages/engine/test/validateView.test.ts`

**Interfaces:**
- Consumes: registry (`getComponent`), `Problem`, Plan 1 helpers
- Produces: `validateView(view: View, ctx: { queryRows: Map<string, number>; querySql: Map<string, string>; intent?: string }): { view: View /* normalized */; problems: Problem[]; invalid: Set<string> /* item ids */ }`
  - unknown `c.type` → error problem, item id in `invalid`
  - schema failure → error with the first Zod issue path + message, in `invalid`
  - data-bound items: referenced queries must exist; Plan 1 single-row rule for kpi/placeholder refs; Plan 1 digit rule on their labels/titles; chart Vega-Lite sanitized; kpi/placeholder formats fixed (`fixFormat`)
  - authored items (no data binding): no digit rule
  - text prose with placeholders: refs must exist and be single-row; prose otherwise free

- [ ] **Step 1: Write failing tests**: `unknown type is an error but others survive`, `schema error names the path`, `kpi on multi-row query is invalid`, `authored text may contain numbers` (`"3 replicas"` ok with no datasets), `data-bound kpi label with digits is invalid`, `currency on megabytes is corrected`, `chart inline data stripped`, `placeholder to missing query is invalid`.
- [ ] **Step 2: Run** `npx vitest run packages/engine/test/validateView.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat(engine): view validation with data-bound vs authored rules`.

---

### Task 4: ViewStore

**Files:**
- Create: `packages/server/src/viewStore.ts`
- Test: `packages/server/test/viewStore.test.ts`

**Interfaces:**
- Consumes: `View`, `PatchOp`, `applyOps`
- Produces:
  - `type VersionEntry = { version: number; at: string; source: "caller" | "file" | "screen" | "compose"; note?: string; view: View }`
  - `class ViewStore { constructor(dir: string /* default ~/.genui/views */, opts?: { keep?: number /* 200 */; maxAgeDays?: number /* 30 */ }) }`
    - `render(view, source): Promise<VersionEntry>` — new view or full replace (new version)
    - `patch(viewId, ops, source, baseVersion?): Promise<{ entry: VersionEntry; changed: string[]; rebased: boolean } | { problem: Problem }>`
    - `pick(viewId, version): Promise<VersionEntry>` — copies that version as a new current version, `source:"screen"`, `note:"picked v<N>"`
    - `revertItem(viewId, itemId, version): Promise<VersionEntry | { problem }>` — restores one item from an older version
    - `current(viewId): VersionEntry | undefined`, `history(viewId): {version, at, source, note}[]`, `list(): {id, title, version, at}[]`
    - `load(): Promise<void>` — reads disk; `prune(): Promise<void>` — retention
  - Disk: `<dir>/<id>/v<N>.json` (VersionEntry) — one file per version; current = highest N.
  - All mutations for one view run through a per-view promise queue.

- [ ] **Step 1: Write failing tests** (temp dir): `render creates v1 on disk`, `patch increments version`, `rebased when base is older than current`, `pick copies an old version as new current` (v1→v2→pick 1 → v3 equals v1's view, note `picked v1`), `revertItem restores one item only`, `survives restart` (new store on same dir → `current` equal), `prune keeps 200 newest or 30 days` (use small `keep:2, maxAgeDays:0.0001` with fake timestamps), `serializes concurrent patches` (20 parallel patches → versions 2..21, all ops present).
- [ ] **Step 2: Run** `npx vitest run packages/server/test/viewStore.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): versioned view store`.

---

### Task 5: DataRuntime

**Files:**
- Create: `packages/server/src/dataRuntime.ts`
- Test: `packages/server/test/dataRuntime.test.ts`

**Interfaces:**
- Consumes: engine `openDb`, `ingest`, `profileDatasets`, `runQuery`, `explainQuery`, `referencesData`
- Produces:
  - `class DataRuntime { constructor(opts?: { idleMs?: number /* 600_000 */; inlineDir: string }) }`
    - `ensure(view: View): Promise<{ problems: Problem[] }>` — opens/refreshes the view's DB when its `datasets` differ from what's loaded; inline datasets are written to `<inlineDir>/<viewId>/<name>.ndjson` and loaded from there; a missing path → problem, other datasets still load
    - `run(viewId, queryId, sql): Promise<QueryResult | { problem }>` — guard + `referencesData` + run; serialized per view
    - `profile(input: DataInput | Record<string, DataInput>): Promise<Profile>` — throwaway DB (for the `profile` tool)
    - `close(viewId)`, `closeAll()`; idle timer closes a DB after `idleMs` without use; next `run` reopens transparently

- [ ] **Step 1: Write failing tests**: `runs queries against view datasets`, `inline data persisted and reloaded after close`, `idle close then transparent reopen` (`idleMs: 50`), `missing dataset path is a problem not a crash`, `constant query rejected`, `profile without a view`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): per-view data runtime`.

---

### Task 6: Intake, v2 events and the compose adapter

**Files:**
- Create: `packages/server/src/intake.ts`, `packages/server/src/composeAdapter.ts`
- Modify: `packages/spec/src/events.ts`
- Test: `packages/server/test/intake.test.ts`, `packages/server/test/composeAdapter.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5
- Produces:
  - `ViewEvent` (server → screen):
    `{t:"view", viewId, version, view, source}` · `{t:"patch", viewId, version, baseVersion, ops, changed, source}` · `{t:"result", viewId, queryId, result}` · `{t:"problems", viewId, version, problems}` · `{t:"activity", viewId, text}` (status pill, e.g. "Composing with claude:sonnet…") · `{t:"list", views: {id,title,version,at}[]}`
  - `ScreenMessage` (screen → server): `{t:"rendered", viewId, version, ok: string[], failed: {itemId, message}[]}` · `{t:"pick", viewId, version}` · `{t:"sync", viewId}` · `{t:"revertItem", viewId, itemId, version}`
  - `type IntakeResult = { viewId: string; version: number; url: string; rebased?: boolean; problems: Problem[] }`
  - `class Intake { constructor(deps: { store: ViewStore; data: DataRuntime; emit(e: ViewEvent): void; baseUrl(): string; screens(): number; openScreen(url: string): void; waitMs?: number /* 1500 */ }) }`
    - `render(view: View | Spec /* plan 1 accepted, converted */, source): Promise<IntakeResult>`
    - `patch(viewId, ops, source, baseVersion?): Promise<IntakeResult>`
    - `screenMessage(msg: ScreenMessage): Promise<void>`
    - `status(viewId): { version; problems: Problem[]; unverified: string[] }`
  - Flow for render/patch: apply (patch) → `data.ensure` → run new/changed queries → `validateView` (with row counts) → store → emit `view`/`patch` + `result`s + `problems`. Invalid items are kept in the view (rendered as fallback cards) and reported. If `screens() === 0` → `openScreen(url)`. Then wait up to `waitMs` for a `rendered` report for that version; items without a report → `unverified` problems.
  - `adaptCompose(e: RenderEvent): { kind: "render"; view: View } | { kind: "patch"; ops: PatchOp[] } | { kind: "data"; event: ViewEvent } | { kind: "activity"; text: string } | null` — `default` → render (section `main`), composed `item` → `add`/`replace`, first composed item → `remove` all `d_` items in the same patch, `meta` → `set`, `result` → data event, `error` → problem.

- [ ] **Step 1: Write failing tests** (fake emit, temp store, fake screens):
  - `render emits view, results and problems`
  - `invalid item stays as fallback and is reported`
  - `patch emits ops with changed ids`
  - `no screen opens one and reports unverified`
  - `screen report within wait clears unverified` (call `screenMessage({t:"rendered", ok:[…]})` during the wait → result has no unverified)
  - `pick from screen becomes current and next patch is rebased`
  - `plan 1 spec accepted by render`
  - compose adapter: `default view then composed items replace d_ items`, `meta becomes set op`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat(server): op intake, view events, compose adapter`.

---

### Task 7: HTTP API and the WebSocket protocol

**Files:**
- Modify: `packages/server/src/server.ts`
- Test: `packages/server/test/api.test.ts`

**Interfaces:**
- Consumes: `Intake`, `ViewStore`, `DataRuntime`, compose (Plan 1) via `adaptCompose`
- Produces (all JSON, all behind Plan 1's Origin/Host/content-type checks):
  - `POST /api/views` `{view}` → `IntakeResult` · `POST /api/views/:id/patch` `{ops, baseVersion?}` → `IntakeResult`
  - `GET /api/views/:id` → current `VersionEntry` · `GET /api/views/:id/status` · `GET /api/views/:id/history` · `GET /api/views` (list)
  - `POST /api/views/:id/pick` `{version}` · `POST /api/views/:id/revert` `{itemId, version}`
  - `POST /api/profile` `{data}` → `Profile`
  - `POST /api/watch` `{dir}` → `{watching: string[]}` (Task 8 implements the watcher; this route calls it)
  - `POST /api/render` `{data, intent}` (Plan 1) → runs compose, events adapted into a view; response `{renderId: viewId, url}` unchanged
  - WS `/ws`: on connect send `list` + each recent view's `view` event (last 20 by recency); accept `ScreenMessage`s → `intake.screenMessage`; `sync` → resend that view's `view` event
  - Screen URL: `<base>/#<viewId>`

- [ ] **Step 1: Write failing tests**: `render then patch over HTTP`, `status reports problems`, `history and pick`, `profile endpoint`, `ws gets list and views on connect`, `ws pick message changes current`, `plan 1 render endpoint still works` (fake provider; ws receives `view` then `patch` events), `foreign origin rejected on new routes`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Plan 1's renderer-facing `RenderEvent` broadcast is removed; the existing Plan 1 server tests are updated to the v2 events (ledger the change).
- [ ] **Step 4: Run** `npx vitest run` → all PASS.
- [ ] **Step 5: Commit** `feat(server): v2 http api and screen protocol`.

---

### Task 8: File streaming

**Files:**
- Create: `packages/server/src/watcher.ts`
- Test: `packages/server/test/watcher.test.ts`

**Interfaces:**
- Consumes: `Intake`
- Produces:
  - `class ViewFileWatcher { constructor(intake: Intake, opts?: { pollMs?: number /* 250 */ }) }`
    - `watch(dir: string): void` — watches `<dir>/.genui/views/*.ndjson` (creates the folder); idempotent
    - `dirs(): string[]`, `close()`
  - Line format (one JSON value per line): a `View` (`v:2`) or a Plan 1 `Spec` (`v:1`) → render; `{ "ops": PatchOp[], "baseVersion"?: number }` → patch. View id = `view.id`, else the file's basename.
  - Reads only appended bytes (per-file offset), waits for a trailing newline; a file truncated or replaced restarts from 0 and re-renders.
  - After each line, writes `<name>.problems.json` = `{ viewId, version, problems }` (problems include line numbers for parse errors).

- [ ] **Step 1: Write failing tests** (temp dir): `first line renders a view`, `appended patch line applies`, `partial line waits for newline`, `bad line reported, later lines applied` (line 2 is `{"ops":[` → problems.json lists line 2; line 3 applies), `plan 1 spec line accepted`, `watch is idempotent`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `fs.watch` on the folder plus a `pollMs` stat poll (fs.watch is unreliable for appends on some platforms).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): ndjson file streaming`.

---

### Task 9: MCP shim

**Files:**
- Create: `packages/server/src/mcp.ts`
- Modify: `packages/server/src/cli.ts` (commands `mcp`, `watch <dir>`)
- Test: `packages/server/test/mcp.test.ts`

**Interfaces:**
- Consumes: HTTP API (Task 7)
- Produces:
  - `createGenuiMcpServer(opts: { baseUrl: string; fetch?: typeof fetch; cwd: string }): McpServer` with tools (input schemas from the spec package's Zod schemas):
    `render {view}` · `patch {viewId, ops, baseVersion?}` · `status {viewId}` · `profile {data}` · `version {viewId, action: "history" | "pick" | "revertItem", version?, itemId?}` · `compose {data, intent?}` (Plan 1 fallback)
    Each returns the HTTP JSON as text content; HTTP errors become `isError` results with the message.
  - `genui mcp`: ensure the shared server is up (`GET /api/health`; else spawn `genui serve` detached and poll health ≤ 10 s), `POST /api/watch {dir: cwd}`, then serve MCP over stdio.
  - `genui watch <dir>` → `POST /api/watch`.

- [ ] **Step 1: Write failing tests** using the SDK's in-memory transport pair and a fake fetch: `lists the six tools`, `render tool posts the view and returns the result`, `http error becomes an error result`, `registers cwd for watching on start` (fake fetch saw `POST /api/watch` with cwd).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `@modelcontextprotocol/sdk` (`McpServer`, `StdioServerTransport`).
- [ ] **Step 4: Run** → PASS. Manual check: `claude mcp add genui -- npx tsx /Users/kush/Documents/projects/genui/packages/server/src/cli.ts mcp` then `claude mcp list` shows `genui` connected.
- [ ] **Step 5: Commit** `feat(server): mcp shim with auto-start and folder registration`.

---

### Task 10: Generated skill

**Files:**
- Create: `packages/server/src/skill.ts`, `packages/server/src/skillGuide.md` (static sections)
- Modify: `packages/server/src/cli.ts` (command `skill [--out <path>]`, default `~/.claude/skills/genui/SKILL.md`)
- Test: `packages/server/test/skill.test.ts`

**Interfaces:**
- Consumes: `allComponents()`
- Produces: `generateSkill(): string` — frontmatter (`name: genui`, description covering: show analyses, diagrams, designs, any visual; build up and refine views), then guide sections: when to use; the two delivery paradigms (MCP tools; file streaming with exact path and line format); view document and patch ops with examples; build-up pattern (render frame, then one patch per component); reading problems and fixing them; data rules (profile first, queries, placeholders, single-row); then **one subsection per registered component** from `doc` (summary, guidance, example as JSON).

- [ ] **Step 1: Write failing tests**: `skill has frontmatter and every component section` (each `allComponents()` type appears as a heading and its example JSON parses), `skill documents both delivery paradigms` (contains `.genui/views/` and `patch`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS. Then `npm run genui -- skill` writes the installed skill (replaces the Plan 1 bridge skill).
- [ ] **Step 5: Commit** `feat: skill generated from the component registry`.

---

### Task 11: Renderer v2 — store, registry, sections, reports, version picking

**Files:**
- Modify: `packages/renderer/src/{store.ts,App.tsx,ws.ts,styles.css}`, `packages/renderer/src/components/{Grid.tsx→Section.tsx,Kpi.tsx,Chart.tsx,Table.tsx,Text.tsx}`
- Create: `packages/renderer/src/registry.tsx`, `packages/renderer/src/components/{Json,Tabs,ItemFrame,FallbackCard,VersionStrip}.tsx`
- Test: `packages/renderer/test/store.test.ts` (rewritten), `packages/renderer/e2e/smoke.spec.ts` (updated)

**Interfaces:**
- Consumes: `ViewEvent`, `ScreenMessage`, `applyOps`, `View`
- Produces:
  - `type ViewState = { view: View; version: number; results: Record<string, QueryResult>; problems: Problem[]; changed: Record<string, number> /* id → version it last changed */; activity?: string; source: string }`
  - `reduce(state: { views: Record<string, ViewState>; list: ListEntry[] }, e: ViewEvent): { state; need?: ScreenMessage /* e.g. sync on version gap */ }` — `patch` applies via `applyOps` only when `baseVersion` matches the client's version, else returns `need: {t:"sync", viewId}`
  - `rendererFor(type: string): React.FC<{ c; ctx: RenderCtx }> | undefined`; `RenderCtx = { results; mode; report(ok: boolean, message?: string): void; motion: MotionApi }`
  - Each `ItemFrame` reports once per (item id, version) via `report`; App batches reports per view version into one `rendered` ScreenMessage (debounced 100 ms).
  - Sections: `grid` uses Plan 1's `packRows`; `tabs` shows item titles as tabs.
  - Unknown type or a component that throws (error boundary) → `FallbackCard` "Couldn't render: <reason>" and a failed report.
  - `VersionStrip`: current version, dropdown/history list (from `GET /api/views/:id/history`), clicking a past version previews it read-only; "Use this version" sends `{t:"pick"}`.
  - Sidebar lists views from `list` events (most recent first).

- [ ] **Step 1: Write failing store tests**: `view event sets state`, `patch applies in order`, `version gap triggers sync` (patch with `baseVersion` 3 while client at 1 → `need.t === "sync"`), `results keyed per view`, `changed tracks touched ids`.
- [ ] **Step 2: Run** `npx vitest run packages/renderer` → FAIL.
- [ ] **Step 3: Implement** store, registry, components, App wiring.
- [ ] **Step 4: Run** → PASS. Update Playwright smoke: POST a v2 view (kpi + chart + text + json, one tabs section) then a patch adding an item; expect the new item visible, the json tree visible, a `rendered` report reaching the server (`GET /status` has no `unverified`), and "Use this version" on v1 making `GET /api/views/:id` return version 3. Run `npx playwright test` → PASS.
- [ ] **Step 5: Commit** `feat(renderer): v2 views, registry, sections, reports, version picking`.

---

### Task 12: Motion system

**Files:**
- Create: `packages/renderer/src/motion.ts`
- Modify: `packages/renderer/src/components/{Section,Tabs,ItemFrame}.tsx`, `packages/renderer/src/styles.css` (remove Plan 1 CSS `rise`/View Transition rules; keep skeleton shimmer)
- Test: `packages/renderer/test/motion.test.ts`, `packages/renderer/e2e/motion.spec.ts`

**Interfaces:**
- Produces:
  - `SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 }` (snappy), `SPRING_SOFT = { type: "spring", stiffness: 220, damping: 28 }` (enter); durations implied 150–450 ms
  - `MotionRoot` wraps the app in `<MotionConfig reducedMotion="user" transition={SPRING}>`
  - Behaviours: items are `motion.section` with `layout` + `layoutId={viewId:itemId}` inside `AnimatePresence`; enter = opacity 0→1, y 12→0, scale .985→1, staggered by arrival (40 ms); exit = fade + scale .98; `replace` (component type changed) = keyed crossfade inside a size-morphing frame; `changed[id] === version` → accent ring glow fading over 1.2 s; tabs use a shared `layoutId` underline.
  - `MotionApi` in `ctx.motion`: `{ spring: typeof SPRING; reduced: boolean }` for components that animate internally (count-up already respects reduced motion).
  - `shouldGlow(changed: Record<string,number>, id: string, version: number): boolean`

- [ ] **Step 1: Write failing tests**: unit `shouldGlow only for the current version`; e2e `patch does not remount unchanged items` (tag an unchanged item's DOM node with a property before the patch; after the patch the same node still has it), `reduced motion renders without transforms` (context with `reducedMotion: "reduce"`; computed `transform` on entered items is `none` after mount).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Install `motion`.
- [ ] **Step 4: Run** unit + `npx playwright test` → PASS.
- [ ] **Step 5: Commit** `feat(renderer): spring motion system`.

---

### Task 13: End-to-end with a real LLM caller

**Files:**
- Modify: `README.md` (v2 usage: MCP setup, file streaming, HTTP, skill install)
- Create: `docs/screenshots/canvas-*.png`

- [ ] **Step 1:** `npm run genui -- skill` (installs SKILL.md), `claude mcp add genui -- npx tsx /Users/kush/Documents/projects/genui/packages/server/src/cli.ts mcp`.
- [ ] **Step 2:** In a scratch folder, run `claude -p "Using genui, show an overview of <projects.csv path>: a KPI row, a size chart and a table, built up part by part, then change the chart to show deps vs source" --allowedTools "mcp__genui__*"`. Expected: a view appears and builds up, then the chart is patched in place; `status` shows no errors or unverified items. Screenshot before/after the patch.
- [ ] **Step 3:** File-streaming check: append a view line and two patch lines to `<scratch>/.genui/views/demo.ndjson` with the server watching that folder; expected: items appear in order; `demo.problems.json` exists with empty `problems`.
- [ ] **Step 4:** Full suite `npx vitest run` and `npx playwright test` green.
- [ ] **Step 5: Commit** `docs: canvas foundation usage and screenshots`.

---

## Self-review notes

- Spec coverage (2a scope): §4.1 (T1), §4.2 ops/versions/persistence (T2, T4, T5), §4.3 paradigms + server/folders (T7–T9), §4.4 static/render-time/no-screen/fallback cards (T3, T6, T11), §5 registry + json (T1, T11), §6 motion (T12), §9 skill (T10), §10 origin checks on new routes/WS, watched dirs only (T7, T8), §11 transport-independent intake (T6), §13a compatibility (T6, T7, T9), D11 picking + linear history + rebased (T4, T6, T11). Deferred to 2b/2c are listed under Scope.
- Types: `View`, `PatchOp`, `Problem`, `IntakeResult`, `ViewEvent`, `ScreenMessage` defined once (T1, T2, T6) and consumed by name later.
