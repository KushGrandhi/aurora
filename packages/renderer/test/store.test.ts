import { expect, test } from "vitest";
import type { Item, RenderEvent, Spec } from "@genui/spec";
import { reduce, type RenderState } from "../src/store.ts";

const kpi = (id: string, query = "q"): Item => ({ id, span: 3, c: { type: "kpi", query, field: "v", label: "L" } });
const spec = (items: Item[]): Spec => ({ v: 1, title: "D", queries: {}, layout: { type: "grid", cols: 12, items } });
const res = (n: number) => ({ columns: [], rows: [{ v: n }], truncated: false, ms: 0 });
const apply = (events: RenderEvent[]) => events.reduce(reduce, {} as Record<string, RenderState>);

test("default items replaced by first composed item", () => {
  const s = apply([
    { t: "start", renderId: "r" },
    { t: "default", renderId: "r", spec: spec([kpi("d_a"), kpi("d_b")]) },
    { t: "item", renderId: "r", item: kpi("k1") },
    { t: "item", renderId: "r", item: kpi("k2") },
  ]);
  expect(s.r.items.map((i) => i.id)).toEqual(["k1", "k2"]);
  expect(s.r.title).toBe("D");
});

test("cached render without default shows items", () => {
  const s = apply([{ t: "start", renderId: "r" }, { t: "item", renderId: "r", item: kpi("k1") }]);
  expect(s.r.items.map((i) => i.id)).toEqual(["k1"]);
});

test("results namespaced per render", () => {
  const s = apply([
    { t: "result", renderId: "a", queryId: "q", result: res(1) },
    { t: "result", renderId: "b", queryId: "q", result: res(2) },
  ]);
  expect(s.a.results.q.rows[0].v).toBe(1);
  expect(s.b.results.q.rows[0].v).toBe(2);
});

test("item with same id replaces", () => {
  const s = apply([
    { t: "item", renderId: "r", item: kpi("k1", "q1") },
    { t: "item", renderId: "r", item: kpi("k1", "q2") },
  ]);
  expect(s.r.items).toHaveLength(1);
  expect((s.r.items[0].c as { query: string }).query).toBe("q2");
});

test("meta, errors and done recorded", () => {
  const s = apply([
    { t: "meta", renderId: "r", title: "T", summary: "S" },
    { t: "queryError", renderId: "r", queryId: "q", message: "bad" },
    { t: "error", renderId: "r", message: "boom" },
    { t: "done", renderId: "r", timings: { total: 5 }, cached: false },
  ]);
  expect(s.r).toMatchObject({ title: "T", summary: "S", done: true, timings: { total: 5 } });
  expect(s.r.errors).toEqual(["q: bad", "boom"]);
});

test("reduce is pure", () => {
  const before = apply([{ t: "item", renderId: "r", item: kpi("k1") }]);
  const snapshot = JSON.stringify(before);
  reduce(before, { t: "item", renderId: "r", item: kpi("k2") });
  expect(JSON.stringify(before)).toBe(snapshot);
});

test("items are placed by stream order, not arrival order", () => {
  const s = apply([
    { t: "item", renderId: "r", item: kpi("c"), order: 2 },
    { t: "item", renderId: "r", item: kpi("a"), order: 0 },
    { t: "item", renderId: "r", item: kpi("b"), order: 1 },
  ]);
  expect(s.r.items.map((i) => i.id)).toEqual(["a", "b", "c"]);
});
