import { afterEach, expect, test } from "vitest";
import WebSocket from "ws";
import { startHosted as start, v, type Hosted } from "./hosted-helpers.ts";

let servers: Hosted[] = [];
const startHosted = async (opts?: Parameters<typeof start>[0]) => {
  const s = await start(opts);
  servers.push(s);
  return s;
};
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
});

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

// Beyond the brief: the review points and edge cases this task owns.
test("a patched view keeps its saved inline data; a path into another workspace is refused", async () => {
  const s = await startHosted(); const a = await s.mint(), b = await s.mint();
  const view = { ...v("d3"), datasets: { d: { inline: [{ a: 2 }] } }, queries: { q: { sql: "SELECT sum(a) AS total FROM d" } } };
  await s.post("/api/views", { view }, a);
  const p = await (await s.post("/api/views/d3/patch", { ops: [{ op: "set", title: "again" }] }, a)).json();
  expect(p.problems.filter((x: { severity: string }) => x.severity === "error")).toEqual([]);
  const saved = (await (await s.get("/api/views/d3", a)).json()).view.datasets.d.path as string;
  const r = await (await s.post("/api/views", { view: { ...v("steal"), datasets: { d: { path: saved, format: "ndjson" } } } }, b)).json();
  expect(JSON.stringify(r.problems)).toMatch(/inline/);
});
test("profile, variants and events are off; local media paths are refused", async () => {
  const s = await startHosted(); const a = await s.mint();
  const prof = await s.post("/api/profile", { data: { inline: [{ a: 1 }] } }, a);
  expect(prof.status).toBeGreaterThanOrEqual(400);
  expect(prof.status).toBeLessThan(500);
  expect((await prof.json()).error).toMatch(/inline/);
  await s.post("/api/views", { view: v("m1") }, a);
  expect((await s.post("/api/views/m1/variants", { variants: [] }, a)).status).toBe(404);
  expect((await s.get("/api/views/m1/events", a)).status).toBe(404);
  const img = { ...v("m2"), sections: [{ id: "s", layout: "grid", items: [{ id: "i", c: { type: "media", items: [{ src: "/etc/hosts.png" }] } }] }] };
  const r = await (await s.post("/api/views", { view: img }, a)).json();
  expect(JSON.stringify(r.problems)).toMatch(/http/);
});
test("bad keys: wrong secret, malformed workspace id, wrong scheme", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { mintKey } = await import("../src/hosted/keys.ts");
  const { TEST_SECRET } = await import("./hosted-helpers.ts");
  expect((await s.get("/api/views", mintKey("another-secret-0123456789abcdef0123"))).status).toBe(401);
  expect((await s.get("/api/views", mintKey(TEST_SECRET, "../../etc"))).status).toBe(401);
  expect((await s.fetch("/api/views", { headers: { authorization: `Basic ${a}` } })).status).toBe(401);
  expect((await s.get("/api/views", a)).status).toBe(200);
});
test("hosted /ws without a share token is refused", async () => {
  const s = await startHosted();
  const ws = new WebSocket(s.base.replace("http", "ws") + "/ws");
  const outcome = await new Promise<string>((r) => { ws.once("open", () => r("open")); ws.once("error", () => r("refused")); });
  ws.terminate();
  expect(outcome).toBe("refused");
});
test("readBody stops at the cap without reading on; bearer reads only the Authorization header", async () => {
  const { PassThrough } = await import("node:stream");
  const { bearer, readBody, BodyTooLarge } = await import("../src/hosted/auth.ts");
  const fake = (headers: Record<string, string> = {}) => Object.assign(new PassThrough(), { headers });

  const big = fake();
  let pulled = 0;
  big.on("data", (c: Buffer) => { pulled += c.length; });
  const p = readBody(big as never, 10);
  big.write(Buffer.alloc(8));
  big.write(Buffer.alloc(8));
  await expect(p).rejects.toBeInstanceOf(BodyTooLarge);
  big.write(Buffer.alloc(8));
  await new Promise((r) => setTimeout(r, 10));
  expect(pulled).toBe(16); // paused at the chunk that crossed the cap

  await expect(readBody(fake({ "content-length": "11" }) as never, 10)).rejects.toBeInstanceOf(BodyTooLarge);
  const small = fake();
  const q = readBody(small as never, 10);
  small.end(Buffer.from("{}"));
  expect((await q).toString()).toBe("{}");

  expect(bearer(fake({ authorization: "Bearer abc.def.ghi" }) as never)).toBe("abc.def.ghi");
  expect(bearer(fake({ authorization: "bearer  abc" }) as never)).toBe("abc");
  expect(bearer(fake({ authorization: "Basic abc" }) as never)).toBeNull();
  expect(bearer(fake({ authorization: "Bearer a b" }) as never)).toBeNull();
  expect(bearer(fake() as never)).toBeNull();
});
