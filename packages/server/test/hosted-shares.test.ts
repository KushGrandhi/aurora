import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { newWorkspaceId } from "../src/hosted/keys.ts";
import { Shares, shareOutgoing, wsOfToken } from "../src/hosted/shares.ts";
import { startHosted as start, tokenOf, v, type Hosted } from "./hosted-helpers.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let servers: Hosted[] = [];
const startHosted = async (opts?: Parameters<typeof start>[0]) => {
  const s = await start(opts);
  servers.push(s);
  return s;
};
let tmp: string, wsDir: string;
beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "aurora-shares-"));
  wsDir = path.join(tmp, "ws", newWorkspaceId());
});
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
  await rm(tmp, { recursive: true, force: true });
});

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

// Beyond the brief: the review points and edge cases this task owns.
test("results carry the share url, also status; a trailing slash on the public url doesn't double", async () => {
  const s = await startHosted({ publicUrl: "https://aurora.test/" }); const a = await s.mint();
  const r = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  expect(r.url).toMatch(/^https:\/\/aurora\.test\/v\/[a-z0-9]{16}_[0-9a-f]{32}$/);
  const p = await (await s.post("/api/views/x1/patch", { ops: [{ op: "set", title: "b" }] }, a)).json();
  expect(p.url).toBe(r.url);
  expect((await (await s.get("/api/views/x1/status", a)).json()).url).toBe(r.url);
  const rot = await (await s.post("/api/views/x1/share", { rotate: true }, a)).json();
  expect(rot.url).not.toBe(r.url);
  expect((await (await s.get("/api/views/x1/status", a)).json()).url).toBe(rot.url);
  expect((await s.post("/api/views/nope/share", {}, a)).status).toBe(404);
  expect((await s.post("/api/views/x1/share", { rotate: true })).status).toBe(401);
});
test("hosted render and patch don't wait for a screen", async () => {
  const s = await startHosted({ waitMs: 5000 }); const a = await s.mint();
  const t0 = Date.now();
  await s.post("/api/views", { view: v("x1") }, a);
  await s.post("/api/views/x1/patch", { ops: [{ op: "set", title: "b" }] }, a);
  expect(Date.now() - t0).toBeLessThan(3000);
});
test("unknown, malformed and foreign links are closed with 4401; other socket forms are refused", async () => {
  const s = await startHosted(); const a = await s.mint(), b = await s.mint();
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const tok = tokenOf(url);
  const wsB = (await (await s.post("/api/views", { view: v("x1") }, b)).json()).url;
  const foreign = `${tokenOf(wsB).split("_")[0]}_${tok.split("_")[1]}`; // b's workspace, a's secret part
  for (const bad of [`${tok.split("_")[0]}_${"0".repeat(32)}`, "nonsense", foreign]) {
    const sock = await s.viewer(bad);
    await expect.poll(() => sock.closedWith, { timeout: 2000 }).toBe(4401);
    expect(sock.events.filter((e) => e.t !== "hello")).toEqual([]);
  }
  for (const form of [`/ws?share=${tok}&role=capture`, `/ws?role=capture`]) expect(await s.refused(form)).toBe(true);
});
test("a share socket's params are shared; it can't set another view's", async () => {
  const s = await startHosted(); const a = await s.mint();
  const pv = (id: string) => ({ ...v(id), params: { n: { type: "select", label: "N", options: ["a", "b"], default: "a" } } });
  await s.post("/api/views", { view: pv("other") }, a);
  const { url } = await (await s.post("/api/views", { view: pv("x1") }, a)).json();
  const sock = await s.viewer(tokenOf(url));
  sock.send({ t: "param", viewId: "x1", name: "n", value: "b" });
  sock.send({ t: "param", viewId: "other", name: "n", value: "b" });
  await expect.poll(async () => (await (await s.get("/api/views/x1/status", a)).json()).params.n).toBe("b");
  expect((await (await s.get("/api/views/other/status", a)).json()).params.n).toBe("a");
});
test("viewer messages that would change a view on a local screen change nothing", async () => {
  const s = await startHosted(); const a = await s.mint();
  const { url } = await (await s.post("/api/views", { view: v("x1") }, a)).json();
  const sock = await s.viewer(tokenOf(url));
  await sock.until((e) => e.t === "view");
  sock.send({ t: "rendered", viewId: "x1", version: 1, ok: [], failed: [{ itemId: "t", message: "fake" }], warnings: [{ itemId: "t", message: "fake warning" }] });
  await s.post("/api/views/x1/patch", { ops: [{ op: "set", title: "two" }] }, a);
  await sock.until((e) => e.t === "patch" && e.version === 2);
  sock.send({ t: "rendered", viewId: "x1", version: 2, ok: [], failed: [{ itemId: "t", message: "fake" }], warnings: [{ itemId: "t", message: "fake warning" }] });
  sock.send({ t: "revertItem", viewId: "x1", itemId: "t", version: 1 });
  sock.send({ t: "pick", viewId: "x1", version: 1 });
  sock.send({ t: "event", viewId: "x1", itemId: "t", name: "click", payload: { x: 1 } });
  await sleep(300);
  const st = await (await s.get("/api/views/x1/status", a)).json();
  expect(st.version).toBe(2);
  expect(JSON.stringify(st.problems)).not.toContain("fake");
  expect(st.events.count).toBe(0);
});
test("shareOutgoing passes only the pinned view's events", () => {
  expect(shareOutgoing("x1", { t: "list", views: [] })).toBe(false);
  expect(shareOutgoing("x1", { t: "activity", viewId: "x2", text: "" })).toBe(false);
  expect(shareOutgoing("x1", { t: "activity", viewId: "x1", text: "" })).toBe(true);
});
test("a torn shares.json isn't cached: once fixed, links resolve without a restart", async () => {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(wsDir, { recursive: true });
  await writeFile(path.join(wsDir, "shares.json"), "{ torn");
  const sh = new Shares(wsDir);
  const err = console.error; console.error = () => {};
  try {
    await expect(sh.resolve(`${path.basename(wsDir)}_${"a".repeat(32)}`)).rejects.toThrow();
  } finally { console.error = err; }
  await writeFile(path.join(wsDir, "shares.json"), JSON.stringify({ x1: "a".repeat(32) }));
  expect(await sh.resolve(`${path.basename(wsDir)}_${"a".repeat(32)}`)).toBe("x1");
});
test("a link to a view that no longer exists (pruned) doesn't work: 4401", async () => {
  const { writeFile } = await import("node:fs/promises");
  const s = await startHosted(); const a = await s.mint();
  const ws = JSON.parse(Buffer.from(a.split(".")[1]!, "base64url").toString()).ws as string;
  expect((await s.get("/api/views", a)).status).toBe(200); // the workspace exists
  await writeFile(path.join(s.dataDir, "ws", ws, "shares.json"), JSON.stringify({ gone: "b".repeat(32) }));
  const sock = await s.viewer(`${ws}_${"b".repeat(32)}`);
  await expect.poll(() => sock.closedWith).toBe(4401);
  expect(sock.events.some((e) => e.t === "view")).toBe(false);
});
