import { afterEach, expect, test, vi } from "vitest";
import WebSocket from "ws";
import type { RenderEvent } from "@genui/spec";
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
  const events: RenderEvent[] = [];
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

test("render endpoint returns renderId and streams events over ws", async () => {
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const l = listen(srv.url);
  await l.open;
  const res = await post(srv.url, { data: fx("sales.csv"), intent: "rows" });
  expect(res.status).toBe(202);
  const { renderId, url } = await res.json();
  expect(url).toBe(`${srv.url}/#${renderId}`);
  await until(() => l.events.some((e) => e.t === "done" && e.renderId === renderId));
  expect(l.events.some((e) => e.t === "item" && e.item.id === "k_rows")).toBe(true);
  l.ws.close();
});

test("replays recent events to late client", async () => {
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  const { renderId } = await (await post(srv.url, { data: fx("sales.csv") })).json();
  await until(() => srv!.history().some((e) => e.t === "done" && e.renderId === renderId));
  const l = listen(srv.url);
  await until(() => l.events.some((e) => e.t === "done"));
  expect(l.events[0]).toMatchObject({ t: "start", renderId });
  l.ws.close();
});

test("concurrent renders stay isolated", async () => {
  srv = await startServer({ port: 0, provider: createFakeProvider(doc, { delayMs: 2 }), openBrowser: () => {} });
  const l = listen(srv.url);
  await l.open;
  const [a, b] = await Promise.all([post(srv.url, { data: fx("sales.csv") }), post(srv.url, { data: fx("awkward.csv") })]);
  const ra = (await a.json()).renderId, rb = (await b.json()).renderId;
  await until(() => [ra, rb].every((id) => l.events.some((e) => e.t === "done" && e.renderId === id)));
  const rowsFor = (id: string) => l.events.find((e) => e.t === "result" && e.renderId === id && e.queryId === "rows") as any;
  expect(rowsFor(ra).result.rows[0].n).toBe(240);
  expect(rowsFor(rb).result.rows[0].n).toBe(3);
  l.ws.close();
});

test("opens browser when no client connected", async () => {
  const open = vi.fn();
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: open });
  const { url } = await (await post(srv.url, { data: fx("sales.csv") })).json();
  expect(open).toHaveBeenCalledWith(url);
});

test("bad body returns 400", async () => {
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  expect((await post(srv.url, { intent: "x" })).status).toBe(400);
  expect((await fetch(srv.url + "/api/render", { method: "POST", body: "{nope" })).status).toBe(400);
});

test("health endpoint", async () => {
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {} });
  expect((await fetch(srv.url + "/api/health")).status).toBe(200);
});

test("loadConfig defaults and env overrides", () => {
  const c = loadConfig({ HOME: "/nonexistent" });
  expect(c).toEqual({ port: 4317, provider: "ollama", model: "qwen3:8b", ollamaUrl: "http://127.0.0.1:11434" });
  expect(loadConfig({ HOME: "/nonexistent", GENUI_MODEL: "x", GENUI_PORT: "9" })).toMatchObject({ model: "x", port: 9 });
});
