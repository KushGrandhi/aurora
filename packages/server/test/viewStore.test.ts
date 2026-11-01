import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { View } from "@genui/spec";
import { ViewStore } from "../src/viewStore.ts";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "genui-store-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const view = (id = "v", title = "T"): View => ({ v: 2, id, title, sections: [{ id: "s", layout: "grid", items: [{ id: "a", c: { type: "text", md: "A" } }, { id: "b", c: { type: "text", md: "B" } }] }] });

test("render creates v1 on disk", async () => {
  const store = new ViewStore(dir);
  const e = await store.render(view(), "caller");
  expect(e.version).toBe(1);
  expect(await readdir(path.join(dir, "v"))).toEqual(["v1.json"]);
  const saved = JSON.parse(await readFile(path.join(dir, "v", "v1.json"), "utf8"));
  expect(saved.view).toEqual(view());
  expect(saved.source).toBe("caller");
});

test("render of an existing id is a new version", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  const e = await store.render(view("v", "T2"), "file");
  expect(e.version).toBe(2);
  expect(store.current("v")!.view.title).toBe("T2");
});

test("patch increments version", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  const r = await store.patch("v", [{ op: "set", title: "X" }], "caller");
  expect("entry" in r && r.entry.version).toBe(2);
  expect("entry" in r && r.rebased).toBe(false);
  expect(store.current("v")!.view.title).toBe("X");
});

test("patch of an unknown view is a problem", async () => {
  const store = new ViewStore(dir);
  const r = await store.patch("ghost", [{ op: "set", title: "X" }], "caller");
  expect("problem" in r && r.problem.message).toContain("ghost");
});

test("rejected patch keeps the version", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  const r = await store.patch("v", [{ op: "remove", id: "nope" }], "caller");
  expect("problem" in r).toBe(true);
  expect(store.current("v")!.version).toBe(1);
});

test("rebased when base is older than current", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  await store.patch("v", [{ op: "set", title: "X" }], "caller");
  const r = await store.patch("v", [{ op: "remove", id: "a" }], "caller", 1);
  expect("entry" in r && r.rebased).toBe(true);
  expect("entry" in r && r.entry.view.title).toBe("X");
  const r2 = await store.patch("v", [{ op: "set", title: "Y" }], "caller", 3);
  expect("entry" in r2 && r2.rebased).toBe(false);
});

test("pick copies an old version as new current", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  await store.patch("v", [{ op: "set", title: "X" }], "caller");
  const e = await store.pick("v", 1);
  expect(e.version).toBe(3);
  expect(e.view).toEqual(view());
  expect(e.source).toBe("screen");
  expect(e.note).toBe("picked v1");
  expect(store.history("v").map((h) => h.version)).toEqual([1, 2, 3]);
});

test("revertItem restores one item only", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  await store.patch("v", [{ op: "update", id: "a", item: { c: { md: "A2" } } }, { op: "update", id: "b", item: { c: { md: "B2" } } }], "caller");
  const e = await store.revertItem("v", "a", 1);
  expect("version" in e && e.version).toBe(3);
  const items = store.current("v")!.view.sections[0].items;
  expect(items.map((i) => i.c.md)).toEqual(["A", "B2"]);
  const bad = await store.revertItem("v", "zzz", 1);
  expect("problem" in bad).toBe(true);
});

test("survives restart", async () => {
  const a = new ViewStore(dir);
  await a.render(view(), "caller");
  await a.patch("v", [{ op: "set", title: "X" }], "caller");
  const b = new ViewStore(dir);
  await b.load();
  expect(b.current("v")).toEqual(a.current("v"));
  expect(b.list().map((l) => l.id)).toEqual(["v"]);
  const r = await b.patch("v", [{ op: "set", title: "Y" }], "caller");
  expect("entry" in r && r.entry.version).toBe(3);
});

test("prune keeps the newest N or those within the age limit", async () => {
  const old = new Date(Date.now() - 86_400_000).toISOString();
  for (const id of ["a1", "a2", "a3"]) {
    await mkdir(path.join(dir, id), { recursive: true });
    await writeFile(path.join(dir, id, "v1.json"), JSON.stringify({ version: 1, at: old, source: "caller", view: view(id) }));
  }
  const store = new ViewStore(dir, { keep: 2, maxAgeDays: 0.5 });
  await store.load();
  await store.render(view("fresh"), "caller");
  await store.prune();
  const left = (await readdir(dir)).sort();
  expect(left).toHaveLength(2);
  expect(left).toContain("fresh");
  expect(store.list()).toHaveLength(2);
});

test("prune keeps everything young even beyond keep", async () => {
  const store = new ViewStore(dir, { keep: 1, maxAgeDays: 30 });
  await store.render(view("x1"), "caller");
  await store.render(view("x2"), "caller");
  await store.prune();
  expect((await readdir(dir)).sort()).toEqual(["x1", "x2"]);
});

test("serializes concurrent patches", async () => {
  const store = new ViewStore(dir);
  await store.render(view(), "caller");
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    store.patch("v", [{ op: "add", section: "s", item: { id: `n${i}`, c: { type: "text", md: String(i) } } }], i % 2 ? "file" : "caller")));
  const versions = results.map((r) => ("entry" in r ? r.entry.version : -1)).sort((a, b) => a - b);
  expect(versions).toEqual(Array.from({ length: 20 }, (_, i) => i + 2));
  expect(store.current("v")!.view.sections[0].items).toHaveLength(22);
  expect(await readdir(path.join(dir, "v"))).toHaveLength(21);
});

test("view ids cannot escape the store directory", async () => {
  const store = new ViewStore(dir);
  await expect(store.render({ ...view(), id: "../evil" } as View, "caller")).rejects.toThrow();
});
