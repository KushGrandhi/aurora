# Hosted aurora Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run aurora on Kush's domain as a basic hosted service any MCP harness can connect to with a bearer key, sharing views by link, with local mode unchanged.

**Architecture:** A hosted mode (`AURORA_MODE=hosted`) in the existing server. Each workspace key (a stateless JWT) maps to a tenant: its own `ViewStore`, `DataRuntime` and `Intake` in its own folder, built by the same factory local mode uses for its single core. MCP gains a Streamable HTTP endpoint at `/mcp` that reuses today's tools; viewers open view-only share links `/v/<token>`; data arrives inline or by upload; screenshots pass through a small in-process gate with a cache.

**Tech Stack:** Node 22, TypeScript, `@modelcontextprotocol/sdk` 1.32 (`StreamableHTTPServerTransport`), `ws`, DuckDB, playwright-core + Chromium, vitest, Playwright, Docker, Caddy.

**Spec:** `docs/superpowers/specs/2026-11-08-hosted-aurora-design.md`

## Global Constraints

- Local mode (no `AURORA_MODE`) behaves exactly as today: every existing unit and browser test passes unchanged.
- Hosted env: `AURORA_MODE=hosted`, `AURORA_SECRET` (≥ 32 chars, required), `AURORA_PUBLIC_URL` (e.g. `https://aurora.example.com`, required), `AURORA_DATA_DIR` (default `/data`), `AURORA_INVITE` (optional).
- Workspace id: 16 chars `[a-z0-9]`. Key: JWT HS256 `{ws, iat}`, signed with `AURORA_SECRET`, verified with `crypto.timingSafeEqual`. No new JWT dependency (node `crypto`).
- Keys travel only as `Authorization: Bearer <key>`; never accepted from a query string; never logged.
- Share token: `<wsId>_<32 lowercase hex>`; view-only.
- Uploads: ≤ 25 MB each, ≤ 200 MB per workspace; file names `^[\w.-]{1,100}$`; extensions csv, tsv, json, ndjson, parquet, png, jpg, gif, webp, svg, mp4, webm.
- Look gate: concurrency 2, queue 8, 30 looks per workspace per hour; busy → HTTP 503 with `Retry-After`; over limit → 429.
- Key minting: 5 per IP per hour; requires `invite` equal to `AURORA_INVITE` when that is set.
- Off in hosted mode: `/api/render` with `data` (the composer), the `.aurora/views` folder watcher, opening a browser.

## Review Focus

1. A key from workspace A used on workspace B's view id (render, patch, status, look, share) → 404, never the view. Pinned in Task 3.
2. A dataset or media path outside the workspace folder (`/etc/passwd`, `../other/ws`, a symlink) in hosted mode → a problem naming uploads, nothing read. Pinned in Task 6.
3. A revoked or malformed share token, or one whose workspace prefix doesn't match its stored token → the viewer gets "this link doesn't work", no view data over the socket. Pinned in Task 4.
4. A share viewer sending `patch`, `revert`, `pickVariant` or `event` messages over the socket → ignored. Pinned in Task 4.
5. Two viewers of one shared view moving the same filter → each sees only their own results; the author's value stays the default. Pinned in Task 7.

---

### Task 1: Hosted config and workspace keys

**Files:**
- Create: `packages/server/src/hosted/config.ts`, `packages/server/src/hosted/keys.ts`
- Test: `packages/server/test/hosted-keys.test.ts`

**Interfaces:**
- Produces: `type HostedConfig = { secret: string; publicUrl: string; dataDir: string; invite?: string }`; `loadHostedConfig(env: Record<string, string | undefined>): HostedConfig | undefined` (undefined unless `AURORA_MODE=hosted`; throws a clear error when secret or public URL is missing or the secret is shorter than 32); `newWorkspaceId(): string`; `mintKey(secret: string, ws?: string): string`; `verifyKey(secret: string, token: string, denied?: ReadonlySet<string>): { ws: string } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
test("a minted key verifies to its workspace; a tampered, foreign or denied one doesn't", () => {
  const k = mintKey(S, "abcdefgh12345678");
  expect(verifyKey(S, k)).toEqual({ ws: "abcdefgh12345678" });
  expect(verifyKey(S + "x", k)).toBeNull();
  expect(verifyKey(S, k.slice(0, -2) + "aa")).toBeNull();
  expect(verifyKey(S, "not.a.jwt")).toBeNull();
  expect(verifyKey(S, k, new Set(["abcdefgh12345678"]))).toBeNull();
  expect(newWorkspaceId()).toMatch(/^[a-z0-9]{16}$/);
});
test("hosted config: off by default, strict when on", () => {
  expect(loadHostedConfig({})).toBeUndefined();
  expect(() => loadHostedConfig({ AURORA_MODE: "hosted" })).toThrow(/AURORA_SECRET/);
  expect(loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: S, AURORA_PUBLIC_URL: "https://a.example" })).toEqual({ secret: S, publicUrl: "https://a.example", dataDir: "/data", invite: undefined });
});
```

- [ ] **Step 2: Run** `npx vitest run packages/server/test/hosted-keys.test.ts` → FAIL (modules missing)
- [ ] **Step 3: Implement** both files (base64url header/payload, HMAC-SHA256 signature, `alg` must be `HS256`).
- [ ] **Step 4: Run** the test → PASS
- [ ] **Step 5: Commit** `feat(hosted): config and stateless workspace keys`

### Task 2: One core per workspace (refactor, no behaviour change)

**Files:**
- Create: `packages/server/src/core.ts`, `packages/server/src/hosted/tenants.ts`
- Modify: `packages/server/src/server.ts:121-160` (build the store/data/intake/screens through `createCore`; route handlers take a `Core`)
- Test: `packages/server/test/tenants.test.ts`; all existing `packages/server/test/*.test.ts` unchanged

**Interfaces:**
- Produces: `type Core = { store: ViewStore; data: DataRuntime; intake: Intake; clients: Set<WebSocket>; captures: Set<WebSocket>; broadcast(e: ViewEvent): void; close(): Promise<void> }`; `createCore(opts: { viewsDir: string; media: MediaRegistry; fonts: FontStore; open: (url: string) => void; baseUrl: () => string; waitMs?: number; dataRoot?: string }): Promise<Core>` (`dataRoot` is consumed in Task 6); `class Tenants { constructor(opts: { dataDir: string; make: (wsDir: string) => Promise<Core>; maxLive?: number /*50*/; idleMs?: number /*30 min*/ }); get(ws: string): Promise<Core>; dir(ws: string): string; closeAll(): Promise<void> }`.

- [ ] **Step 1: Write the failing test**

```ts
test("each workspace gets its own core and folder; idle ones close", async () => {
  const t = new Tenants({ dataDir: dir, make: fakeMake, idleMs: 50 });
  const a = await t.get("aaaaaaaaaaaaaaaa"), b = await t.get("bbbbbbbbbbbbbbbb");
  expect(a).not.toBe(b);
  expect(await t.get("aaaaaaaaaaaaaaaa")).toBe(a);
  expect(t.dir("aaaaaaaaaaaaaaaa")).toBe(path.join(dir, "ws", "aaaaaaaaaaaaaaaa"));
  await new Promise((r) => setTimeout(r, 120));
  expect(closed).toContain(a);
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `createCore` by moving the construction lines out of `startServer`; `startServer` in local mode makes exactly one core and passes it to every handler.
- [ ] **Step 4: Run** `npx vitest run` → the new test and all 419 existing tests PASS; run `cd packages/renderer && npx playwright test` → all PASS
- [ ] **Step 5: Commit** `refactor(server): a core factory, one per workspace in hosted mode`

### Task 3: Hosted HTTP API: bearer keys, key minting, host check, hosted-off switches

**Files:**
- Create: `packages/server/src/hosted/auth.ts`
- Modify: `packages/server/src/server.ts` (in hosted mode: resolve the tenant from the bearer key for every `/api/*` route; `POST /api/keys`; allowed host = `AURORA_PUBLIC_URL`'s host plus `127.0.0.1` for in-process calls; composer route 404; no watcher; no browser opening; workspace ids in `<dataDir>/denied.json` are refused, re-read when the file changes), `packages/server/src/cli.ts` (read `loadHostedConfig`)
- Test: `packages/server/test/hosted-api.test.ts`

**Interfaces:**
- Consumes: Task 1 `mintKey`, `verifyKey`; Task 2 `Tenants`.
- Produces: `bearer(req: IncomingMessage): string | null`; `class RateLimit { constructor(limit: number, windowMs: number); take(key: string): boolean }`; `POST /api/keys {invite?} → {key, ws}`; every `/api/*` without a valid bearer → 401 `{error:"a workspace key is required: Authorization: Bearer <key>"}`.

- [ ] **Step 1: Write the failing tests**

```ts
test("no key → 401; a key sees only its own workspace", async () => {
  const s = await startHosted();
  expect((await s.fetch("/api/views", {})).status).toBe(401);
  const a = await s.mint(), b = await s.mint();
  expect((await s.post("/api/views", { view: v("x1") }, a)).status).toBe(200);
  expect((await s.get("/api/views/x1/status", b)).status).toBe(404);
  expect((await s.post("/api/views/x1/patch", { ops: [], baseVersion: 1 }, b)).status).toBe(404);
  expect((await s.post("/api/views/x1/look", {}, b)).status).toBe(404);
});
test("minting needs the invite when set, and is rate limited per IP", async () => {
  const s = await startHosted({ invite: "letmein" });
  expect((await s.post("/api/keys", {})).status).toBe(403);
  for (let i = 0; i < 5; i++) expect((await s.post("/api/keys", { invite: "letmein" })).status).toBe(200);
  expect((await s.post("/api/keys", { invite: "letmein" })).status).toBe(429);
});
test("a denied workspace's key stops working", async () => {
  const s = await startHosted(); const a = await s.mint();
  await writeFile(path.join(s.dataDir, "denied.json"), JSON.stringify([s.wsOf(a)]));
  await expect.poll(async () => (await s.get("/api/views", a)).status).toBe(401);
});
test("hosted mode: the composer is off and a key in the query string is ignored", async () => {
  const s = await startHosted(); const a = await s.mint();
  expect((await s.post("/api/render", { data: { inline: [{ a: 1 }] } }, a)).status).toBe(404);
  expect((await s.fetch(`/api/views?key=${a}`, {})).status).toBe(401);
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** the hosted branch in the router; `startHosted` test helper starts the server on port 0 with a temp `AURORA_DATA_DIR`.
- [ ] **Step 4: Run** `npx vitest run` → all PASS
- [ ] **Step 5: Commit** `feat(hosted): bearer workspace keys on the API, key minting, hosted-off switches`

### Task 4: Share links and the view-only viewer

**Files:**
- Create: `packages/server/src/hosted/shares.ts`
- Modify: `packages/server/src/server.ts` (render/patch/status results carry `url: <publicUrl>/v/<token>` in hosted mode; `POST /api/views/:id/share {rotate?:true}`; WebSocket `/ws?share=<token>` joins that tenant's view read-only), `packages/server/src/intake.ts` (`baseUrl` for links comes from the core), `packages/renderer/src/App.tsx` (path `/v/<token>`: open the socket with `share`, show only that view, hide the version picker, variants and edit affordances; an unknown link shows "This link doesn't work")
- Test: `packages/server/test/hosted-shares.test.ts`, `packages/renderer/e2e/hosted.spec.ts` (first test)

**Interfaces:**
- Produces: `class Shares { constructor(wsDir: string); linkFor(viewId: string): Promise<string>; rotate(viewId: string): Promise<string>; resolve(token: string): Promise<string | null> }`; `wsOfToken(token: string): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
test("a share link resolves to its view; a rotated, foreign or malformed one doesn't", async () => {
  const sh = new Shares(wsDir);
  const t = await sh.linkFor("x1");
  expect(t).toMatch(/^[a-z0-9]{16}_[0-9a-f]{32}$/);
  expect(await sh.resolve(t)).toBe("x1");
  const t2 = await sh.rotate("x1");
  expect(await sh.resolve(t)).toBeNull();
  expect(await sh.resolve(t2)).toBe("x1");
  expect(await sh.resolve("zzzzzzzzzzzzzzzz_" + "0".repeat(32))).toBeNull();
  expect(wsOfToken("../x_y")).toBeNull();
});
test("a share socket gets the view and ignores edit messages", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const ws = await s.viewer(new URL(url).pathname.split("/v/")[1]);
  expect(ws.events.some((e) => e.t === "view" && e.viewId === "x1")).toBe(true);
  ws.send({ t: "pickVariant", viewId: "x1", index: 0 }); ws.send({ t: "revertItem", viewId: "x1", itemId: "i", version: 1 });
  expect((await (await s.get("/api/views/x1/status", a)).json()).version).toBe(1);
});
```

Browser (`hosted.spec.ts`): `/v/<token>` shows the view title; `/v/<rotated token>` shows "This link doesn't work".

- [ ] **Step 2: Run** both → FAIL
- [ ] **Step 3: Implement** (`shares.json` in the workspace folder maps token → viewId; constant-time compare of the random part).
- [ ] **Step 4: Run** `npx vitest run` and `npx playwright test e2e/hosted.spec.ts` → PASS
- [ ] **Step 5: Commit** `feat(hosted): view-only share links`

### Task 5: MCP over Streamable HTTP at `/mcp`

**Files:**
- Create: `packages/server/src/hosted/mcpHttp.ts`
- Modify: `packages/server/src/mcp.ts` (`createAuroraMcpServer` accepts `headers?: Record<string,string>` added to every forwarded call, and `hosted?: true`, which drops the `compose` tool and describes datasets as inline or uploaded), `packages/server/src/server.ts` (route `POST|GET|DELETE /mcp` in hosted mode)
- Test: `packages/server/test/hosted-mcp.test.ts`

**Interfaces:**
- Consumes: Task 3 `bearer`, `verifyKey`; today's `createAuroraMcpServer`.
- Produces: `handleMcp(req: IncomingMessage, res: ServerResponse, ctx: { key: string; internalBase: string }): Promise<void>` (stateless transport: `sessionIdGenerator: undefined`; one MCP server per request, forwarding with `Authorization: Bearer <key>` to `internalBase`).

- [ ] **Step 1: Write the failing test**

```ts
test("an MCP client over HTTP with a bearer key renders a view and gets a share link", async () => {
  const s = await startHosted(); const key = await s.mint();
  const client = new Client({ name: "t", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(s.base + "/mcp"), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["render", "patch", "status", "look", "upload"]));
  expect(tools).not.toContain("compose");
  const r = await client.callTool({ name: "render", arguments: { view: v("m1") } });
  expect(JSON.stringify(r.content)).toContain("/v/");
});
test("/mcp without a key is 401", async () => {
  const s = await startHosted();
  expect((await s.fetch("/mcp", { method: "POST", body: "{}" })).status).toBe(401);
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** (`upload` tool is defined here and backed by Task 6's route; until Task 6 lands it returns an error).
- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** `feat(hosted): MCP over Streamable HTTP with bearer keys`

### Task 6: Uploads, and data confined to the workspace

**Files:**
- Create: `packages/server/src/hosted/uploads.ts`
- Modify: `packages/server/src/dataRuntime.ts` (option `root?: string`: a dataset path outside it is a problem, not a read; symlinks resolved with `realpath` first), `packages/server/src/media.ts` (same `root` for local media), `packages/server/src/core.ts` (pass `dataRoot` = workspace folder in hosted mode), `packages/server/src/server.ts` (`POST /api/uploads?name=<file>` raw body), `packages/server/src/hosted/mcpHttp.ts` (`upload` tool: `{name, content_base64}` → `{path}`), `packages/server/src/skill/data.md` (one paragraph: on a hosted aurora, upload files first and use the returned path)
- Test: `packages/server/test/hosted-uploads.test.ts`

**Interfaces:**
- Produces: `saveUpload(wsDir: string, name: string, body: Buffer): Promise<{ path: string; bytes: number }>` (throws `UploadError` with status 400/413/507); `insideRoot(root: string, p: string): Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

```ts
test("an uploaded csv is queryable by the path the upload returns", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { path: p } = await (await s.upload("sales.csv", "region,amount\nEast,3\nWest,4\n", a)).json();
  const r = await (await s.post("/api/views", { view: { ...v("u1"), datasets: { d: p }, queries: { t: { sql: "SELECT sum(amount) AS total_amount FROM d" } } } }, a)).json();
  expect(r.problems.filter((x: { severity: string }) => x.severity === "error")).toEqual([]);
});
test("paths outside the workspace are refused, never read", async () => {
  const s = await startHosted(); const a = await s.mint();
  for (const bad of ["/etc/passwd", path.join(s.dataDir, "ws", "other0000000000a", "x.csv"), "../../x.csv"]) {
    const r = await (await s.post("/api/views", { view: { ...v("u2"), datasets: { d: bad } } }, a)).json();
    expect(JSON.stringify(r.problems)).toContain("upload");
  }
});
test("upload limits: bad name 400, over 25 MB 413", async () => {
  const s = await startHosted(); const a = await s.mint();
  expect((await s.upload("../x.csv", "a", a)).status).toBe(400);
  expect((await s.upload("big.csv", Buffer.alloc(25 * 1024 * 1024 + 1), a)).status).toBe(413);
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run` → all PASS (local mode has no `root`, so nothing changes there)
- [ ] **Step 5: Commit** `feat(hosted): uploads; hosted data stays inside the workspace`

### Task 7: Filter state per viewer

**Files:**
- Modify: `packages/server/src/intake.ts` (add `evaluateFor`), `packages/server/src/server.ts` (in hosted mode, a share socket's `param` message keeps that socket's own values and answers with `evaluateFor`; author changes through the API still call `setParam` and become the defaults new viewers open on)
- Test: `packages/server/test/hosted-params.test.ts`

**Interfaces:**
- Produces: `Intake.evaluateFor(viewId: string, params: Record<string, unknown>): Promise<ViewEvent[]>` (validates each value like `setParam`, runs only the queries that read the changed params, returns their `result` events and a `params` event, changes no shared state).

- [ ] **Step 1: Write the failing test**

```ts
test("two viewers move the same filter independently; the author's value stays the default", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { url } = await (await s.post("/api/views", { view: paramView("p1") }, a)).json();
  const token = new URL(url).pathname.split("/v/")[1];
  const v1 = await s.viewer(token), v2 = await s.viewer(token);
  v1.send({ t: "param", viewId: "p1", name: "cut", value: 8 });
  await v1.until((e) => e.t === "result" && e.result.rows[0].n === 2);
  expect(v2.events.filter((e) => e.t === "result").at(-1).result.rows[0].n).toBe(6);
  expect((await (await s.get("/api/views/p1/status", a)).json()).params.cut).toBe(4);
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** → PASS; local-mode `params.test.ts` still PASS (shared state there is unchanged)
- [ ] **Step 5: Commit** `feat(hosted): each viewer's filters are their own`

### Task 8: Screenshot gate: concurrency, queue, cache, rate limit

**Files:**
- Create: `packages/server/src/lookGate.ts`
- Modify: `packages/server/src/server.ts` (`/api/views/:id/look` runs through the gate in both modes; 503 + `Retry-After` when busy; 429 over the hourly limit in hosted mode)
- Test: `packages/server/test/lookGate.test.ts`

**Interfaces:**
- Produces: `class LookGate { constructor(opts?: { concurrency?: number /*2*/; maxQueue?: number /*8*/; perHour?: number /*30, hosted only*/; cacheSize?: number /*200*/ }); run<T>(ws: string, key: string, fn: () => Promise<T>): Promise<T> }`; `class BusyError extends Error { retryAfter: number }`; `class LimitError extends Error {}`. Cache key: `${viewId}@${version}:${JSON.stringify({ sizes, section })}`; a cache hit doesn't count against the limit.

- [ ] **Step 1: Write the failing tests**

```ts
test("at most 2 run at once, 8 wait, the rest are told to retry", async () => {
  const g = new LookGate();
  let live = 0, peak = 0;
  const job = () => g.run("w", Math.random().toString(), async () => { peak = Math.max(peak, ++live); await sleep(30); live--; return 1; });
  const all = Array.from({ length: 12 }, job).map((p) => p.catch((e) => e));
  const out = await Promise.all(all);
  expect(peak).toBe(2);
  expect(out.filter((x) => x instanceof BusyError)).toHaveLength(2);
});
test("the same view version and options come from the cache", async () => {
  const g = new LookGate(); let calls = 0;
  await g.run("w", "v@3:{}", async () => ++calls); await g.run("w", "v@3:{}", async () => ++calls);
  expect(calls).toBe(1);
});
test("a workspace's 31st look in an hour is refused", async () => {
  const g = new LookGate({ perHour: 30 });
  for (let i = 0; i < 30; i++) await g.run("w", `k${i}`, async () => 1);
  await expect(g.run("w", "k31", async () => 1)).rejects.toBeInstanceOf(LimitError);
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement**
- [ ] **Step 4: Run** `npx vitest run` → all PASS
- [ ] **Step 5: Commit** `feat: a screenshot gate (2 at a time, a short queue, a cache, an hourly limit when hosted)`

### Task 9: Container, TLS and the one-page guide

**Files:**
- Create: `Dockerfile`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/README.md`, `scripts/hosted-smoke.sh`
- Modify: `README.md` (section "Use a hosted aurora")

**Interfaces:**
- Consumes: everything above.
- Produces: `docker compose -f deploy/docker-compose.yml up -d` serving `https://aurora.<domain>`; `scripts/hosted-smoke.sh <base> <invite>` exits 0 when: a key mints, `/mcp` lists tools, a render returns a `/v/` link that answers 200, and a request without the key gets 401.

- [ ] **Step 1: Write** the Dockerfile: Node 22 slim, `npm ci`, renderer build, `npx playwright install --with-deps chromium`, `AURORA_MODE=hosted`, `CMD ["npx","tsx","packages/server/src/cli.ts","serve"]`, volume `/data`, port 4317. Caddyfile: `aurora.{$DOMAIN} { reverse_proxy aurora:4317 }` (WebSocket passes through). Compose: the two services, a named volume, env from `.env` (`AURORA_SECRET`, `AURORA_PUBLIC_URL`, `AURORA_INVITE`, `DOMAIN`).
- [ ] **Step 2: Run** `docker compose -f deploy/docker-compose.yml up -d --build` locally with `DOMAIN=localhost`, then `scripts/hosted-smoke.sh https://localhost <invite>` → exit 0
- [ ] **Step 3: Write** `deploy/README.md`: DNS A record for `aurora.<domain>`, `.env` values, first deploy, rotating the secret, backing up `/data`, and the client line: `claude mcp add --transport http aurora https://aurora.<domain>/mcp --header "Authorization: Bearer <key>"`
- [ ] **Step 4: Commit** `feat(hosted): container, TLS and the deploy guide`

### Task 10: End to end on the hosted build

**Files:**
- Modify: `packages/renderer/e2e/hosted.spec.ts`, `packages/renderer/playwright.config.ts` (a second web server project started with `AURORA_MODE=hosted` on another port and a temp data dir)

- [ ] **Step 1: Write the failing test** `hosted: a harness renders through /mcp, the share link draws it, another key can't touch it, a rotated link stops`: mint two keys through `/api/keys`; render a view with an uploaded csv through `/mcp` (SDK client); open the returned `/v/` link in the page and expect the title and a drawn chart; `GET /api/views/<id>/status` with the other key → 404; rotate the share; reload → "This link doesn't work"; `look` through `/mcp` returns at least one image.
- [ ] **Step 2: Run** `npx playwright test e2e/hosted.spec.ts` → FAIL until wired, then PASS
- [ ] **Step 3: Run** the whole suite: `npx vitest run` and `cd packages/renderer && npx playwright test` → all PASS (local mode untouched)
- [ ] **Step 4: Commit** `test(hosted): end to end through /mcp and a share link`
