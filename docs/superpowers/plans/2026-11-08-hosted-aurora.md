# Hosted aurora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run aurora on Kush's domain as a basic hosted service any MCP harness can connect to with a bearer key, sharing views by link, with local mode unchanged.

**Architecture:** A hosted mode (`AURORA_MODE=hosted`) in the existing server. Each workspace key (a stateless JWT) maps to a tenant: its own `ViewStore`, `DataRuntime` and `Intake` in its own folder, built by the same factory local mode uses for its single core; shared services (fonts, media, screenshots) take the workspace explicitly. Fences (auth, body caps, data confinement, DuckDB limits) land before anything is exposed. MCP gains a stateless Streamable HTTP endpoint at `/mcp`; viewers open view-only share links `/v/<token>` on sockets pinned to one view; the server verifies views through signed headless captures.

**Tech Stack:** Node 22, TypeScript, `@modelcontextprotocol/sdk` 1.32.2 (`StreamableHTTPServerTransport`, stateless), `ws`, DuckDB (`@duckdb/node-api`), playwright-core + Chromium, vitest, Playwright, Docker, Caddy.

**Spec:** `docs/superpowers/specs/2026-11-08-hosted-aurora-design.md` (amended by this plan's Global Constraints where they differ; the discriminator review of 2026-11-10 is folded in)

## Global Constraints

- Local mode (no `AURORA_MODE`) behaves exactly as today: every existing unit and browser test passes unchanged.
- Hosted env: `AURORA_MODE=hosted`; `AURORA_SECRET` (≥ 32 chars), `AURORA_PUBLIC_URL`, `AURORA_INVITE` all **required**; `AURORA_DATA_DIR` (default `/data`); `AURORA_TRUSTED_PROXY` (default `127.0.0.1,::1,172.16.0.0/12`).
- Hosted mode listens on `0.0.0.0`; identity comes only from the bearer key or a signed token, never from Host or source address.
- Workspace id: 16 chars `[a-z0-9]`. Key: JWT HS256 `{ws, iat}` with node `crypto`, `timingSafeEqual`. Keys travel only as `Authorization: Bearer <key>`; never from a query string; never logged.
- Signed short tokens (capture, upload): HMAC of `{ws, purpose, viewId?, name?, exp}` with `AURORA_SECRET`; capture 2 min, upload 10 min.
- Share token: `<wsId>_<32 lowercase hex>`; view-only; rotating it closes sockets already open on the old one.
- Body caps (read with early abort, before route/auth work): 64 KB for `/api/keys`, 4 MB for views/patches/MCP, uploads streamed with abort at 25 MB.
- Minting: invite required; 5 per client IP per hour (client IP = left-most `X-Forwarded-For` only when the socket peer is a trusted proxy); 50 per hour globally; 500 workspaces total.
- Workspace disk quota: 200 MB for the whole workspace folder (views, versions, inline data, uploads, shots), checked before any write.
- DuckDB per instance, set before `lock_configuration`: `memory_limit='256MB'`, `threads=2`, `max_temp_directory_size='256MB'`; a query running past 10 s is interrupted (`conn.interrupt()`); at most 8 open instances per tenant (least recently used closed).
- Hosted data: no `http(s)` datasets; paths resolve against and must stay inside the workspace folder (after `realpath`); the same for `/api/profile` and media.
- Share sockets: pinned to one view (only that view's events; no `list`; `sync` only for that view; `rendered`, `revertItem`, `pickVariant`, `event` ignored); 20 messages/s per socket; 50 sockets per view; 20 per client IP.
- Look gate: concurrency 2, queue 8, 30 looks per workspace per hour, cache by view version + options; 503 + `Retry-After` when busy; 429 over the limit. Shots live in `<ws>/shots`.
- Off in hosted mode: the composer (`/api/render` with `data`, MCP `compose`), `/api/watch` (404) and the MCP's call to it, opening a browser, `variants` and `events` tools. `/api/health` stays unauthenticated.

## Review Focus

1. A key from workspace A on workspace B's view (render, patch, status, look, share, media) → 404, never data. Pinned in Task 3.
2. A dataset, profile or media path outside the workspace (`/etc/passwd`, `../x`, a symlink, `http://169.254.169.254/`) → a problem naming uploads, nothing read or fetched. Pinned in Task 4.
3. A share socket ever receiving another view's events or the workspace list, or still receiving after rotation. Pinned in Task 5.
4. An anonymous client sending a huge body, many mints or a flood of socket messages → refused early, the box stays responsive. Pinned in Tasks 3 and 5.
5. The author patching a view while viewers have moved its filters → viewers keep their values and see the new version. Pinned in Task 8.

---

### Task 1: Hosted config, workspace keys and signed short tokens

**Files:** Create `packages/server/src/hosted/config.ts`, `packages/server/src/hosted/keys.ts`; Test `packages/server/test/hosted-keys.test.ts`

**Interfaces:**
- Produces: `type HostedConfig = { secret: string; publicUrl: string; dataDir: string; invite: string; trustedProxies: string[] }`; `loadHostedConfig(env): HostedConfig | undefined` (undefined unless hosted; throws naming the missing variable); `newWorkspaceId(): string`; `mintKey(secret, ws?): string`; `verifyKey(secret, token, denied?: ReadonlySet<string>): { ws: string } | null`; `signToken(secret, claims: { ws: string; purpose: "capture" | "upload"; viewId?: string; name?: string }, ttlSec: number): string`; `verifyToken(secret, token, purpose): { ws: string; viewId?: string; name?: string } | null` (null when expired, tampered or the wrong purpose).

- [ ] **Step 1: Write the failing tests**

```ts
test("keys verify to their workspace; tampered, foreign-secret or denied ones don't", () => {
  const k = mintKey(S, "abcdefgh12345678");
  expect(verifyKey(S, k)).toEqual({ ws: "abcdefgh12345678" });
  expect(verifyKey(S + "x", k)).toBeNull();
  expect(verifyKey(S, k.slice(0, -2) + "aa")).toBeNull();
  expect(verifyKey(S, "not.a.jwt")).toBeNull();
  expect(verifyKey(S, k, new Set(["abcdefgh12345678"]))).toBeNull();
});
test("short tokens carry a purpose and expire", async () => {
  const t = signToken(S, { ws: "abcdefgh12345678", purpose: "capture", viewId: "v1" }, 1);
  expect(verifyToken(S, t, "capture")).toEqual({ ws: "abcdefgh12345678", viewId: "v1" });
  expect(verifyToken(S, t, "upload")).toBeNull();
  await new Promise((r) => setTimeout(r, 1100));
  expect(verifyToken(S, t, "capture")).toBeNull();
});
test("hosted config requires secret, public url and invite", () => {
  expect(loadHostedConfig({})).toBeUndefined();
  expect(() => loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: S, AURORA_PUBLIC_URL: "https://a.example" })).toThrow(/AURORA_INVITE/);
});
```

- [ ] **Step 2:** `npx vitest run packages/server/test/hosted-keys.test.ts` → FAIL
- [ ] **Step 3:** Implement (base64url JSON + HMAC-SHA256; `alg` must be `HS256`).
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(hosted): config, workspace keys and signed short tokens`

### Task 2: One core per workspace (refactor, no behaviour change)

**Files:** Create `packages/server/src/core.ts`, `packages/server/src/hosted/tenants.ts`; Modify `packages/server/src/server.ts:121-160` (construction moves into `createCore`; handlers take a `Core`), `packages/server/src/media.ts` (`register(path, root?, ws?)`), `packages/server/src/look.ts` (`look(ws, viewId, version, opts)` with shots under `dirFor(ws)`; local ws = `"local"` keeps today's folder); Test `packages/server/test/tenants.test.ts`; all existing tests unchanged

**Interfaces:**
- Produces: `type Core = { ws: string; dir: string; store: ViewStore; data: DataRuntime; intake: Intake; clients: Set<WebSocket>; captures: Set<WebSocket>; broadcast(e: ViewEvent): void; hold(): () => void; close(): Promise<void> }` (`hold` counts a live socket, long-poll or look; eviction waits for zero); `createCore(opts: { ws: string; dir: string; viewsDir: string; media: MediaRegistry; fonts: FontStore; open: (url: string) => void; baseUrl: () => string; waitMs?: number; dataRoot?: string; duck?: DuckLimits }): Promise<Core>`; `class Tenants { constructor(opts: { dataDir: string; make: (ws: string, dir: string) => Promise<Core>; maxLive?: number /*50*/; idleMs?: number /*30 min*/ }); get(ws): Promise<Core>; dir(ws): string; closeAll(): Promise<void> }`.

- [ ] **Step 1: Write the failing test** `each workspace gets its own core and folder; a held core is never evicted; an idle one closes` (two `get`s return distinct cores, the same `get` returns the same one, `dir` is `<dataDir>/ws/<id>`, a core with `hold()` outstanding survives `idleMs`, after release it closes).
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement; local mode makes exactly one core (`ws: "local"`).
- [ ] **Step 4:** `npx vitest run` → new + all existing PASS; `cd packages/renderer && npx playwright test` → all PASS
- [ ] **Step 5:** Commit `refactor(server): a core factory; one per workspace when hosted`

### Task 3: Hosted HTTP fences: bearer keys, minting, body caps, listen address, switches

**Files:** Create `packages/server/src/hosted/auth.ts`, `packages/server/src/http/body.ts`; Modify `packages/server/src/server.ts` (hosted: listen `0.0.0.0`; every `/api/*` except `/api/health` and `/api/keys` resolves the tenant from the bearer key; deny-list `<dataDir>/denied.json` re-read on change; off-switches from Global Constraints; body caps for every JSON route in both modes), `packages/server/src/mcp.ts` (no `/api/watch` call when `hosted`), `packages/server/src/cli.ts`; Test `packages/server/test/hosted-api.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `bearer(req): string | null`; `clientIp(req, trusted: string[]): string`; `class RateLimit { constructor(limit: number, windowMs: number); take(key: string): boolean }`; `readBody(req, maxBytes): Promise<Buffer>` (rejects with status 413 as soon as the limit passes); `POST /api/keys {invite} → {key, ws}`; missing/invalid key → 401 `{error: "a workspace key is required: Authorization: Bearer <key>"}`.
- Route scoping table (every route in `server.ts` today): tenant-scoped — `/api/views*`, `/api/render` (views only), `/api/profile`, `/api/views/:id/look|events|params|patch|status|versions|share`; public — `/api/health`, `/lib/*`, `/media/<token>` (token bound to its workspace), static; hosted 404 — `/api/watch`, composer.

- [ ] **Step 1: Write the failing tests**

```ts
test("no key → 401; a key sees only its own workspace", async () => {
  const s = await startHosted(); const a = await s.mint(), b = await s.mint();
  expect((await s.fetch("/api/views", {})).status).toBe(401);
  expect((await s.post("/api/views", { view: v("x1") }, a)).status).toBe(200);
  for (const [m, p, body] of [["GET", "/api/views/x1/status"], ["POST", "/api/views/x1/patch", { ops: [], baseVersion: 1 }], ["POST", "/api/views/x1/look", {}], ["POST", "/api/views/x1/share", {}]] as const)
    expect((await s.req(m, p, body, b)).status).toBe(404);
});
test("minting: invite required, per-IP through the proxy, global cap", async () => {
  const s = await startHosted({ invite: "letmein" });
  expect((await s.post("/api/keys", {})).status).toBe(403);
  for (let i = 0; i < 5; i++) expect((await s.post("/api/keys", { invite: "letmein" }, undefined, { "x-forwarded-for": "9.9.9.9" })).status).toBe(200);
  expect((await s.post("/api/keys", { invite: "letmein" }, undefined, { "x-forwarded-for": "9.9.9.9" })).status).toBe(429);
  expect((await s.post("/api/keys", { invite: "letmein" }, undefined, { "x-forwarded-for": "8.8.8.8" })).status).toBe(200);
});
test("bodies are capped before any work", async () => {
  const s = await startHosted();
  expect((await s.fetch("/api/keys", { method: "POST", body: "x".repeat(70_000) })).status).toBe(413);
});
test("hosted off-switches; health is open; a denied workspace stops working; no key from the query string", async () => {
  const s = await startHosted(); const a = await s.mint();
  expect((await s.fetch("/api/health", {})).status).toBe(200);
  expect((await s.post("/api/watch", { dir: "/" }, a)).status).toBe(404);
  expect((await s.post("/api/render", { data: { inline: [{ a: 1 }] } }, a)).status).toBe(404);
  expect((await s.fetch(`/api/views?key=${a}`, {})).status).toBe(401);
  await writeFile(path.join(s.dataDir, "denied.json"), JSON.stringify([s.wsOf(a)]));
  await expect.poll(async () => (await s.get("/api/views", a)).status).toBe(401);
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement (`startHosted` helper: port 0, temp data dir, trusted proxy `127.0.0.1`).
- [ ] **Step 4:** `npx vitest run` → all PASS
- [ ] **Step 5:** Commit `feat(hosted): bearer keys, minting, body caps and off-switches`

### Task 4: Data confinement and DuckDB limits

**Files:** Create `packages/server/src/hosted/quota.ts`; Modify `packages/engine/src/ingest.ts` (accept `{ root?: string; allowHttp?: boolean; limits?: DuckLimits }`; set limits before the lock), `packages/server/src/dataRuntime.ts` (pass them; `run` interrupts at 10 s; max 8 open instances), `packages/server/src/server.ts` (`/api/profile` through the same confinement), `packages/server/src/core.ts` (hosted cores pass `root`, `allowHttp: false`, limits), the view-write paths in `viewStore.ts`/`dataRuntime.ts` (quota check); Test `packages/engine/test/ingest-limits.test.ts`, `packages/server/test/hosted-data.test.ts`

**Interfaces:**
- Produces: `type DuckLimits = { memory: string; threads: number; temp: string; timeoutMs: number }` (hosted: `256MB`, 2, `256MB`, 10000); `insideRoot(root: string, p: string): Promise<boolean>` (`realpath`, then prefix check); `class Quota { constructor(dir: string, maxBytes: number); check(adding: number): Promise<void> }` (throws `QuotaError` status 507).

- [ ] **Step 1: Write the failing tests**

```ts
test("hosted data stays in the workspace: no host files, no network, no symlink escape", async () => {
  const s = await startHosted(); const a = await s.mint();
  await symlink("/etc", path.join(s.wsDirOf(a), "uploads", "etc"));
  for (const bad of ["/etc/passwd", "../../x.csv", "uploads/etc/passwd", "http://169.254.169.254/latest/meta-data/"]) {
    const r = await (await s.post("/api/views", { view: { ...v("d1"), datasets: { d: bad } } }, a)).json();
    expect(JSON.stringify(r.problems), bad).toMatch(/upload/);
    expect((await s.post("/api/profile", { data: bad }, a)).status, bad).not.toBe(200);
  }
});
test("a runaway query is stopped and memory is capped", async () => {
  const db = await ingest({ inline: [{ x: 1 }] }, { limits: { memory: "256MB", threads: 2, temp: "256MB", timeoutMs: 1000 } });
  const t = Date.now();
  await expect(runQuery(db, "SELECT count(*) FROM range(10000000000) a, range(10) b")).rejects.toThrow(/interrupt/i);
  expect(Date.now() - t).toBeLessThan(3000);
  expect(await settingOf(db, "memory_limit")).toMatch(/256/);
});
test("the workspace quota covers everything written", async () => {
  const s = await startHosted({ quotaBytes: 50_000 }); const a = await s.mint();
  const rows = Array.from({ length: 5000 }, (_, i) => ({ i, pad: "x".repeat(20) }));
  expect((await s.post("/api/views", { view: { ...v("q1"), datasets: { d: { inline: rows } } } }, a)).status).toBe(507);
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npx vitest run` → all PASS (local mode: no root, http allowed, no limits — unchanged)
- [ ] **Step 5:** Commit `feat(hosted): data confined to the workspace; DuckDB memory, threads and time limits; quota`

### Task 5: Share links on sockets pinned to one view

**Files:** Create `packages/server/src/hosted/shares.ts`; Modify `packages/server/src/server.ts` (WebSocket `/ws?share=<token>`: resolve, `hold()` the core, pin to one view; outgoing filter; ignored message types; per-socket rate limit and caps; `POST /api/views/:id/share {rotate?}` returns `{url}` and rotation closes old sockets with code 4401; render/patch/status results carry `url: <publicUrl>/v/<token>` when hosted), `packages/renderer/src/App.tsx` + `packages/renderer/src/ws.ts` (path `/v/<token>`: socket with `share`, a single read-only view, no version picker, variants or edit affordances; close code 4401 or unknown link → "This link doesn't work"); Test `packages/server/test/hosted-shares.test.ts`, `packages/renderer/e2e/hosted.spec.ts`

**Interfaces:**
- Produces: `class Shares { constructor(wsDir: string); linkFor(viewId): Promise<string>; rotate(viewId): Promise<string>; resolve(token): Promise<string | null> }`; `wsOfToken(token): string | null`; `shareOutgoing(viewId: string, e: ViewEvent): boolean` (true only for events of that view; never `list`).

- [ ] **Step 1: Write the failing tests**

```ts
test("a share socket sees one view and nothing else", async () => {
  const s = await startHosted(); const a = await s.mint();
  await s.post("/api/views", { view: v("other") }, a);
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const sock = await s.viewer(tokenOf(url));
  sock.send({ t: "sync", viewId: "other" });
  await s.post("/api/views/other/patch", { ops: [{ op: "set", title: "secret" }], baseVersion: 1 }, a);
  await sleep(200);
  expect(sock.events.some((e) => e.t === "list")).toBe(false);
  expect(sock.events.every((e) => !("viewId" in e) || e.viewId === "x1")).toBe(true);
});
test("viewer reports and edits are ignored; rotation closes open sockets", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const sock = await s.viewer(tokenOf(url));
  for (const m of [{ t: "rendered", viewId: "x1", version: 1, ok: false, problems: [{ severity: "error", message: "fake" }] }, { t: "pickVariant", viewId: "x1", index: 0 }, { t: "revertItem", viewId: "x1", itemId: "i", version: 1 }]) sock.send(m);
  await sleep(200);
  const st = await (await s.get("/api/views/x1/status", a)).json();
  expect(st.version).toBe(1); expect(JSON.stringify(st.problems)).not.toContain("fake");
  await s.post("/api/views/x1/share", { rotate: true }, a);
  await expect.poll(() => sock.closedWith).toBe(4401);
});
test("a socket flooding messages is cut off", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const sock = await s.viewer(tokenOf(url));
  for (let i = 0; i < 200; i++) sock.send({ t: "sync", viewId: "x1" });
  await expect.poll(() => sock.closed).toBe(true);
});
```

Browser: `/v/<token>` shows the title and no version picker; after rotation the page shows "This link doesn't work".

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement (`shares.json` per workspace; constant-time compare of the random part).
- [ ] **Step 4:** `npx vitest run`, `npx playwright test e2e/hosted.spec.ts` → PASS
- [ ] **Step 5:** Commit `feat(hosted): view-only share links on pinned sockets`

### Task 6: Screenshots and verification per workspace

**Files:** Modify `packages/server/src/look.ts` (hosted: open `${base}/?capture&t=<capture token>#<id>`), `packages/server/src/server.ts` (WebSocket `/ws?role=capture&t=<token>` → that tenant, pinned to that view; in hosted mode capture reports are accepted as the view's verification, since only the server mints them), `packages/renderer/src/ws.ts` (pass `t` through), `packages/server/src/intake.ts` (hosted: render/patch don't wait for a screen; results say `verify with look`); Test `packages/server/test/hosted-look.test.ts`

**Interfaces:**
- Consumes: Task 1 `signToken`/`verifyToken`, Task 2 `Looker.look(ws, …)`, Task 5 pinning.
- Produces: `captureUrl(base: string, token: string, viewId: string): string`.

- [ ] **Step 1: Write the failing tests** `two workspaces with the same view id get their own pictures` (render `same` in A and B with different titles; look both; the files are under each workspace's `shots` and the captions/pixels differ); `a capture socket without a valid token is refused` (`/ws?role=capture` → closed 4401); `after look, the view is verified in hosted mode` (status `unverified` empty after a look).
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** Run → PASS; `look.test.ts` (local) still PASS
- [ ] **Step 5:** Commit `feat(hosted): screenshots and verification per workspace through signed captures`

### Task 7: MCP over Streamable HTTP at `/mcp`, with uploads

**Files:** Create `packages/server/src/hosted/mcpHttp.ts`, `packages/server/src/hosted/uploads.ts`; Modify `packages/server/src/mcp.ts` (`createAuroraMcpServer` accepts `headers?` and `hosted?: true`: no `compose`, `variants`, `events`; adds `upload` and `upload_url`), `packages/server/src/server.ts` (`POST /mcp` hosted; `GET`/`DELETE /mcp` → 405; `PUT /u/<upload token>` streams to `<ws>/uploads/<name>`), `packages/server/src/skill/data.md` (one paragraph: on a hosted aurora, small files go inline; larger ones `curl -T file <upload_url>` and use the returned path); Test `packages/server/test/hosted-mcp.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `handleMcp(req, res, ctx: { key: string; internalBase: string }): Promise<void>` (a fresh transport and server per request; both closed on `res` close; forwards with the bearer key); MCP tools `upload {name, content_base64}` (≤ 1 MB decoded) → `{path}` and `upload_url {name}` → `{url, path, expires_in: 600}`; `saveUpload(wsDir, name, stream, maxBytes): Promise<{ path: string; bytes: number }>`.

- [ ] **Step 1: Write the failing tests**

```ts
test("an MCP client over HTTP renders through a bearer key and gets a share link", async () => {
  const s = await startHosted(); const key = await s.mint();
  const client = new Client({ name: "t", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(s.base + "/mcp"), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["render", "patch", "status", "look", "upload", "upload_url"]));
  for (const off of ["compose", "variants", "events"]) expect(tools).not.toContain(off);
  expect(JSON.stringify((await client.callTool({ name: "render", arguments: { view: v("m1") } })).content)).toContain("/v/");
});
test("/mcp: no key 401, GET and DELETE 405", async () => {
  const s = await startHosted();
  expect((await s.fetch("/mcp", { method: "POST", body: "{}" })).status).toBe(401);
  expect((await s.fetch("/mcp", { method: "GET" })).status).toBe(405);
  expect((await s.fetch("/mcp", { method: "DELETE" })).status).toBe(405);
});
test("an upload URL takes a file once, inside its workspace, within limits", async () => {
  const s = await startHosted(); const key = await s.mint();
  const { url, path: p } = await s.mcpCall(key, "upload_url", { name: "sales.csv" });
  expect((await fetch(url, { method: "PUT", body: "region,amount\nEast,3\n" })).status).toBe(200);
  expect(p.startsWith(s.wsDirOf(key))).toBe(true);
  expect((await fetch(url.replace(/t=[^&]+/, "t=forged"), { method: "PUT", body: "x" })).status).toBe(401);
  expect((await s.mcpCall(key, "upload_url", { name: "../x.csv" })).error).toBeTruthy();
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(hosted): MCP over Streamable HTTP with bearer keys, and uploads`

### Task 8: Filter state per viewer

**Files:** Modify `packages/server/src/intake.ts` (param-parameterized `vars(params)`, `resolveOptions(params)`, option checks; `evaluateFor`), `packages/server/src/server.ts` (each share socket keeps `{params, results}`; a socket that has diverged gets no shared `params`/`result` events; on a new view version its queries re-run with its own params); Test `packages/server/test/hosted-params.test.ts`

**Interfaces:**
- Produces: `Intake.evaluateFor(viewId: string, params: Record<string, unknown>, changed?: string[]): Promise<ViewEvent[]>` (validates like `setParam`; runs only dependent queries, or all when `changed` is omitted; returns `result` events and a `params` event; shared state untouched).

- [ ] **Step 1: Write the failing tests**

```ts
test("viewers move the same filter independently; the author's value stays the default", async () => {
  const s = await startHosted(); const a = await s.mint();
  const tok = tokenOf((await (await s.post("/api/views", { view: paramView("p1") }, a)).json()).url);
  const v1 = await s.viewer(tok), v2 = await s.viewer(tok);
  v1.send({ t: "param", viewId: "p1", name: "cut", value: 8 });
  await v1.until((e) => e.t === "result" && e.result.rows[0].n === 2);
  expect(lastResult(v2, "above").rows[0].n).toBe(6);
  expect((await (await s.get("/api/views/p1/status", a)).json()).params.cut).toBe(4);
});
test("an author patch keeps each viewer's filter and shows the new version", async () => {
  const s = await startHosted(); const a = await s.mint();
  const tok = tokenOf((await (await s.post("/api/views", { view: paramView("p2") }, a)).json()).url);
  const v1 = await s.viewer(tok);
  v1.send({ t: "param", viewId: "p2", name: "cut", value: 8 });
  await v1.until((e) => e.t === "result" && e.result.rows[0].n === 2);
  await s.post("/api/views/p2/patch", { ops: [{ op: "set", title: "New" }], baseVersion: 1 }, a);
  await v1.until((e) => e.t === "view" && e.view.title === "New");
  await sleep(200);
  expect(lastResult(v1, "above").rows[0].n).toBe(2);
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** Run → PASS; local `params.test.ts` PASS
- [ ] **Step 5:** Commit `feat(hosted): each viewer's filters are their own`

### Task 9: Screenshot gate

**Files:** Create `packages/server/src/lookGate.ts`; Modify `packages/server/src/server.ts` (look route through the gate in both modes; 503 + `Retry-After`; hosted 429; `hold()` during a look); Test `packages/server/test/lookGate.test.ts`

**Interfaces:**
- Produces: `class LookGate { constructor(opts?: { concurrency?: number; maxQueue?: number; perHour?: number; cacheSize?: number /*200*/ }); run<T>(ws: string, key: string, fn: () => Promise<T>): Promise<T> }`; `BusyError { retryAfter: number }`; `LimitError`. Key: `${ws}:${viewId}@${version}:${JSON.stringify({ sizes, section })}`; cache hits don't count.

- [ ] **Step 1: Write the failing tests** — `at most 2 run at once, 8 wait, the rest get BusyError` (12 jobs, peak 2, 2 BusyErrors); `the same key comes from the cache` (one call for two runs); `the 31st distinct look in an hour is LimitError`; `workspaces don't share cache entries` (same view key under two ws → two calls).
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npx vitest run` → all PASS
- [ ] **Step 5:** Commit `feat: a screenshot gate (2 at a time, short queue, cache, hourly limit when hosted)`

### Task 10: Container, TLS and the guide

**Files:** Create `Dockerfile`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/README.md`, `scripts/hosted-smoke.sh`; Modify `README.md` ("Use a hosted aurora")

**Interfaces:**
- Produces: `docker compose -f deploy/docker-compose.yml up -d` → `https://aurora.<DOMAIN>`; `scripts/hosted-smoke.sh <base> <invite>` exits 0 when a key mints, `/mcp` lists tools, a render returns a `/v/` link answering 200, a look returns an image, and a request without the key is 401.

- [ ] **Step 1:** Dockerfile: Node 22 slim; `npm ci`; renderer build; Chromium via `npx playwright install --with-deps chromium`; a non-root `aurora` user owning `/data`; Chromium keeps its sandbox (no `--no-sandbox`; add the seccomp profile or `cap_add: SYS_ADMIN` only if the sandbox can't start, and say which in the README); `ENV AURORA_MODE=hosted`; `CMD ["npx","tsx","packages/server/src/cli.ts","serve"]`; healthcheck `GET /api/health`. Caddyfile: `aurora.{$DOMAIN} { reverse_proxy aurora:4317 }`. Compose: both services, named volume `/data`, env from `.env`, memory limit 2 GB on aurora.
- [ ] **Step 2:** `docker compose -f deploy/docker-compose.yml up -d --build` with `DOMAIN=localhost`; `scripts/hosted-smoke.sh https://localhost <invite>` → exit 0
- [ ] **Step 3:** `deploy/README.md`: DNS A record, `.env` values, deploy, rotate the secret, deny one workspace, back up `/data`, and the client line `claude mcp add --transport http aurora https://aurora.<domain>/mcp --header "Authorization: Bearer <key>"`
- [ ] **Step 4:** Commit `feat(hosted): container, TLS and deploy guide`

### Task 11: End to end on the hosted build

**Files:** Modify `packages/renderer/e2e/hosted.spec.ts`, `packages/renderer/playwright.config.ts` (a second web server started hosted on another port with a temp data dir and test secret/invite)

- [ ] **Step 1: Write the failing test** `hosted: a harness renders through /mcp with an uploaded csv; the share link draws it; another key can't touch it; a rotated link stops; look returns an image`.
- [ ] **Step 2:** `npx playwright test e2e/hosted.spec.ts` → FAIL, then PASS once wired
- [ ] **Step 3:** Whole suite: `npx vitest run` and `cd packages/renderer && npx playwright test` → all PASS
- [ ] **Step 4:** Commit `test(hosted): end to end through /mcp and a share link`
