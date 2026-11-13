# Hosted aurora MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The smallest hosted aurora on Kush's domain that does two things: anyone with an invite can connect their Claude (or any MCP harness) to it, and anyone can share a view they made by link. Local mode unchanged.

**Architecture:** A hosted mode (`AURORA_MODE=hosted`) in the existing server. A workspace key (stateless JWT, sent as a bearer token) maps to a tenant: its own `ViewStore`, `DataRuntime` and `Intake` in its own folder, built by the factory local mode uses for its single core. MCP gains a stateless Streamable HTTP endpoint at `/mcp`; a view's share link `/v/<token>` opens it read-only on a socket pinned to that one view. Hosted data is inline only.

**Tech Stack:** Node 22, TypeScript, `@modelcontextprotocol/sdk` 1.32.2 (`StreamableHTTPServerTransport`, stateless), `ws`, DuckDB, vitest, Playwright, Docker, Caddy.

**Spec:** `docs/superpowers/specs/2026-11-08-hosted-aurora-design.md` (its "MVP scope" section governs; Kush cut scope to the two goals on 2026-11-10)

## Global Constraints

- Local mode (no `AURORA_MODE`) behaves exactly as today: every existing unit and browser test passes unchanged.
- Hosted env (all required except the data dir): `AURORA_MODE=hosted`, `AURORA_SECRET` (≥ 32 chars), `AURORA_PUBLIC_URL`, `AURORA_INVITE`, `AURORA_DATA_DIR` (default `/data`).
- Hosted mode listens on `0.0.0.0`; identity comes only from the bearer key or a share token, never from Host or source address.
- Workspace id: 16 chars `[a-z0-9]`. Key: JWT HS256 `{ws, iat}` with node `crypto` and `timingSafeEqual`; sent only as `Authorization: Bearer <key>`; never from a query string; never logged.
- `POST /api/keys {invite}` → `{key, ws}`; wrong or missing invite → 403. Revoking everyone = rotating `AURORA_SECRET`.
- Share token: `<wsId>_<32 lowercase hex>`, view-only, one per view, minted on first render; `POST /api/views/:id/share {rotate: true}` replaces it and closes sockets on the old one (close code 4401).
- Share sockets: pinned to one view (only that view's events; no `list`; `sync` only for that view; `rendered`, `revertItem`, `pickVariant`, `event` ignored). `param` messages are allowed and shared, as in local mode (known gap: viewers move each other's filters).
- Request bodies capped at 4 MB in hosted mode (413, read with early abort).
- Hosted data: inline datasets only. A path or `http(s)` dataset, `/api/profile` and local media paths → a problem saying hosted aurora takes inline data; nothing read or fetched. Media: `http(s)` URLs only.
- Off in hosted mode (404 or tool absent): the composer (`/api/render` with `data`, MCP `compose`), `/api/watch` and the MCP's call to it, `look`, `variants`, `events`, opening a browser. `/api/health` stays open.
- Render/patch/status results in hosted mode include `url: <AURORA_PUBLIC_URL>/v/<share token>` and don't wait for a screen.

## Known gaps (deliberately out of this MVP)

Uploads; per-viewer filter state; `look` on hosted; a screenshot queue; DuckDB memory/thread/time limits; workspace disk quota; mint rate limits; a deny-list for one key. Not planned: Claude.ai web login (Kush, 2026-11-12: the flow is Claude Code → MCP → aurora → a view link). Safe enough while invite-only; each is a later task.

## Review Focus

1. A key from workspace A on workspace B's view (status, patch, share) → 404, never data. Pinned in Task 3.
2. A dataset path (`/etc/passwd`, `../x`) or `http://169.254.169.254/` in hosted mode → a problem, nothing read or fetched. Pinned in Task 3.
3. A share socket receiving another view's events or the workspace list, or still receiving after rotation. Pinned in Task 4.
4. A share viewer's `rendered` report changing the author's problems or verification. Pinned in Task 4.
5. An MCP `GET /mcp` (SSE) left open forever, or a stateless transport reused across requests. Pinned in Task 5.

---

### Task 1: Hosted config and workspace keys

**Files:** Create `packages/server/src/hosted/config.ts`, `packages/server/src/hosted/keys.ts`; Test `packages/server/test/hosted-keys.test.ts`

**Interfaces:**
- Produces: `type HostedConfig = { secret: string; publicUrl: string; dataDir: string; invite: string }`; `loadHostedConfig(env: Record<string, string | undefined>): HostedConfig | undefined` (undefined unless `AURORA_MODE=hosted`; throws naming the missing variable or a short secret); `newWorkspaceId(): string`; `mintKey(secret: string, ws?: string): string`; `verifyKey(secret: string, token: string): { ws: string } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
test("keys verify to their workspace; tampered or foreign-secret ones don't", () => {
  const k = mintKey(S, "abcdefgh12345678");
  expect(verifyKey(S, k)).toEqual({ ws: "abcdefgh12345678" });
  expect(verifyKey(S + "x", k)).toBeNull();
  expect(verifyKey(S, k.slice(0, -2) + "aa")).toBeNull();
  expect(verifyKey(S, "not.a.jwt")).toBeNull();
  expect(newWorkspaceId()).toMatch(/^[a-z0-9]{16}$/);
});
test("hosted config: off by default; requires secret, public url and invite", () => {
  expect(loadHostedConfig({})).toBeUndefined();
  expect(() => loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: S, AURORA_PUBLIC_URL: "https://a.example" })).toThrow(/AURORA_INVITE/);
  expect(() => loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: "short", AURORA_PUBLIC_URL: "https://a.example", AURORA_INVITE: "i" })).toThrow(/AURORA_SECRET/);
  expect(loadHostedConfig({ AURORA_MODE: "hosted", AURORA_SECRET: S, AURORA_PUBLIC_URL: "https://a.example", AURORA_INVITE: "i" })).toEqual({ secret: S, publicUrl: "https://a.example", dataDir: "/data", invite: "i" });
});
```
(`S` = a 40-char test secret.)

- [ ] **Step 2:** `npx vitest run packages/server/test/hosted-keys.test.ts` → FAIL
- [ ] **Step 3:** Implement (base64url JSON header/payload, HMAC-SHA256; header `alg` must be `HS256`).
- [ ] **Step 4:** Run → PASS
- [ ] **Step 5:** Commit `feat(hosted): config and workspace keys`

### Task 2: One core per workspace (refactor, no behaviour change)

**Files:** Create `packages/server/src/core.ts`, `packages/server/src/hosted/tenants.ts`; Modify `packages/server/src/server.ts:121-160` (construction moves into `createCore`; route handlers and the WebSocket server take a `Core`); Test `packages/server/test/tenants.test.ts`; all existing tests unchanged

**Interfaces:**
- Produces: `type Core = { ws: string; dir: string; store: ViewStore; data: DataRuntime; intake: Intake; clients: Set<WebSocket>; captures: Set<WebSocket>; broadcast(e: ViewEvent): void; close(): Promise<void> }`; `createCore(opts: { ws: string; dir: string; media: MediaRegistry; fonts: FontStore; open: (url: string) => void; baseUrl: () => string; waitMs?: number; hosted?: boolean }): Promise<Core>` (local: `ws: "local"`, `dir` = today's views dir); `class Tenants { constructor(opts: { dataDir: string; make: (ws: string, dir: string) => Promise<Core> }); get(ws: string): Promise<Core>; dir(ws: string): string; closeAll(): Promise<void> }` (cores live for the process; no eviction in the MVP).

- [ ] **Step 1: Write the failing test** `each workspace gets its own core in its own folder` — two `get`s with different ids return distinct cores; the same id returns the same core; `dir(id)` is `<dataDir>/ws/<id>`; concurrent `get`s of one id create it once.
- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement; local mode builds exactly one core and passes it everywhere.
- [ ] **Step 4:** `npx vitest run` → new + all existing PASS; `cd packages/renderer && npx playwright test` → all PASS
- [ ] **Step 5:** Commit `refactor(server): a core factory, one per workspace when hosted`

### Task 3: Hosted HTTP: bearer keys, invite minting, isolation, inline-only data, off-switches

**Files:** Create `packages/server/src/hosted/auth.ts`; Modify `packages/server/src/server.ts` (hosted branch: listen `0.0.0.0`; `POST /api/keys`; every `/api/*` except `/api/health` and `/api/keys` resolves the tenant from the bearer key; 4 MB body cap; off-switches), `packages/server/src/intake.ts` / `packages/server/src/dataRuntime.ts` (option `inlineOnly`: path and http(s) datasets become problems, never loaded), `packages/server/src/media.ts` (hosted: local paths refused), `packages/server/src/mcp.ts` (no `/api/watch` call when `hosted`), `packages/server/src/cli.ts` (`loadHostedConfig`); Test `packages/server/test/hosted-api.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2.
- Produces: `bearer(req: IncomingMessage): string | null`; `readBody(req, maxBytes): Promise<Buffer>` (413 as soon as the limit passes); a test helper `startHosted(opts?)` in `packages/server/test/hosted-helpers.ts` with `fetch`, `get`, `post`, `req`, `mint`, `base`, `dataDir` (later tasks extend it).

- [ ] **Step 1: Write the failing tests**

```ts
test("no key → 401; a key sees only its own workspace", async () => {
  const s = await startHosted(); const a = await s.mint(), b = await s.mint();
  expect((await s.fetch("/api/views", {})).status).toBe(401);
  expect((await s.post("/api/views", { view: v("x1") }, a)).status).toBe(200);
  expect((await s.get("/api/views/x1/status", b)).status).toBe(404);
  expect((await s.post("/api/views/x1/patch", { ops: [], baseVersion: 1 }, b)).status).toBe(404);
  expect((await s.fetch(`/api/views?key=${a}`, {})).status).toBe(401);
});
test("keys need the invite", async () => {
  const s = await startHosted({ invite: "letmein" });
  expect((await s.post("/api/keys", {})).status).toBe(403);
  expect((await s.post("/api/keys", { invite: "nope" })).status).toBe(403);
  expect((await (await s.post("/api/keys", { invite: "letmein" })).json()).key).toBeTruthy();
});
test("hosted data is inline only: no files, no network", async () => {
  const s = await startHosted(); const a = await s.mint();
  for (const bad of ["/etc/passwd", "../../x.csv", "http://169.254.169.254/latest/meta-data/"]) {
    const r = await (await s.post("/api/views", { view: { ...v("d1"), datasets: { d: bad } } }, a)).json();
    expect(JSON.stringify(r.problems), bad).toMatch(/inline/);
  }
  const ok = await (await s.post("/api/views", { view: { ...v("d2"), datasets: { d: { inline: [{ a: 1 }] } }, queries: { q: { sql: "SELECT sum(a) AS total FROM d" } } } }, a)).json();
  expect(ok.problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
});
test("off-switches, open health, body cap", async () => {
  const s = await startHosted(); const a = await s.mint();
  expect((await s.fetch("/api/health", {})).status).toBe(200);
  expect((await s.post("/api/watch", { dir: "/" }, a)).status).toBe(404);
  expect((await s.post("/api/render", { data: { inline: [{ a: 1 }] } }, a)).status).toBe(404);
  expect((await s.post("/api/views/x/look", {}, a)).status).toBe(404);
  expect((await s.fetch("/api/views", { method: "POST", headers: { authorization: `Bearer ${a}` }, body: "x".repeat(4 * 1024 * 1024 + 1) })).status).toBe(413);
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement (`startHosted`: port 0, temp data dir, test secret and invite).
- [ ] **Step 4:** `npx vitest run` → all PASS
- [ ] **Step 5:** Commit `feat(hosted): bearer keys, invite minting, workspace isolation, inline-only data`

### Task 4: Share links on sockets pinned to one view

**Files:** Create `packages/server/src/hosted/shares.ts`; Modify `packages/server/src/server.ts` (results carry `url`; `POST /api/views/:id/share`; WebSocket `/ws?share=<token>` → that tenant, pinned; outgoing filter; ignored message types; rotation closes old sockets with 4401), `packages/server/src/intake.ts` (hosted: don't wait for a screen), `packages/renderer/src/App.tsx` + `packages/renderer/src/ws.ts` (path `/v/<token>`: socket with `share`; one read-only view; no version picker, variants or edit affordances; close 4401 or an unknown link → "This link doesn't work"); Test `packages/server/test/hosted-shares.test.ts`, `packages/renderer/e2e/hosted.spec.ts` (+ a hosted web server in `packages/renderer/playwright.config.ts`)

**Interfaces:**
- Produces: `class Shares { constructor(wsDir: string); linkFor(viewId: string): Promise<string>; rotate(viewId: string): Promise<string>; resolve(token: string): Promise<string | null> }`; `wsOfToken(token: string): string | null`; `shareOutgoing(viewId: string, e: ViewEvent): boolean`; helper additions `viewer(token)` (a test socket with `events`, `send`, `until`, `closedWith`) and `tokenOf(url)`.

- [ ] **Step 1: Write the failing tests**

```ts
test("a share link resolves to its view; rotated, foreign or malformed ones don't", async () => {
  const sh = new Shares(wsDir);
  const t = await sh.linkFor("x1");
  expect(t).toMatch(/^[a-z0-9]{16}_[0-9a-f]{32}$/);
  expect(await sh.linkFor("x1")).toBe(t);
  const t2 = await sh.rotate("x1");
  expect(await sh.resolve(t)).toBeNull();
  expect(await sh.resolve(t2)).toBe("x1");
  expect(wsOfToken("../x_y")).toBeNull();
});
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
  expect(sock.events.some((e) => e.t === "view" && e.viewId === "x1")).toBe(true);
});
test("viewer reports and edits are ignored; rotation closes open sockets", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const sock = await s.viewer(tokenOf(url));
  for (const m of [{ t: "rendered", viewId: "x1", version: 1, ok: false, problems: [{ severity: "error", message: "fake" }] }, { t: "pickVariant", viewId: "x1", index: 0 }, { t: "revertItem", viewId: "x1", itemId: "i", version: 1 }]) sock.send(m);
  await sleep(200);
  const st = await (await s.get("/api/views/x1/status", a)).json();
  expect(st.version).toBe(1);
  expect(JSON.stringify(st.problems)).not.toContain("fake");
  await s.post("/api/views/x1/share", { rotate: true }, a);
  await expect.poll(() => sock.closedWith).toBe(4401);
});
```

Browser (`hosted.spec.ts`): mint a key, render a view through the API, open its `/v/<token>`: the title shows and no version picker; rotate; reload: "This link doesn't work".

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement (`shares.json` per workspace; constant-time compare of the random part).
- [ ] **Step 4:** `npx vitest run`; `cd packages/renderer && npx playwright test e2e/hosted.spec.ts` → PASS
- [ ] **Step 5:** Commit `feat(hosted): view-only share links on pinned sockets`

### Task 5: MCP over Streamable HTTP at `/mcp`

**Files:** Create `packages/server/src/hosted/mcpHttp.ts`; Modify `packages/server/src/mcp.ts` (`createAuroraMcpServer` accepts `headers?: Record<string, string>` added to each forwarded call and `hosted?: true`, which drops `compose`, `look`, `variants` and `events` and tells the model data must be inline), `packages/server/src/server.ts` (`POST /mcp` in hosted mode; `GET`/`DELETE /mcp` → 405); Test `packages/server/test/hosted-mcp.test.ts`

**Interfaces:**
- Consumes: Task 3 `bearer`, `verifyKey`.
- Produces: `handleMcp(req: IncomingMessage, res: ServerResponse, ctx: { key: string; internalBase: string }): Promise<void>` — a fresh `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` and MCP server per request, both closed when `res` closes; forwards with `Authorization: Bearer <key>` to `internalBase` (`http://127.0.0.1:<port>`; auth still by the key).

- [ ] **Step 1: Write the failing tests**

```ts
test("an MCP client over HTTP renders with a bearer key and gets a share link", async () => {
  const s = await startHosted(); const key = await s.mint();
  const client = new Client({ name: "t", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(s.base + "/mcp"), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["render", "patch", "status"]));
  for (const off of ["compose", "look", "variants", "events"]) expect(tools).not.toContain(off);
  const r = await client.callTool({ name: "render", arguments: { view: v("m1") } });
  expect(JSON.stringify(r.content)).toContain("/v/");
});
test("/mcp: no key 401; GET and DELETE 405", async () => {
  const s = await startHosted();
  expect((await s.fetch("/mcp", { method: "POST", body: "{}" })).status).toBe(401);
  expect((await s.fetch("/mcp", { method: "GET" })).status).toBe(405);
  expect((await s.fetch("/mcp", { method: "DELETE" })).status).toBe(405);
});
```

- [ ] **Step 2:** Run → FAIL
- [ ] **Step 3:** Implement
- [ ] **Step 4:** `npx vitest run` → all PASS
- [ ] **Step 5:** Commit `feat(hosted): MCP over Streamable HTTP with bearer keys`

### Task 6: Container, TLS, guide, and the end-to-end check

**Files:** Create `Dockerfile`, `deploy/Caddyfile`, `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/README.md`, `scripts/hosted-smoke.sh`; Modify `README.md` (a short "Use a hosted aurora" section), `packages/renderer/e2e/hosted.spec.ts` (the end-to-end test)

**Interfaces:**
- Produces: `docker compose -f deploy/docker-compose.yml up -d` → `https://aurora.<DOMAIN>`; `scripts/hosted-smoke.sh <base> <invite>` exits 0 when a key mints, `/mcp` lists tools, a render through `/mcp` returns a `/v/` link that answers 200, and a request without a key gets 401.

- [ ] **Step 1: Write the failing end-to-end test** `hosted: a harness renders through /mcp; the share link draws it in a browser; another key can't read it` (SDK client over `/mcp` renders a view with an inline dataset and a chart; the page opens the returned link and shows the title and a drawn chart; `GET /api/views/<id>/status` with a second key → 404).
- [ ] **Step 2:** `cd packages/renderer && npx playwright test e2e/hosted.spec.ts` → PASS once Tasks 1–5 are wired
- [ ] **Step 3:** Write the deploy files: Dockerfile (Node 22 slim; `npm ci`; renderer build; non-root `aurora` user owning `/data`; `ENV AURORA_MODE=hosted`; `CMD ["npx","tsx","packages/server/src/cli.ts","serve"]`; healthcheck on `/api/health`; no Chromium — `look` is off); Caddyfile `aurora.{$DOMAIN} { reverse_proxy aurora:4317 }`; compose with both services, a named volume on `/data`, env from `.env`; `.env.example` listing `DOMAIN`, `AURORA_SECRET`, `AURORA_PUBLIC_URL`, `AURORA_INVITE`.
- [ ] **Step 4:** If Docker is available: `docker compose -f deploy/docker-compose.yml up -d --build` with `DOMAIN=localhost`, then `scripts/hosted-smoke.sh https://localhost <invite>` → exit 0. Otherwise run the smoke script against a hosted server started with `AURORA_MODE=hosted npx tsx packages/server/src/cli.ts serve` → exit 0.
- [ ] **Step 5:** `deploy/README.md`: the DNS A record, `.env` values, deploy, rotating the secret (logs everyone out), backing up `/data`, getting a key (`curl -X POST https://aurora.<domain>/api/keys -d '{"invite":"…"}'`), and the client line `claude mcp add --transport http aurora https://aurora.<domain>/mcp --header "Authorization: Bearer <key>"`.
- [ ] **Step 6:** Whole suite: `npx vitest run` and `cd packages/renderer && npx playwright test` → all PASS
- [ ] **Step 7:** Commit `feat(hosted): container, TLS, deploy guide and end-to-end check`
