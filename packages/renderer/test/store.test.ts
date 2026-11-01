import { expect, test } from "vitest";
import type { View, ViewEvent } from "@genui/spec";
import { emptyState, reduce, type State } from "../src/store.ts";

const view = (): View => ({ v: 2, id: "v", title: "T", sections: [{ id: "s", layout: "grid", items: [{ id: "a", c: { type: "text", md: "A" } }, { id: "b", c: { type: "text", md: "B" } }] }] });
const res = (n: number) => ({ columns: [], rows: [{ v: n }], truncated: false, ms: 0 });
function run(events: ViewEvent[], from: State = emptyState()) {
  let s = from;
  const needs = [];
  for (const e of events) {
    const r = reduce(s, e);
    s = r.state;
    if (r.need) needs.push(r.need);
  }
  return { s, needs };
}

test("view event sets state", () => {
  const { s } = run([{ t: "view", viewId: "v", version: 1, view: view(), source: "caller" }]);
  expect(s.views.v.version).toBe(1);
  expect(s.views.v.view.title).toBe("T");
  expect(s.views.v.source).toBe("caller");
});

test("patch applies in order", () => {
  const { s, needs } = run([
    { t: "view", viewId: "v", version: 1, view: view(), source: "caller" },
    { t: "patch", viewId: "v", version: 2, baseVersion: 1, ops: [{ op: "add", section: "s", item: { id: "c", c: { type: "text", md: "C" } } }], changed: ["c"], source: "caller" },
    { t: "patch", viewId: "v", version: 3, baseVersion: 2, ops: [{ op: "move", id: "c", section: "s", after: null }], changed: ["c"], source: "caller" },
  ]);
  expect(needs).toEqual([]);
  expect(s.views.v.version).toBe(3);
  expect(s.views.v.view.sections[0].items.map((i) => i.id)).toEqual(["c", "a", "b"]);
});

test("version gap triggers sync", () => {
  const { s, needs } = run([
    { t: "view", viewId: "v", version: 1, view: view(), source: "caller" },
    { t: "patch", viewId: "v", version: 4, baseVersion: 3, ops: [{ op: "set", title: "X" }], changed: [], source: "caller" },
  ]);
  expect(needs).toEqual([{ t: "sync", viewId: "v" }]);
  expect(s.views.v.version).toBe(1);
});

test("patch for an unknown view triggers sync", () => {
  const { needs } = run([{ t: "patch", viewId: "z", version: 2, baseVersion: 1, ops: [], changed: [], source: "caller" }]);
  expect(needs).toEqual([{ t: "sync", viewId: "z" }]);
});

test("stale patch is ignored", () => {
  const { s, needs } = run([
    { t: "view", viewId: "v", version: 3, view: view(), source: "caller" },
    { t: "patch", viewId: "v", version: 2, baseVersion: 1, ops: [{ op: "set", title: "Old" }], changed: [], source: "caller" },
  ]);
  expect(needs).toEqual([]);
  expect(s.views.v.view.title).toBe("T");
});

test("results keyed per view", () => {
  const { s } = run([
    { t: "result", viewId: "a", queryId: "q", result: res(1) },
    { t: "result", viewId: "b", queryId: "q", result: res(2) },
    { t: "view", viewId: "a", version: 1, view: { ...view(), id: "a" }, source: "caller" },
  ]);
  expect(s.results.a.q.rows[0].v).toBe(1);
  expect(s.results.b.q.rows[0].v).toBe(2);
});

test("changed tracks touched ids", () => {
  const { s } = run([
    { t: "view", viewId: "v", version: 1, view: view(), source: "caller" },
    { t: "patch", viewId: "v", version: 2, baseVersion: 1, ops: [{ op: "update", id: "b", item: { c: { md: "B2" } } }], changed: ["b"], source: "caller" },
  ]);
  expect(s.views.v.changed).toEqual({ b: 2 });
  const v3 = view();
  v3.sections[0].items[0].c.md = "A3";
  v3.sections[0].items[1].c.md = "B2";
  const r = reduce(s, { t: "view", viewId: "v", version: 3, view: v3, source: "screen" });
  expect(r.state.views.v.changed).toEqual({ b: 2, a: 3 });
});

test("problems, activity and list", () => {
  const { s } = run([
    { t: "activity", viewId: "v", text: "Composing…" },
    { t: "view", viewId: "v", version: 1, view: view(), source: "compose" },
    { t: "problems", viewId: "v", version: 1, problems: [{ itemId: "a", severity: "error", message: "x" }] },
    { t: "list", views: [{ id: "v", title: "T", version: 1, at: "2026-01-01" }] },
  ]);
  expect(s.activity.v).toBe("Composing…");
  expect(s.views.v.problems).toHaveLength(1);
  expect(s.list[0].id).toBe("v");
});

test("unchanged items keep their object identity across a patch", () => {
  const { s } = run([{ t: "view", viewId: "v", version: 1, view: view(), source: "caller" }]);
  const a1 = s.views.v.view.sections[0].items[0];
  const r = reduce(s, { t: "patch", viewId: "v", version: 2, baseVersion: 1, ops: [{ op: "update", id: "b", item: { c: { md: "B2" } } }], changed: ["b"], source: "caller" });
  expect(r.state.views.v.view.sections[0].items[0]).toBe(a1);
  expect(r.state.views.v.view.sections[0].items[1].c.md).toBe("B2");
});

test("a view the screen has never seen is followed", () => {
  const { s } = run([{ t: "list", views: [{ id: "old", title: "Old", version: 1, at: "x" }] }, { t: "view", viewId: "old", version: 1, view: { ...view(), id: "old" }, source: "caller" }]);
  expect(reduce(s, { t: "view", viewId: "old", version: 2, view: { ...view(), id: "old" }, source: "caller" }).follow).toBeUndefined();
  expect(reduce(s, { t: "view", viewId: "fresh", version: 1, view: { ...view(), id: "fresh" }, source: "caller" }).follow).toBe("fresh");
});

test("media and params events stored per view", () => {
  const { s } = run([
    { t: "media", viewId: "v", urls: { "/a.png": "/media/abc" } },
    { t: "params", viewId: "v", values: { region: "East" }, options: { region: ["East", "West"] } },
    { t: "media", viewId: "w", urls: {} },
  ]);
  expect(s.media.v).toEqual({ "/a.png": "/media/abc" });
  expect(s.media.w).toEqual({});
  expect(s.params.v).toEqual({ values: { region: "East" }, options: { region: ["East", "West"] } });
  expect(s.params.w).toBeUndefined();
});

test("a different build after reconnecting asks for a reload", () => {
  const a = reduce(emptyState(), { t: "hello", build: "aaa" });
  expect(a.reload).toBeUndefined();
  expect(reduce(a.state, { t: "hello", build: "aaa" }).reload).toBeUndefined();
  expect(reduce(a.state, { t: "hello", build: "bbb" }).reload).toBe(true);
});
