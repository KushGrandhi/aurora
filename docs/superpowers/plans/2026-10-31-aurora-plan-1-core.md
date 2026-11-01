# aurora Plan 1 — Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `aurora render sales.csv --intent "revenue trends"` shows a default view in a browser tab within ~0.4 s, then streams in an LLM-composed view (KPIs, Vega-Lite charts, tables, text) built from a local Ollama model, with every number coming from DuckDB.

**Architecture:** npm-workspace TypeScript monorepo. `@aurora/spec` holds the Zod schemas and shared types. `@aurora/engine` ingests files into an in-process DuckDB, profiles them, guards and runs SQL, builds a deterministic default spec, streams a "parts" document from the LLM, validates each part, and emits render events. `@aurora/server` exposes HTTP + WebSocket and the CLI. `@aurora/renderer` is a React/Vite "screen" that draws events as they arrive.

**Tech Stack:** Node 24, TypeScript, npm workspaces, tsx (runs TS directly; no lib build step), Zod 4 (`z.toJSONSchema`), `@duckdb/node-api`, `ws`, React 18 + Vite, vega-embed, @tanstack/react-table + @tanstack/react-virtual, marked + DOMPurify, Vitest, Playwright.

**Spec:** `docs/specs/2026-10-31-aurora-design.md`

**Scope of this plan:** milestones 1–3 of spec §15 (data path + default view, LLM compose with repair, streaming + layout cache), components `kpi`, `chart`, `table`, `text`, `grid`, and an HTTP `render` endpoint + CLI. **Later plans:** Plan 2 = `map`, `graph`, `timeline`, `cards`, `json`, `tabs`/`stack`, params (§6, §11). Plan 3 = MCP server, `refine`, `save` (§10, §12). Plan 4 = Anthropic adapter, `aurora eval`, default-model choice (§8, §13). Plan 5 = `custom` sandbox (§6).

## Global Constraints

- No number shown to the user is typed by the LLM: prose uses `{queryId.field|format}` placeholders; formats `number`, `integer`, `percent`, `currency`, `date`, `compact`, `delta`.
- The LLM sees only the profile (schema, types, cardinality, min/max, nulls, 5 sample rows), never full data.
- Generated SQL may only `SELECT` from aurora-created views; `enable_external_access=false` and `lock_configuration=true` after views are created.
- Query results capped at 10,000 rows to the browser (`truncated: true` beyond).
- Wide data (>40 columns): profile compressed to names + types + cardinality, samples truncated.
- Vega-Lite `data`, `datasets`, `data.url`, numeric `datum` literals are stripped; data is injected by the renderer.
- Static prompt prefix first (instructions + catalog + examples) so Ollama reuses its KV cache; `keep_alive: "30m"`.
- Default provider Ollama at `http://127.0.0.1:11434`, default model `qwen3:8b` (installed on Kush's machine), `think: false`.
- Default port `4317`; config at `~/.aurora/config.json`, env overrides `AURORA_MODEL`, `AURORA_OLLAMA_URL`, `AURORA_PORT`.
- Free/open-source dependencies only.
- Latency targets (log, don't fail tests on them except where stated): default view < 400 ms, first LLM component < 3 s local, cache hit < 150 ms, 1M-row Parquet profile < 300 ms.

## Review Focus

1. **Messy CSVs** (empty file, header-only, mixed-type column): ingest succeeds; an empty dataset renders a "No rows" text item, not a crash. → Task 2 test `ingest handles empty and header-only CSV`, Task 5 test `default spec for empty dataset`.
2. **Awkward column names** (`Order Date`, `select`, `ünïcode`): profile, default view SQL and renderer field lookup all work (identifiers always double-quoted). → Task 4 test `profiles awkward column names`, Task 5 test `default spec quotes identifiers`.
3. **LLM failure mid-render** (Ollama not running, stream cut, invalid JSON): default view stays on screen, an `error` event is emitted, server keeps serving. → Task 9 test `compose keeps default view when provider throws`.
4. **DuckDB value types** (BIGINT, HUGEINT, DECIMAL, DATE, TIMESTAMP, LIST, STRUCT): results serialize to JSON safely (safe-int BigInt → number, otherwise string; dates → ISO strings). → Task 3 test `serializes duckdb types`.
5. **Two renders at once:** events carry `renderId`; the second render does not corrupt the first's items. → Task 10 test `concurrent renders stay isolated`.

---

## File Structure

```
package.json                     workspaces, scripts (test, dev, serve)
tsconfig.base.json
packages/spec/src/
  index.ts                       re-exports
  spec.ts                        Spec, Item, Component, Query schemas (Zod) + types
  parts.ts                       LLM wire format (title, summary, parts[]) + assemble()
  events.ts                      RenderEvent union
  placeholders.ts                parsePlaceholders(), fillPlaceholders(), formatValue()
packages/engine/src/
  index.ts
  db.ts                          openDb(), closeDb()
  ingest.ts                      ingest()
  serialize.ts                   toJsonValue()
  sql.ts                         guardSql(), runQuery(), explainQuery(), quoteIdent()
  profile.ts                     profileDatasets(), fingerprint()
  defaultSpec.ts                 defaultSpec()
  validate.ts                    validatePart(), sanitizeVegaLite()
  partsParser.ts                 createPartsParser()
  prompt.ts                      buildPrompt(), buildRepairPrompt()
  llm/types.ts                   LlmProvider
  llm/ollama.ts                  createOllamaProvider()
  cache.ts                       SpecCache
  compose.ts                     compose()
packages/engine/test/fixtures/   sales.csv, empty.csv, header_only.csv, awkward.csv, docs/a.md, nested.json
packages/server/src/
  config.ts                      loadConfig()
  server.ts                      startServer()
  cli.ts                         `aurora serve` / `aurora render`
packages/renderer/
  index.html, vite.config.ts
  src/main.tsx, App.tsx, store.ts, ws.ts
  src/components/{Grid,Kpi,Chart,Table,Text}.tsx
  src/format.ts                  re-export of @aurora/spec placeholders
  e2e/smoke.spec.ts
```

---

### Task 1: Workspace + spec package

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.gitignore`, `packages/spec/{package.json,tsconfig.json}`, `packages/spec/src/{index,spec,parts,events,placeholders}.ts`
- Test: `packages/spec/test/spec.test.ts`, `packages/spec/test/placeholders.test.ts`

**Interfaces:**
- Produces (all exported from `@aurora/spec`, package `exports` → `./src/index.ts`):
  - `QuerySchema = { sql: string }`; `Query`
  - Components (discriminated on `type`):
    - `{ type:"kpi", query, field, label, format?: Format, delta?: { query, field } }`
    - `{ type:"chart", query, vegaLite: Record<string, unknown> }`
    - `{ type:"table", query, columns?: string[] }`
    - `{ type:"text", md: string } | { type:"text", doc: { query, field } }`
  - `ItemSchema = { id: string, span: 1..12, c: Component }`
  - `SpecSchema = { v: 1, title: string, summary?: string, queries: Record<string, Query>, layout: { type:"grid", cols: 12, items: Item[] } }`
  - `Format = "number"|"integer"|"percent"|"currency"|"date"|"compact"|"delta"`
  - `PartSchema` = `{ kind:"query", id, sql } | { kind:"item", item: Item }`
  - `LlmDocSchema = { title: string, summary?: string, parts: Part[] }` and `llmDocJsonSchema(): object` (via `z.toJSONSchema`)
  - `assemble(doc: { title; summary?; parts: Part[] }): Spec`
  - `RenderEvent` union, every member has `renderId: string`:
    `{t:"start", title?}` · `{t:"default", spec: Spec}` · `{t:"meta", title, summary?}` · `{t:"item", item: Item}` · `{t:"result", queryId, result: QueryResult}` · `{t:"queryError", queryId, message}` · `{t:"error", message}` · `{t:"done", timings: Record<string, number>, cached: boolean}`
  - `QueryResult = { columns: {name:string; type:string}[], rows: Record<string, unknown>[], truncated: boolean, ms: number }`
  - `PLACEHOLDER_RE = /\{([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\|(\w+))?\}/g`
  - `parsePlaceholders(text): {queryId, field, format?}[]`
  - `fillPlaceholders(text, results: Record<string, QueryResult|undefined>): string` — uses first row; missing → `…`
  - `formatValue(v: unknown, format?: Format): string` — `Intl.NumberFormat("en-US")`; `currency` USD; `percent` multiplies by 100 (input is a ratio); `compact` notation compact; `delta` signed percent with `+`/`−`; `date` → `toLocaleDateString("en-US")`.

- [ ] **Step 1: Scaffold.** Root `package.json` with `"private": true`, `"workspaces": ["packages/*"]`, `"type":"module"`, scripts `test: vitest run`, devDeps `typescript`, `vitest`, `tsx`. `.gitignore`: `node_modules`, `dist`, `test-results`, `.aurora`. Run `npm install` → exits 0.
- [ ] **Step 2: Write failing tests.**

```ts
// spec.test.ts
test("assemble builds spec from parts in order", () => {
  const spec = assemble({ title: "T", parts: [
    { kind: "query", id: "q1", sql: "SELECT 1 AS v" },
    { kind: "item", item: { id: "k1", span: 3, c: { type: "kpi", query: "q1", field: "v", label: "V" } } },
  ]});
  expect(spec).toEqual({ v: 1, title: "T", queries: { q1: { sql: "SELECT 1 AS v" } },
    layout: { type: "grid", cols: 12, items: [{ id: "k1", span: 3, c: { type: "kpi", query: "q1", field: "v", label: "V" } }] } });
});
test("SpecSchema rejects unknown component type", () => { /* type:"pie3d" → safeParse fails */ });
test("llmDocJsonSchema is a JSON schema object with parts array", () => {
  expect(llmDocJsonSchema().properties.parts.type).toBe("array");
});
// placeholders.test.ts
test("fills placeholders from first row with formats", () => {
  const r = (rows) => ({ columns: [], rows, truncated: false, ms: 0 });
  expect(fillPlaceholders("Rev {t.v|currency}, up {g.p|percent}, {g.p|delta}",
    { t: r([{ v: 1234.5 }]), g: r([{ p: 0.12 }]) })).toBe("Rev $1,234.50, up 12%, +12%");
});
test("missing result renders ellipsis", () => expect(fillPlaceholders("{x.y}", {})).toBe("…"));
test("parsePlaceholders extracts refs", () =>
  expect(parsePlaceholders("{a.b} and {c.d|integer}")).toEqual([{ queryId:"a", field:"b" }, { queryId:"c", field:"d", format:"integer" }]));
```

- [ ] **Step 3: Run** `npx vitest run packages/spec` → FAIL (modules missing).
- [ ] **Step 4: Implement** the schemas and functions above.
- [ ] **Step 5: Run** `npx vitest run packages/spec` → PASS.
- [ ] **Step 6: Commit** `feat(spec): schemas, parts wire format, placeholders`.

---

### Task 2: DuckDB + ingest

**Files:**
- Create: `packages/engine/{package.json,tsconfig.json}`, `packages/engine/src/{db,ingest}.ts`, fixtures listed in File Structure
- Test: `packages/engine/test/ingest.test.ts`

**Interfaces:**
- Produces:
  - `type DataInput = string | { path: string; format?: InputFormat } | { inline: unknown[] }` — a string is a path or `http(s)` URL
  - `type InputFormat = "csv"|"tsv"|"json"|"ndjson"|"parquet"|"text"`
  - `openDb(): Promise<Db>` (wraps `DuckDBInstance.create(":memory:")` + connection); `Db = { conn: DuckDBConnection; close(): Promise<void> }`
  - `ingest(db: Db, input: DataInput | Record<string, DataInput>): Promise<string[]>` — returns created view names; single input → `["data"]`; map → its keys (validated `^[A-Za-z_]\w*$`). Format from extension when absent (`.md`/`.txt` → `text`). Creates **tables** (`CREATE TABLE "name" AS SELECT * FROM read_csv_auto(...)` etc.) so data no longer depends on file access. `text`: one or more files (a directory path ingests all `.md`/`.txt` in it) → table `(name VARCHAR, body VARCHAR)`. Inline → written to a temp NDJSON file then `read_json_auto`. After all inputs: `SET enable_external_access=false; SET lock_configuration=true;`.

- [ ] **Step 1: Write failing tests**: `ingests csv as data` (sales.csv → `["data"]`, `SELECT count(*)` = fixture rows), `ingests named map` (`{ orders: sales.csv, docs: "fixtures/docs" }` → `["orders","docs"]`, docs has `name`,`body`), `ingests inline json`, `ingest handles empty and header-only CSV` (no throw; header-only → 0 rows with columns), `external access disabled after ingest` (`SELECT * FROM read_csv('/etc/hosts')` rejects), `rejects bad dataset name` (`{"a b": ...}` throws).
- [ ] **Step 2: Run** `npx vitest run packages/engine/test/ingest.test.ts` → FAIL.
- [ ] **Step 3: Implement** `openDb`, `ingest`. Empty-file CSV: catch the DuckDB error and create an empty table with a single `VARCHAR` column `empty`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): duckdb ingest for files, dirs, inline`.

---

### Task 3: SQL guard, execution, serialization

**Files:**
- Create: `packages/engine/src/{sql,serialize}.ts`
- Test: `packages/engine/test/sql.test.ts`

**Interfaces:**
- Consumes: `Db`, `ingest` (Task 2); `QueryResult` (Task 1)
- Produces:
  - `quoteIdent(name: string): string` — `"` + name with `"` doubled + `"`
  - `guardSql(sql: string): { ok: true; sql: string } | { ok: false; reason: string }` — trims trailing `;`; rejects multiple statements, anything not starting with `SELECT`/`WITH`, and (case-insensitive, outside string literals) the keywords `ATTACH`, `COPY`, `INSTALL`, `LOAD`, `PRAGMA`, `SET`, `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `EXPORT`, `IMPORT`, `CALL`, and table functions `read_*`, `glob`, `parquet_scan`. DuckDB's locked config is the second line of defense.
  - `runQuery(db, sql, params?: Record<string, unknown>, limit = 10_000): Promise<QueryResult>` — guards first, wraps as `SELECT * FROM (<sql>) LIMIT limit+1` to detect truncation, binds `$name` params, serializes rows.
  - `explainQuery(db, sql): Promise<{ ok: true } | { ok: false; message: string }>` — guard + `EXPLAIN`.
  - `toJsonValue(v: unknown): unknown` — BigInt within safe range → number else string; DuckDB DECIMAL → number; DATE/TIMESTAMP → ISO string; LIST/STRUCT/MAP → arrays/objects recursively.

- [ ] **Step 1: Write failing tests**: `guard allows select and with`, `guard rejects` (table-driven: `COPY data TO 'x'`, `SELECT 1; DROP TABLE data`, `ATTACH 'x'`, `SELECT * FROM read_csv('/etc/passwd')`, `INSTALL httpfs`), `guard ignores keywords inside string literals` (`SELECT 'copy that' AS s` ok), `runQuery truncates at limit` (limit 5 on 20 rows → 5 rows, `truncated: true`), `runQuery binds params`, `serializes duckdb types` (query `SELECT 9007199254740993::HUGEINT a, 3::BIGINT b, 1.5::DECIMAL(4,2) c, DATE '2026-01-02' d, TIMESTAMP '2026-01-02 03:04:05' e, [1,2] f, {'k': 1} g` → `{a:"9007199254740993", b:3, c:1.5, d:"2026-01-02", e:"2026-01-02T03:04:05.000Z", f:[1,2], g:{k:1}}`), `explainQuery reports bad column`.
- [ ] **Step 2: Run** `npx vitest run packages/engine/test/sql.test.ts` → FAIL.
- [ ] **Step 3: Implement.** For guard scanning, strip single-quoted strings, double-quoted identifiers and `--`/`/* */` comments before keyword matching (word-boundary regex).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): sql guard, query runner, value serialization`.

---

### Task 4: Profiler + fingerprint

**Files:**
- Create: `packages/engine/src/profile.ts`
- Test: `packages/engine/test/profile.test.ts`

**Interfaces:**
- Consumes: `Db`, `runQuery`, `quoteIdent`
- Produces:
  - `type ColumnProfile = { name; type: string; distinct: number; nulls: number; min?: unknown; max?: unknown; top?: { value: unknown; count: number }[] }` (`top` = 5 most frequent, only when `distinct ≤ 50`)
  - `type DatasetProfile = { name; rowCount: number; columns: ColumnProfile[]; sample: Record<string, unknown>[]; compressed: boolean }`
  - `type Profile = { datasets: DatasetProfile[]; fingerprint: string }`
  - `profileDatasets(db, names: string[]): Promise<Profile>` — use DuckDB `SUMMARIZE` for stats (one query per dataset) + `LIMIT 5` sample; when columns > 40: `compressed: true`, drop `min/max/top`, sample values truncated to 40 chars.
  - `fingerprint(datasets: Pick<DatasetProfile,"name"|"columns">[]): string` — sha256 hex of `name:col:type,...` per dataset in order.

- [ ] **Step 1: Write failing tests**: `profiles sales csv` (rowCount, a numeric column has min/max, a low-cardinality column has `top`), `compresses wide data` (inline 60-column records → `compressed: true`, no `min`), `profiles awkward column names` (awkward.csv with `Order Date`, `select`, `ünïcode` → names preserved), `fingerprint ignores values` (same schema different rows → same hash; renamed column → different), `profiles 1M rows quickly` (generate via `CREATE TABLE big AS SELECT range i, random() x, (range%7)::VARCHAR c FROM range(1000000)` before locking — create a test-only helper that skips the lock; assert < 2000 ms and log actual ms).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): dataset profiler and schema fingerprint`.

---

### Task 5: Deterministic default spec

**Files:**
- Create: `packages/engine/src/defaultSpec.ts`
- Test: `packages/engine/test/defaultSpec.test.ts`

**Interfaces:**
- Consumes: `Profile`, `Spec`, `quoteIdent`
- Produces: `defaultSpec(profile: Profile): Spec` — pure, no DB. Item ids prefixed `d_` (so composed items can replace them). Rules per dataset, in order:
  1. Text dataset (`columns` exactly `name`,`body`): one `text` item per row up to 5 via `doc` reference (`SELECT body FROM docs LIMIT 1 OFFSET n`), span 12.
  2. `kpi` row count (span 3) titled "Rows".
  3. If a DATE/TIMESTAMP column and a numeric column: line chart of `sum(num)` by `date_trunc('day'|'month', date)` (month when range > 90 days, else day), span 9.
  4. Else if a VARCHAR column with `2 ≤ distinct ≤ 50`: bar chart of counts by it, top 20, span 9.
  5. First numeric column (not already used): histogram (Vega-Lite `bin`) over `SELECT col FROM ds` (capped by result limit), span 6.
  6. `table`: `SELECT * FROM ds LIMIT 1000`, span 12.
  7. `rowCount === 0`: only a text item `md: "No rows in **<name>**."`.
  Title: `"Overview"` or `"Overview of <name>"` for one dataset.

- [ ] **Step 1: Write failing tests**: `default spec for time series` (sales profile → contains chart with `"mark"` line and kpi), `default spec for categorical` (no date column → bar chart), `default spec for empty dataset` (→ single text item containing "No rows"), `default spec quotes identifiers` (awkward profile → SQL contains `"Order Date"`), `default spec for docs dataset` (→ text items with `doc`), `default spec validates` (`SpecSchema.parse` passes for all fixtures).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** Build test profiles via the real profiler on fixtures (helper `profileFixture(name)`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): deterministic default view`.

---

### Task 6: Part validation (no LLM-typed numbers, Vega-Lite sanitizing)

**Files:**
- Create: `packages/engine/src/validate.ts`
- Test: `packages/engine/test/validate.test.ts`

**Interfaces:**
- Consumes: `Part`, `Item`, `parsePlaceholders`
- Produces:
  - `sanitizeVegaLite(vl: Record<string, unknown>): Record<string, unknown>` — deep copy; removes top-level and nested (`layer`, `hconcat`, `vconcat`, `concat`, `spec`) `data`, `datasets`; removes `encoding.*.datum` when numeric; keeps `transform` and `scale.domain` literals; sets `$schema` absent; `width: "container"` when not set.
  - `validatePart(part: Part, ctx: { knownQueries: Set<string>; intent: string; queryLimits: Map<string, number> }): { ok: true; part: Part } | { ok: false; reason: string }` — for items: Zod-parse, sanitize chart Vega-Lite, check every placeholder query exists in `knownQueries` (unknown → `ok:false` with reason `pending:<id>` so the composer can hold the item), and run the prose digit rule on `text.md`, `kpi.label`, and the doc-level title/summary (exported separately as `checkProse(text, ctx): string | null`). Digit rule: remove placeholders; each remaining digit run is allowed only if it appears verbatim in `intent` or equals a `LIMIT n` value in `queryLimits`; otherwise reason `"literal number '<n>' in prose"`.

- [ ] **Step 1: Write failing tests**: `rejects literal number in text` (`"Revenue grew 12%"` → fails with `'12'`), `allows placeholders` (`"Revenue {t.v|currency}"` ok), `allows numbers from intent` (intent "sales in 2025", text "2025 sales" ok), `allows Top N matching LIMIT` (query `top` has LIMIT 10, text "Top 10 regions" ok), `strips vega-lite inline data` (input with `data.values` and `layer[0].data` → both removed, `transform` kept), `holds item with unknown query` (reason starts with `pending:`).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `queryLimits` is computed by the caller with `/\bLIMIT\s+(\d+)/i`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): part validation and vega-lite sanitizer`.

---

### Task 7: Streaming parts parser

**Files:**
- Create: `packages/engine/src/partsParser.ts`
- Test: `packages/engine/test/partsParser.test.ts`

**Interfaces:**
- Produces: `createPartsParser(h: { onMeta(m: { title?: string; summary?: string }): void; onPart(raw: unknown): void }): { push(chunk: string): void; end(): { complete: boolean } }`
  - Emits `onPart` with the parsed value as soon as each element of the top-level `parts` array closes. Emits `onMeta` once when `title` (and `summary` if it comes before `parts`) are complete; emits again at `end()` if `summary` arrived after `parts`.
  - `end()` returns `complete: false` when the top-level object never closed (truncated stream); already-emitted parts stay valid.

Algorithm (not determined by the signature): a character scanner tracking `inString`, `escape`, and a container stack. Record the key name at depth 1. When depth-1 key is `parts` and a `{` opens at depth 3 (object → array → element), remember the buffer offset; when its matching `}` closes back to depth 2, `JSON.parse` the slice and call `onPart`. For depth-1 string values of `title`/`summary`, `JSON.parse` the slice when the string closes. Keep only the unconsumed tail in the buffer.

- [ ] **Step 1: Write failing tests**: `emits parts as they close` (feed a doc one char at a time; record call order; expect 3 parts in order and the first emitted before the final char is pushed), `handles braces and escaped quotes in strings` (sql containing `'{'` and `\"`), `reports truncated stream` (cut mid third part → 2 parts, `complete: false`), `meta before and after parts`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): incremental parser for streamed parts`.

---

### Task 8: Prompt + Ollama provider

**Files:**
- Create: `packages/engine/src/{prompt.ts,llm/types.ts,llm/ollama.ts}`
- Test: `packages/engine/test/prompt.test.ts`, `packages/engine/test/ollama.test.ts`

**Interfaces:**
- Consumes: `Profile`, `llmDocJsonSchema`, `PartSchema`
- Produces:
  - `interface LlmProvider { name: string; stream(req: { system: string; user: string; schema: object; signal?: AbortSignal }): AsyncIterable<string> }`
  - `buildPrompt(profile: Profile, intent: string | undefined): { system: string; user: string }` — `system` is byte-identical across calls (instructions, component catalog, placeholder/format rules, "queries before the items that use them", "put the KPI row and the headline chart first", DuckDB SQL dialect notes, 2 compact examples). `user` = profile JSON (compact, no whitespace) + intent (or `"Give the best overview of this data."`).
  - `buildRepairPrompt(part: unknown, reason: string, profile: Profile): { system; user }` — asks for one corrected part only; schema = `PartSchema` JSON schema.
  - `createOllamaProvider(opts: { url: string; model: string; fetch?: typeof fetch }): LlmProvider` — POST `/api/chat` with `{ model, stream: true, think: false, keep_alive: "30m", format: schema, options: { temperature: 0.2, num_ctx: 8192 }, messages: [{role:"system",...},{role:"user",...}] }`; reads NDJSON lines, yields `message.content`; throws `Error("ollama: <status> <body>")` on non-2xx and `Error("ollama unreachable at <url>")` on connection failure.

- [ ] **Step 1: Write failing tests**: `system prompt is stable across profiles` (two different profiles → identical `system`), `user prompt contains profile and intent but no sample beyond 5 rows`, `ollama provider streams content` (fake fetch returning a `ReadableStream` of 3 NDJSON lines split across chunk boundaries → yields concatenated content; request body has `think:false`, `keep_alive:"30m"`, `format` object), `ollama provider error on 500`, `ollama unreachable`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): prompt builder and ollama provider`.

---

### Task 9: Compose pipeline + layout cache

**Files:**
- Create: `packages/engine/src/{cache,compose}.ts`, `packages/engine/src/llm/fake.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/test/compose.test.ts`

**Interfaces:**
- Consumes: everything in Tasks 2–8
- Produces:
  - `class SpecCache { constructor(max = 200); key(fingerprint: string, intent?: string): string; get(k): Spec | undefined; set(k, spec): void }` — LRU on `Map`; intent normalized (lowercase, trim, collapse whitespace).
  - `compose(opts: { renderId: string; input: DataInput | Record<string, DataInput>; intent?: string; provider: LlmProvider; cache: SpecCache; emit(e: RenderEvent): void; signal?: AbortSignal }): Promise<void>`
  - `createFakeProvider(doc: object, opts?: { chunkSize?: number; delayMs?: number; repair?: object; throwError?: string }): LlmProvider` in `llm/fake.ts` — streams `JSON.stringify(doc)` in chunks; returns `repair` for repair prompts. Used by tests, the server tests, and `AURORA_FAKE_PROVIDER=1`.
  - `index.ts` exports `compose`, `SpecCache`, `createOllamaProvider`, `createFakeProvider`, `LlmProvider`, `DataInput`.

Flow (order matters for latency):
1. `emit start` → `openDb` → `ingest` → `profileDatasets` (timings `ingest`, `profile`).
2. Cache hit → emit `meta`, each `item`, run each query and emit `result`; `done{cached:true}`. Stop.
3. Miss → emit `default` (spec from `defaultSpec`) and run its queries concurrently, emitting `result` for each (timing `default`).
4. Stream provider through `createPartsParser`. On `query` part: `explainQuery`; failure → one repair via provider with `buildRepairPrompt` (consume stream fully, `JSON.parse`, `PartSchema.parse`); still failing → `queryError` and drop items using it. Success → `runQuery` → `result` (the first composed `result` records timing `firstComponent`). On `item` part: `validatePart`; `pending:` → hold until its query arrives; other failures → one repair, else drop (text items: drop silently with a console warning). Valid → `item`.
5. At stream end: drop held items, run `checkProse` on meta (drop summary if it fails), emit final `meta`; store assembled spec in cache only if `complete` and ≥ 1 item emitted; `done{cached:false}`; close db.
6. Any thrown error after step 3 → `error{message}` + `done`; the default view stays. Errors before step 3 → `error` + `done`.

Default-to-composed swap is the renderer's job: the first composed `item` clears all `d_` items for that `renderId` (Task 11).

- [ ] **Step 1: Write failing tests** using a fake provider (`stream` yields a canned doc in small chunks): `emits default view before composed items` (event order: `start`, `default`, …, first composed `item`), `every composed item's queries have results`, `repairs bad query once` (first query sql invalid; fake provider returns a fixed part on the repair call → `result` for repaired query), `drops item with literal number`, `compose keeps default view when provider throws` (provider throws `ollama unreachable` → events include `default`, `error`, `done`; no throw from `compose`), `second identical render hits cache` (no provider call; `done.cached === true`; elapsed < 150 ms logged), `truncated stream is not cached`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run packages/engine` → all PASS.
- [ ] **Step 5: Commit** `feat(engine): streaming compose pipeline with repair and cache`.

---

### Task 10: Server + CLI

**Files:**
- Create: `packages/server/{package.json,tsconfig.json}`, `packages/server/src/{config,server,cli}.ts`; root script `"aurora": "tsx packages/server/src/cli.ts"` and `bin` entry
- Test: `packages/server/test/server.test.ts`

**Interfaces:**
- Consumes: `compose`, `SpecCache`, `createOllamaProvider`, `RenderEvent`
- Produces:
  - `loadConfig(env = process.env): { port: number; provider: "ollama"; model: string; ollamaUrl: string }` — defaults from Global Constraints, merged with `~/.aurora/config.json` then env.
  - `startServer(opts: { port: number; provider: LlmProvider; staticDir?: string; openBrowser?: (url: string) => void }): Promise<{ url: string; close(): Promise<void> }>`
    - `POST /api/render` body `{ data: DataInput | Record<string, DataInput>; intent?: string }` → `202 { renderId, url: "<base>/#<renderId>" }`; starts `compose` in the background. Relative paths resolved against the CLI's cwd, which the CLI sends as absolute paths.
    - `GET /ws` WebSocket: server broadcasts every `RenderEvent`; keeps the last 20 renders' events in memory and replays them to newly connected clients.
    - If no WebSocket client is connected when a render starts, call `openBrowser(url)` (default: `child_process.spawn("open", [url])`).
    - Serves `staticDir` (renderer build) at `/`.
  - CLI: `aurora serve` (starts server with config); `aurora render <input...> [--intent "..."]` where each input is `path` or `name=path` → POST to running server (start it in-process if `GET /api/health` fails), print the URL.

- [ ] **Step 1: Write failing tests** (fake provider, ephemeral port, `ws` client): `render endpoint returns renderId and streams events over ws`, `replays recent events to late client`, `concurrent renders stay isolated` (two POSTs on two fixtures → each renderId's `item` events match its own data's queries), `opens browser when no client connected` (spy called once), `bad body returns 400`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `node:http` + `ws`.
- [ ] **Step 4: Run** `npx vitest run packages/server` → PASS.
- [ ] **Step 5: Commit** `feat(server): http/ws server and aurora cli`.

---

### Task 11: Renderer (screen)

**Files:**
- Create: `packages/renderer/{package.json,index.html,vite.config.ts,tsconfig.json}`, `src/{main.tsx,App.tsx,store.ts,ws.ts,format.ts}`, `src/components/{Grid,Kpi,Chart,Table,Text}.tsx`, `e2e/smoke.spec.ts`, `playwright.config.ts`
- Test: `packages/renderer/test/store.test.ts`, `packages/renderer/e2e/smoke.spec.ts`

**Interfaces:**
- Consumes: `RenderEvent`, `Spec`, `Item`, `QueryResult`, `fillPlaceholders`, `formatValue`
- Produces:
  - `type RenderState = { id: string; title?: string; summary?: string; items: Item[]; results: Record<string, QueryResult>; errors: string[]; done: boolean; timings?: Record<string, number> }`
  - `reduce(state: Record<string, RenderState>, e: RenderEvent): Record<string, RenderState>` — pure. `default` → items = spec items; first non-`d_` `item` for a render → removes all `d_` items, then appends; later items append (replace by same id). `result` → stored by `queryId` (namespaced per render).
  - UI: left sidebar = render history (title + time, newest first); main = selected render (URL hash `#<renderId>`, defaults to newest; auto-follows new renders unless the user clicked an older one). Title, summary (placeholders filled), 12-column CSS grid, items get a skeleton until their result arrives. Kpi: big formatted number + label + optional delta. Chart: `vega-embed` with `{ ...vegaLite, data: { values: rows }, width: "container" }`, actions off, theme follows `prefers-color-scheme`. Table: TanStack Table + virtualizer, sortable headers, "showing N of many" when `truncated`. Text: `marked` → `DOMPurify.sanitize`, placeholders filled first; `doc` variant renders the referenced field. Footer shows timings from `done`. Vite dev proxy `/api` and `/ws` → `http://localhost:4317`; `vite build` outputs to `packages/renderer/dist`, which the CLI passes as `staticDir`.

- [ ] **Step 1: Write failing store tests**: `default items replaced by first composed item`, `results namespaced per render`, `item with same id replaces`.
- [ ] **Step 2: Run** `npx vitest run packages/renderer` → FAIL.
- [ ] **Step 3: Implement** `store.ts`, then components and app.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write Playwright smoke test**: start server (fake provider via `AURORA_FAKE_PROVIDER=1`, which `cli.ts` honors with `createFakeProvider` and a canned sales doc), build renderer, POST a render of `sales.csv`, expect a KPI with a `$` value, a `canvas`/`svg` chart, a table with rows, and no element containing the text `d_`. Run `npx playwright test` → PASS. Save a screenshot to `test-results/smoke.png`.
- [ ] **Step 6: Commit** `feat(renderer): streaming screen with kpi, chart, table, text`.

---

### Task 12: Real-model end-to-end check

**Files:**
- Create: `README.md` (install, `npm run aurora -- serve`, `npm run aurora -- render file.csv --intent "..."`, config keys)
- Create: `scripts/latency.ts` — runs `compose` with the real Ollama provider on 3 fixtures (sales.csv, a generated 1M-row Parquet, docs dir), prints the `done.timings` table.

- [ ] **Step 1:** Ensure `ollama serve` is running and `qwen3:8b` is present (`ollama list`).
- [ ] **Step 2:** Run `npx tsx scripts/latency.ts` twice (second run shows cache hits). Expected: every run ends with `done`, at least 3 composed items per fixture, no `error` events; record timings in the README under "Measured latency (M4 Air 16 GB)". If first-component time > 3 s, record it and note it for Plan 4 (model choice) — do not tune here.
- [ ] **Step 3:** Run `npm run aurora -- render packages/engine/test/fixtures/sales.csv --intent "monthly revenue by region"` and view in the browser; screenshot to `docs/screenshots/sales.png`.
- [ ] **Step 4: Commit** `docs: readme, latency script and measured results`.

---

## Self-review notes

- Spec coverage for this plan's scope: §5 pipeline (Tasks 2–9), §6 rules + kpi/chart/table/text (1, 6, 11), multi-dataset + docs (2, 5), §7 data handling incl. guard + caps (2, 3), §8 adapters (Ollama only here), constrained output, streaming parse, EXPLAIN + repair, fallback default (7–9), §9 latency levers + measurements (9, 12), §10 HTTP + screen + history (10, 11). Deferred items are listed under "Scope of this plan".
- Choropleth, GeoJSON bundling, graph/hierarchy conventions → Plan 2 (needs `map`/`graph` components); the ingest API already accepts named inputs, so no rework.
