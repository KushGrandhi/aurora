import { afterEach, beforeEach, expect, test } from "vitest";
import WebSocket from "ws";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { View, ViewEvent } from "@genui/spec";
import { createFakeProvider } from "@genui/engine";
import { startServer } from "../src/server.ts";

const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures", n);
let dir: string;
let srv: Awaited<ReturnType<typeof startServer>> | undefined;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "genui-api-")); });
afterEach(async () => { await srv?.close(); srv = undefined; await rm(dir, { recursive: true, force: true }); });

const doc = { title: "T", parts: [
  { kind: "query", id: "rows", sql: "SELECT count(*) AS n FROM data" },
  { kind: "item", item: { id: "k_rows", span: 3, c: { type: "kpi", query: "rows", field: "n", label: "Rows" } } },
] };
const start = () => startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {}, viewsDir: dir, waitMs: 20 });
const until = async (fn: () => boolean, ms = 3000) => {
  const t = Date.now();
  while (!fn()) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 10)); }
};
const send = (base: string, p: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
function listen(url: string) {
  const events: ViewEvent[] = [];
  const ws = new WebSocket(url.replace("http", "ws") + "/ws");
  ws.on("message", (m) => events.push(JSON.parse(String(m))));
  return { ws, events, open: new Promise((r) => ws.once("open", r)) };
}
const view = (): View => ({ v: 2, id: "demo", title: "Demo", datasets: { data: fx("sales.csv") }, queries: { total: { sql: "SELECT sum(revenue) AS v FROM data" } },
  sections: [{ id: "main", layout: "grid", items: [{ id: "k", span: 4, c: { type: "kpi", query: "total", field: "v", label: "Revenue" } }] }] });

test("render then patch over HTTP", async () => {
  srv = await start();
  const r = await send(srv.url, "/api/views", { view: view() });
  expect(r.status).toBe(200);
  const body = await r.json();
  expect(body).toMatchObject({ viewId: "demo", version: 1, url: `${srv.url}/#demo` });
  const p = await (await send(srv.url, "/api/views/demo/patch", { ops: [{ op: "set", title: "Demo 2" }], baseVersion: 1 })).json();
  expect(p.version).toBe(2);
  const cur = await (await fetch(srv.url + "/api/views/demo")).json();
  expect(cur.view.title).toBe("Demo 2");
  expect((await send(srv.url, "/api/views/demo/patch", { ops: [{ op: "explode" }] })).status).toBe(400);
  expect((await send(srv.url, "/api/views/ghost/patch", { ops: [] })).status).toBe(404);
  expect((await send(srv.url, "/api/views", { view: { v: 2 } })).status).toBe(400);
});

test("status reports problems", async () => {
  srv = await start();
  const v = view();
  v.sections[0].items.push({ id: "bad", c: { type: "hologram" } });
  await send(srv.url, "/api/views", { view: v });
  const s = await (await fetch(srv.url + "/api/views/demo/status")).json();
  expect(s.version).toBe(1);
  expect(s.problems.some((p: { itemId?: string }) => p.itemId === "bad")).toBe(true);
  expect(s.unverified.sort()).toEqual(["bad", "k"]);
});

test("history and pick", async () => {
  srv = await start();
  await send(srv.url, "/api/views", { view: view() });
  await send(srv.url, "/api/views/demo/patch", { ops: [{ op: "set", title: "Changed" }] });
  const h = await (await fetch(srv.url + "/api/views/demo/history")).json();
  expect(h.map((x: { version: number }) => x.version)).toEqual([1, 2]);
  const p = await (await send(srv.url, "/api/views/demo/pick", { version: 1 })).json();
  expect(p.version).toBe(3);
  expect((await (await fetch(srv.url + "/api/views/demo")).json()).view.title).toBe("Demo");
  const list = await (await fetch(srv.url + "/api/views")).json();
  expect(list[0]).toMatchObject({ id: "demo", version: 3 });
  const v2 = await (await fetch(srv.url + "/api/views/demo/versions/2")).json();
  expect(v2.view.title).toBe("Changed");
  expect((await fetch(srv.url + "/api/views/demo/versions/99")).status).toBe(404);
  const rv = await send(srv.url, "/api/views/demo/revert", { itemId: "k", version: 1 });
  expect(rv.status).toBe(200);
});

test("profile endpoint", async () => {
  srv = await start();
  const p = await (await send(srv.url, "/api/profile", { data: fx("sales.csv") })).json();
  expect(p.datasets[0].name).toBe("data");
  expect((await send(srv.url, "/api/profile", { data: 5 })).status).toBe(400);
});

test("ws gets list and views on connect", async () => {
  srv = await start();
  await send(srv.url, "/api/views", { view: view() });
  const l = listen(srv.url);
  await until(() => l.events.some((e) => e.t === "problems"));
  expect(l.events.map((e) => e.t).slice(0, 2)).toEqual(["hello", "list"]);
  expect(l.events.some((e) => e.t === "view" && e.viewId === "demo")).toBe(true);
  expect(l.events.some((e) => e.t === "result" && e.viewId === "demo")).toBe(true);
  l.ws.close();
});

test("ws pick message changes current", async () => {
  srv = await start();
  await send(srv.url, "/api/views", { view: view() });
  await send(srv.url, "/api/views/demo/patch", { ops: [{ op: "set", title: "Changed" }] });
  const l = listen(srv.url);
  await l.open;
  l.ws.send(JSON.stringify({ t: "pick", viewId: "demo", version: 1 }));
  await until(() => l.events.some((e) => e.t === "view" && e.version === 3));
  expect((await (await fetch(srv.url + "/api/views/demo")).json()).version).toBe(3);
  l.ws.send(JSON.stringify({ t: "rendered", viewId: "demo", version: 3, ok: ["k"], failed: [] }));
  await until(() => false, 100).catch(() => {});
  expect((await (await fetch(srv.url + "/api/views/demo/status")).json()).unverified).toEqual([]);
  l.ws.send("not json");
  l.ws.send(JSON.stringify({ t: "pick", viewId: "ghost", version: 1 }));
  await new Promise((r) => setTimeout(r, 50));
  expect(l.ws.readyState).toBe(WebSocket.OPEN);
  l.ws.close();
});

test("ws sync resends the view to that screen", async () => {
  srv = await start();
  await send(srv.url, "/api/views", { view: view() });
  const l = listen(srv.url);
  await until(() => l.events.some((e) => e.t === "problems"));
  l.events.length = 0;
  l.ws.send(JSON.stringify({ t: "sync", viewId: "demo" }));
  await until(() => l.events.some((e) => e.t === "view"));
  l.ws.close();
});

test("plan 1 render endpoint still works", async () => {
  srv = await start();
  const l = listen(srv.url);
  await l.open;
  const r = await send(srv.url, "/api/render", { data: fx("sales.csv"), intent: "rows" });
  expect(r.status).toBe(202);
  const { renderId, url } = await r.json();
  expect(url).toBe(`${srv.url}/#${renderId}`);
  await until(() => l.events.some((e) => e.t === "patch" && e.viewId === renderId && e.changed.includes("k_rows")));
  expect(l.events.find((e) => (e.t === "view" || e.t === "patch") && e.viewId === renderId)?.t).toBe("view");
  await until(() => l.events.some((e) => e.t === "activity" && e.viewId === renderId && e.text === ""));
  const cur = await (await fetch(`${srv.url}/api/views/${renderId}`)).json();
  const ids = cur.view.sections[0].items.map((i: { id: string }) => i.id);
  expect(ids).toEqual(["k_rows"]);
  expect((await (await fetch(`${srv.url}/api/views/${renderId}/status`)).json()).problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
  l.ws.close();
});

test("foreign origin rejected on new routes", async () => {
  srv = await start();
  const evil = { origin: "https://evil.example" };
  expect((await send(srv.url, "/api/views", { view: view() }, evil)).status).toBe(403);
  expect((await send(srv.url, "/api/views/demo/patch", { ops: [] }, evil)).status).toBe(403);
  expect((await send(srv.url, "/api/profile", { data: fx("sales.csv") }, evil)).status).toBe(403);
  expect((await fetch(srv.url + "/api/views", { headers: evil })).status).toBe(403);
  const r = await fetch(srv.url + "/api/views", { method: "POST", headers: { "content-type": "text/plain" }, body: JSON.stringify({ view: view() }) });
  expect(r.status).toBe(415);
});

test("views survive a server restart", async () => {
  srv = await start();
  await send(srv.url, "/api/views", { view: view() });
  await srv.close();
  srv = await start();
  const cur = await (await fetch(srv.url + "/api/views/demo")).json();
  expect(cur.version).toBe(1);
  const l = listen(srv.url);
  await until(() => l.events.some((e) => e.t === "result" && e.viewId === "demo"));
  l.ws.close();
  const p = await (await send(srv.url, "/api/views/demo/patch", { ops: [{ op: "set", title: "X" }] })).json();
  expect(p.version).toBe(2);
});

test("watch endpoint registers a folder and streams its files", async () => {
  srv = await start();
  const proj = path.join(dir, "proj");
  const r = await (await send(srv.url, "/api/watch", { dir: proj })).json();
  expect(r.watching).toEqual([proj]);
  expect((await send(srv.url, "/api/watch", { dir: "relative" })).status).toBe(400);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path.join(proj, ".genui", "views", "w.ndjson"), JSON.stringify({ ...view(), id: "w" }) + "\n");
  await until(() => false, 600).catch(() => {});
  expect((await fetch(srv.url + "/api/views/w")).status).toBe(200);
});

test("media and params over HTTP", async () => {
  const { writeFile } = await import("node:fs/promises");
  const png = path.join(dir, "shot.png");
  await writeFile(png, Buffer.from("89504e470d0a1a0a", "hex"));
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {}, viewsDir: path.join(dir, "views"), waitMs: 20, secretFile: path.join(dir, "secret") });
  const v: View = { ...view(), params: { region: { type: "select", label: "Region", options: ["East", "West"] } },
    queries: { total: { sql: "SELECT sum(revenue) AS v FROM data WHERE ($region IS NULL OR region = $region)" } },
    sections: [{ id: "main", layout: "grid", items: [{ id: "k", span: 4, c: { type: "kpi", query: "total", field: "v", label: "Revenue" } }, { id: "m", c: { type: "media", items: [{ src: png }] } }] }] };
  const l = listen(srv.url);
  await l.open;
  expect((await send(srv.url, "/api/views", { view: v })).status).toBe(200);
  await until(() => l.events.some((e) => e.t === "media"));
  const media = l.events.find((e) => e.t === "media") as Extract<ViewEvent, { t: "media" }>;
  const img = await fetch(srv.url + media.urls[png]);
  expect(img.status).toBe(200);
  expect(img.headers.get("content-type")).toBe("image/png");
  expect((await fetch(srv.url + "/media/" + "0".repeat(32))).status).toBe(404);

  const ok = await send(srv.url, "/api/views/demo/params", { name: "region", value: "East" });
  expect(ok.status).toBe(200);
  const bad = await send(srv.url, "/api/views/demo/params", { name: "region", value: "Mars" });
  expect(bad.status).toBe(400);
  expect((await (await fetch(srv.url + "/api/views/demo/status")).json()).params).toEqual({ region: "East" });

  l.ws.send(JSON.stringify({ t: "param", viewId: "demo", name: "region", value: "West" }));
  await until(() => l.events.some((e) => e.t === "params" && e.values.region === "West"));
  l.ws.close();
});

test("static .mjs files are served as javascript (module workers need it)", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const staticDir = path.join(dir, "static");
  await mkdir(path.join(staticDir, "assets"), { recursive: true });
  await writeFile(path.join(staticDir, "index.html"), "<!doctype html>");
  await writeFile(path.join(staticDir, "assets", "worker.mjs"), "export {}");
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {}, viewsDir: path.join(dir, "views"), waitMs: 20, staticDir, secretFile: path.join(dir, "secret") });
  const r = await fetch(srv.url + "/assets/worker.mjs");
  expect(r.headers.get("content-type")).toBe("text/javascript");
});

test("a screen is told the build it should be running", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const staticDir = path.join(dir, "static");
  await mkdir(staticDir, { recursive: true });
  await writeFile(path.join(staticDir, "index.html"), "<!doctype html><script src=/assets/a.js></script>");
  srv = await startServer({ port: 0, provider: createFakeProvider(doc), openBrowser: () => {}, viewsDir: path.join(dir, "views"), waitMs: 20, staticDir, secretFile: path.join(dir, "secret") });
  const a = listen(srv.url);
  await until(() => a.events.length > 0);
  expect(a.events[0]).toMatchObject({ t: "hello" });
  const first = (a.events[0] as { build: string }).build;
  expect(first).toMatch(/^[0-9a-f]{12}$/);
  a.ws.close();
  await writeFile(path.join(staticDir, "index.html"), "<!doctype html><script src=/assets/b.js></script>");
  const b = listen(srv.url);
  await until(() => b.events.length > 0);
  expect((b.events[0] as { build: string }).build).not.toBe(first);
  b.ws.close();
});
