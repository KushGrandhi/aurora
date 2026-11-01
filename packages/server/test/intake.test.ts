import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Spec, View, ViewEvent } from "@genui/spec";
import { DataRuntime } from "../src/dataRuntime.ts";
import { Intake } from "../src/intake.ts";
import { ViewStore } from "../src/viewStore.ts";

const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures", n);
let dir: string;
let data: DataRuntime;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "genui-intake-")); });
afterEach(async () => { await data?.closeAll(); await rm(dir, { recursive: true, force: true }); });

function setup(opts: { screens?: number; waitMs?: number } = {}) {
  const events: ViewEvent[] = [];
  const opened: string[] = [];
  let screens = opts.screens ?? 1;
  const store = new ViewStore(path.join(dir, "views"));
  data = new DataRuntime({ inlineDir: path.join(dir, "views") });
  const intake = new Intake({
    store, data, emit: (e) => events.push(e), baseUrl: () => "http://localhost:1",
    screens: () => screens, openScreen: (u) => { opened.push(u); }, waitMs: opts.waitMs ?? 30,
  });
  return { intake, store, events, opened, setScreens: (n: number) => { screens = n; } };
}

const salesView = (): View => ({
  v: 2, id: "sales", title: "Sales",
  datasets: { data: fx("sales.csv") },
  queries: { total: { sql: "SELECT sum(revenue) AS v FROM data" } },
  sections: [{ id: "main", layout: "grid", items: [
    { id: "k", span: 4, c: { type: "kpi", query: "total", field: "v", label: "Revenue", format: "currency" } },
    { id: "t", span: 8, c: { type: "text", md: "Revenue is {total.v|currency}." } },
  ] }],
});

test("render emits view, results and problems", async () => {
  const { intake, events } = setup();
  const r = await intake.render(salesView(), "caller");
  expect(r).toMatchObject({ viewId: "sales", version: 1, url: "http://localhost:1/#sales" });
  const kinds = events.map((e) => e.t);
  expect(kinds).toContain("view");
  expect(kinds).toContain("result");
  expect(kinds).toContain("problems");
  const res = events.find((e) => e.t === "result");
  expect(res && res.t === "result" && res.queryId).toBe("total");
  expect(r.problems.filter((p) => p.severity === "error")).toEqual([]);
});

test("invalid item stays as fallback and is reported", async () => {
  const { intake, store } = setup();
  const v = salesView();
  v.sections[0].items.push({ id: "bad", c: { type: "hologram" } });
  const r = await intake.render(v, "caller");
  expect(r.problems.find((p) => p.itemId === "bad" && p.severity === "error")).toBeTruthy();
  expect(store.current("sales")!.view.sections[0].items.map((i) => i.id)).toContain("bad");
});

test("structurally invalid view is rejected with a reason", async () => {
  const { intake } = setup();
  await expect(intake.render({ v: 2, id: "x", title: "T", sections: [{ id: "s", layout: "spiral", items: [] }] } as never, "caller")).rejects.toThrow(/layout/);
});

test("patch emits ops with changed ids", async () => {
  const { intake, events } = setup();
  await intake.render(salesView(), "caller");
  events.length = 0;
  const r = await intake.patch("sales", [{ op: "add", section: "main", item: { id: "n", c: { type: "text", md: "note" } } }], "caller");
  expect(r.version).toBe(2);
  const p = events.find((e) => e.t === "patch");
  expect(p && p.t === "patch" && p.changed).toEqual(["n"]);
  expect(p && p.t === "patch" && p.baseVersion).toBe(1);
  expect(events.some((e) => e.t === "view")).toBe(false);
});

test("rejected patch keeps the version and reports why", async () => {
  const { intake } = setup();
  await intake.render(salesView(), "caller");
  const r = await intake.patch("sales", [{ op: "remove", id: "ghost" }], "caller");
  expect(r.version).toBe(1);
  expect(r.problems[0].message).toContain("ghost");
});

test("patch normalizes like render (format fixed in the emitted ops)", async () => {
  const { intake, events, store } = setup();
  await intake.render(salesView(), "caller");
  events.length = 0;
  await intake.patch("sales", [{ op: "addQuery", id: "n", sql: "SELECT count(*) AS order_count FROM data" }, { op: "add", section: "main", item: { id: "kn", c: { type: "kpi", query: "n", field: "order_count", label: "Orders", format: "currency" } } }], "caller");
  expect(store.current("sales")!.view.sections[0].items.find((i) => i.id === "kn")!.c.format).toBe("integer");
  const p = events.find((e) => e.t === "patch");
  expect(JSON.stringify(p)).toContain('"integer"');
  expect(events.some((e) => e.t === "result" && e.queryId === "n")).toBe(true);
  expect(events.some((e) => e.t === "result" && e.queryId === "total")).toBe(false);
});

test("no screen opens one and reports unverified", async () => {
  const { intake, opened } = setup({ screens: 0 });
  const r = await intake.render(salesView(), "caller");
  expect(opened).toEqual(["http://localhost:1/#sales"]);
  const unv = r.problems.filter((p) => p.severity === "unverified").map((p) => p.itemId).sort();
  expect(unv).toEqual(["k", "t"]);
  expect(intake.status("sales").unverified.sort()).toEqual(["k", "t"]);
});

test("screen report within wait clears unverified", async () => {
  const { intake } = setup({ waitMs: 1000 });
  const p = intake.render(salesView(), "caller");
  setTimeout(() => void intake.screenMessage({ t: "rendered", viewId: "sales", version: 1, ok: ["k"], failed: [{ itemId: "t", message: "boom" }] }), 20);
  const r = await p;
  expect(r.problems.filter((x) => x.severity === "unverified")).toEqual([]);
  expect(r.problems.find((x) => x.itemId === "t")?.message).toContain("boom");
  expect(intake.status("sales").unverified).toEqual([]);
});

test("pick from screen becomes current and next patch is rebased", async () => {
  const { intake, store, events } = setup();
  await intake.render(salesView(), "caller");
  await intake.patch("sales", [{ op: "set", title: "Changed" }], "caller");
  events.length = 0;
  await intake.screenMessage({ t: "pick", viewId: "sales", version: 1 });
  expect(store.current("sales")!.version).toBe(3);
  expect(store.current("sales")!.view.title).toBe("Sales");
  expect(events.some((e) => e.t === "view" && e.version === 3)).toBe(true);
  const r = await intake.patch("sales", [{ op: "set", summary: "s" }], "caller", 2);
  expect(r.rebased).toBe(true);
  expect(r.version).toBe(4);
});

test("revertItem from screen restores one item", async () => {
  const { intake, store } = setup();
  await intake.render(salesView(), "caller");
  await intake.patch("sales", [{ op: "update", id: "t", item: { c: { md: "changed" } } }], "caller");
  await intake.screenMessage({ t: "revertItem", viewId: "sales", itemId: "t", version: 1 });
  expect(store.current("sales")!.view.sections[0].items.find((i) => i.id === "t")!.c.md).toBe("Revenue is {total.v|currency}.");
});

test("plan 1 spec accepted by render", async () => {
  const { intake, store } = setup();
  const spec: Spec = { v: 1, title: "P1", queries: {}, layout: { type: "grid", cols: 12, items: [{ id: "x", span: 12, c: { type: "text", md: "hi" } }] } };
  const r = await intake.render(spec, "caller", { id: "p1" });
  expect(r.viewId).toBe("p1");
  expect(store.current("p1")!.view.sections[0].id).toBe("main");
});

test("failed query marks its items", async () => {
  const { intake } = setup();
  const v = salesView();
  v.queries!.total = { sql: "SELECT sum(nonexistent) AS v FROM data" };
  const r = await intake.render(v, "caller");
  expect(r.problems.some((p) => p.itemId === "k" && p.severity === "error")).toBe(true);
});

test("snapshot replays media, params, view, results and problems", async () => {
  const { intake } = setup();
  await intake.render(salesView(), "caller");
  const snap = intake.snapshot("sales");
  expect(snap.map((e) => e.t)).toEqual(["media", "params", "view", "result", "problems"]);
});

test("render rejects duplicate ids", async () => {
  const { intake, store } = setup();
  const v = salesView();
  v.sections.push({ id: "k", layout: "grid", items: [] });
  await expect(intake.render(v, "caller")).rejects.toThrow(/"k".*more than once/);
  const w = salesView();
  w.sections[0].items.push({ id: "t", c: { type: "text", md: "dup" } });
  await expect(intake.render(w, "caller")).rejects.toThrow(/"t"/);
  expect(store.current("sales")).toBeUndefined();
});

test("plan 1 spec with an invalid id is a clear error", async () => {
  const { intake } = setup();
  const spec: Spec = { v: 1, title: "P1", queries: {}, layout: { type: "grid", cols: 12, items: [] } };
  const err = await intake.render(spec, "file", { id: "my-view" }).catch((e) => e);
  expect(err.constructor.name).toBe("IntakeError");
  expect(err.message).toMatch(/my-view/);
});

test("inline datasets are stored as a file reference, not copied into each version", async () => {
  const { intake, store } = setup();
  const v: View = { v: 2, id: "inl", title: "I", datasets: { pts: { inline: [{ x: 1 }, { x: 2 }] } }, queries: { s: { sql: "SELECT sum(x) AS total FROM pts" } },
    sections: [{ id: "m", layout: "grid", items: [{ id: "k", c: { type: "kpi", query: "s", field: "total", label: "Sum" } }] }] };
  const r = await intake.render(v, "caller");
  expect(r.problems.filter((p) => p.severity === "error")).toEqual([]);
  const ds = store.current("inl")!.view.datasets!.pts as { path: string };
  expect(typeof ds.path).toBe("string");
  expect(JSON.stringify(store.current("inl")!.view)).not.toContain('"inline"');
  await intake.patch("inl", [{ op: "set", title: "I2" }], "caller");
  expect(store.current("inl")!.view.datasets).toEqual({ pts: ds });
});
