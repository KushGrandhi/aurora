import { afterEach, expect, test, vi } from "vitest";
import WebSocket from "ws";
import type { ViewEvent } from "@genui/spec";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createFakeProvider } from "@genui/engine";
import { startServer } from "../src/server.ts";
import { loadConfig } from "../src/config.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures", n);
const doc = {
  title: "T",
  parts: [
    { kind: "query", id: "rows", sql: "SELECT count(*) AS n FROM data" },
    { kind: "item", item: { id: "k_rows", span: 3, c: { type: "kpi", query: "rows", field: "n", label: "Rows" } } },
  ],
};

let srv: Awaited<ReturnType<typeof startServer>> | undefined;
afterEach(async () => { await srv?.close(); srv = undefined; });

function listen(url: string) {
  const events: ViewEvent[] = [];
  const ws = new WebSocket(url.replace("http", "ws") + "/ws");
  ws.on("message", (m) => events.push(JSON.parse(String(m))));
  return { ws, events, open: new Promise((r) => ws.once("open", r)) };
}
const until = async (fn: () => boolean, ms = 3000) => {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 10)); }
};
const post = (url: string, body: unknown) =>
  fetch(url + "/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const done = (events: ViewEvent[], id: string) => events.some((e) => e.t === "activity" && e.viewId === id && e.text === "");

test("render endpoint returns renderId and streams events over ws", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const l = listen(srv.url);
  await l.open;
  const res = await post(srv.url, { data: fx("sales.csv"), intent: "rows" });
  expect(res.status).toBe(202);
  const { renderId, url } = await res.json();
  expect(url).toBe(`${srv.url}/#${renderId}`);
  await until(() => done(l.events, renderId));
  expect(l.events.some((e) => e.t === "patch" && e.changed.includes("k_rows"))).toBe(true);
  l.ws.close();
});

test("replays recent views to late client", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const first = listen(srv.url);
  await first.open;
  const { renderId } = await (await post(srv.url, { data: fx("sales.csv") })).json();
  await until(() => done(first.events, renderId));
  first.ws.close();
  const l = listen(srv.url);
  await until(() => l.events.some((e) => e.t === "view" && e.viewId === renderId && e.view.sections[0].items.some((i) => i.id === "k_rows")));
  expect(l.events[0]).toMatchObject({ t: "list" });
  l.ws.close();
});

test("concurrent renders stay isolated", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc, { delayMs: 2 }), openBrowser: () => {} });
  const l = listen(srv.url);
  await l.open;
  const [a, b] = await Promise.all([post(srv.url, { data: fx("sales.csv") }), post(srv.url, { data: fx("awkward.csv") })]);
  const ra = (await a.json()).renderId, rb = (await b.json()).renderId;
  await until(() => [ra, rb].every((id) => done(l.events, id) && l.events.some((e) => e.t === "result" && e.viewId === id && e.queryId === "rows")));
  const rowsFor = (id: string) => l.events.find((e) => e.t === "result" && e.viewId === id && e.queryId === "rows") as any;
  expect(Number(rowsFor(ra).result.rows[0].n)).toBe(240);
  expect(Number(rowsFor(rb).result.rows[0].n)).toBe(3);
  l.ws.close();
});

test("opens browser when no client connected", async () => {
  const open = vi.fn();
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: open });
  const { url } = await (await post(srv.url, { data: fx("sales.csv") })).json();
  expect(open).toHaveBeenCalledWith(url);
});

test("bad body returns 400", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  expect((await post(srv.url, { intent: "x" })).status).toBe(400);
  expect((await fetch(srv.url + "/api/render", { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" })).status).toBe(400);
});

test("health endpoint", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  expect((await fetch(srv.url + "/api/health")).status).toBe(200);
});

test("loadConfig defaults to the Claude Code subscription, with env overrides", async () => {
  const { providerFromConfig } = await import("../src/config.ts");
  const c = loadConfig({ HOME: "/nonexistent" });
  expect(c).toEqual({ port: 4317, provider: "claude", ollamaUrl: "http://127.0.0.1:11434" });
  expect(providerFromConfig(c).name).toBe("claude:sonnet");
  expect(loadConfig({ HOME: "/nonexistent", GENUI_MODEL: "x", GENUI_PORT: "9" })).toMatchObject({ model: "x", port: 9 });
  expect(providerFromConfig(loadConfig({ HOME: "/nonexistent", GENUI_PROVIDER: "ollama" })).name).toBe("ollama:qwen3:8b");
});

// C2: cross-site protection
test("rejects render without JSON content-type", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const r = await fetch(srv.url + "/api/render", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ data: fx("sales.csv") }) });
  expect(r.status).toBe(415);
});

test("rejects foreign Origin and Host", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const body = JSON.stringify({ data: fx("sales.csv") });
  const h = { "content-type": "application/json" };
  expect((await fetch(srv.url + "/api/render", { method: "POST", headers: { ...h, origin: "https://evil.example" }, body })).status).toBe(403);
  const { request } = await import("node:http");
  const status = await new Promise<number>((resolve) => {
    const port = new URL(srv!.url).port;
    const req = request({ host: "127.0.0.1", port, path: "/api/health", headers: { host: "evil.example" } }, (res) => resolve(res.statusCode!));
    req.end();
  });
  expect(status).toBe(403);
});

test("rejects websocket from foreign origin", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const ws = new WebSocket(srv.url.replace("http", "ws") + "/ws", { origin: "https://evil.example" });
  const outcome = await new Promise<string>((r) => { ws.on("open", () => r("open")); ws.on("error", () => r("rejected")); });
  expect(outcome).toBe("rejected");
});

test("allows same-origin websocket and render", async () => {
  srv = await startServer({ viewsDir: await mkdtemp(path.join(tmpdir(), "genui-srv-")), waitMs: 10, port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const ws = new WebSocket(srv.url.replace("http", "ws") + "/ws", { origin: srv.url });
  expect(await new Promise<string>((r) => { ws.on("open", () => r("open")); ws.on("error", () => r("rejected")); })).toBe("open");
  ws.close();
  const r = await fetch(srv.url + "/api/render", { method: "POST", headers: { "content-type": "application/json", origin: srv.url }, body: JSON.stringify({ data: fx("sales.csv") }) });
  expect(r.status).toBe(202);
});

test("config selects an OpenAI-compatible router", async () => {
  const { providerFromConfig } = await import("../src/config.ts");
  const c = loadConfig({ HOME: "/nonexistent", GENUI_PROVIDER: "openai", GENUI_BASE_URL: "http://localhost:8000/v1", GENUI_MODEL: "auto", GENUI_API_KEY: "k" });
  expect(c).toMatchObject({ provider: "openai", baseUrl: "http://localhost:8000/v1", model: "auto", apiKey: "k" });
  expect(providerFromConfig(c).name).toBe("auto");
});

test("openai provider requires a base URL", async () => {
  const { providerFromConfig } = await import("../src/config.ts");
  expect(() => providerFromConfig(loadConfig({ HOME: "/nonexistent", GENUI_PROVIDER: "openai" }))).toThrow(/baseUrl/);
});
