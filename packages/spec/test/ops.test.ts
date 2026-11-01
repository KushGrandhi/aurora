import { expect, test } from "vitest";
import { allIds, applyOps, PatchOpSchema, type PatchOp, type View } from "../src/index.ts";

const base = (): View => ({
  v: 2, id: "v", title: "T",
  sections: [
    { id: "s1", layout: "grid", items: [
      { id: "a", span: 4, c: { type: "text", md: "A" } },
      { id: "b", span: 4, c: { type: "kpi", query: "q", field: "v", label: "B", format: "number" } },
    ] },
    { id: "s2", layout: "tabs", items: [{ id: "c", title: "C", c: { type: "json", value: { x: 1, nested: { y: 2 } } } }] },
  ],
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}

function ok(view: View, ops: PatchOp[]) {
  const r = applyOps(view, ops);
  if (!r.ok) throw new Error(r.problem.message);
  return r;
}
const ids = (v: View, s: number) => v.sections[s].items.map((i) => i.id);

test("set changes title", () => {
  const r = ok(base(), [{ op: "set", title: "New", summary: "S" }]);
  expect(r.view.title).toBe("New");
  expect(r.view.summary).toBe("S");
});

test("add appends and after inserts", () => {
  let r = ok(base(), [{ op: "add", section: "s1", item: { id: "z", c: { type: "text", md: "z" } } }]);
  expect(ids(r.view, 0)).toEqual(["a", "b", "z"]);
  r = ok(base(), [{ op: "add", section: "s1", item: { id: "z", c: { type: "text", md: "z" } }, after: "a" }]);
  expect(ids(r.view, 0)).toEqual(["a", "z", "b"]);
  r = ok(base(), [{ op: "add", section: "s1", item: { id: "z", c: { type: "text", md: "z" } }, after: null }]);
  expect(ids(r.view, 0)).toEqual(["z", "a", "b"]);
});

test("update deep-merges c", () => {
  const r = ok(base(), [{ op: "update", id: "c", item: { title: "C2", c: { type: "json", value: { nested: { z: 3 } } } } }]);
  const item = r.view.sections[1].items[0];
  expect(item.title).toBe("C2");
  expect(item.c).toEqual({ type: "json", value: { x: 1, nested: { y: 2, z: 3 } } });
});

test("update replaces arrays", () => {
  const v = base();
  v.sections[0].items[0].c = { type: "text", md: "x", tags: [1, 2] };
  const r = ok(v, [{ op: "update", id: "a", item: { c: { tags: [3] } } }]);
  expect(r.view.sections[0].items[0].c).toEqual({ type: "text", md: "x", tags: [3] });
});

test("replace swaps component", () => {
  const r = ok(base(), [{ op: "replace", id: "b", item: { id: "b", span: 6, c: { type: "text", md: "now text" } } }]);
  expect(r.view.sections[0].items[1]).toEqual({ id: "b", span: 6, c: { type: "text", md: "now text" } });
});

test("replace may not change the id to a used one", () => {
  const r = applyOps(base(), [{ op: "replace", id: "b", item: { id: "a", c: { type: "text", md: "x" } } }]);
  expect(r.ok).toBe(false);
});

test("remove", () => {
  const r = ok(base(), [{ op: "remove", id: "a" }]);
  expect(ids(r.view, 0)).toEqual(["b"]);
});

test("move across sections", () => {
  const r = ok(base(), [{ op: "move", id: "a", section: "s2", after: "c" }]);
  expect(ids(r.view, 0)).toEqual(["b"]);
  expect(ids(r.view, 1)).toEqual(["c", "a"]);
  const r2 = ok(base(), [{ op: "move", id: "b", section: "s1", after: null }]);
  expect(ids(r2.view, 0)).toEqual(["b", "a"]);
});

test("addSection and removeSection", () => {
  let r = ok(base(), [{ op: "addSection", section: { id: "s3", layout: "grid", items: [] }, after: "s1" }]);
  expect(r.view.sections.map((s) => s.id)).toEqual(["s1", "s3", "s2"]);
  r = ok(r.view, [{ op: "removeSection", id: "s1" }]);
  expect(r.view.sections.map((s) => s.id)).toEqual(["s3", "s2"]);
});

test("moveSection", () => {
  const r = ok(base(), [{ op: "moveSection", id: "s2", after: null }]);
  expect(r.view.sections.map((s) => s.id)).toEqual(["s2", "s1"]);
  const r2 = ok(r.view, [{ op: "moveSection", id: "s2" }]);
  expect(r2.view.sections.map((s) => s.id)).toEqual(["s1", "s2"]);
});

test("addQuery", () => {
  const r = ok(base(), [{ op: "addQuery", id: "q", sql: "SELECT 1" }]);
  expect(r.view.queries).toEqual({ q: { sql: "SELECT 1" } });
});

test("addDataset", () => {
  const r = ok(base(), [{ op: "addDataset", name: "events", input: { inline: [{ a: 1 }] } }]);
  expect(r.view.datasets).toEqual({ events: { inline: [{ a: 1 }] } });
});

test("rejects ops on unknown ids atomically", () => {
  const v = base();
  const before = structuredClone(v);
  const r = applyOps(v, [{ op: "add", section: "s1", item: { id: "z", c: { type: "text", md: "z" } } }, { op: "update", id: "nope", item: { title: "x" } }]);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.problem.message).toContain("nope");
  expect(v).toEqual(before);
  for (const op of [{ op: "remove", id: "nope" }, { op: "move", id: "a", section: "nope" }, { op: "removeSection", id: "nope" }, { op: "add", section: "s1", item: { id: "y", c: { type: "x" } }, after: "nope" }] as PatchOp[]) {
    const r2 = applyOps(v, [op]);
    expect(r2.ok, JSON.stringify(op)).toBe(false);
    if (!r2.ok) expect(r2.problem.message).toContain("nope");
  }
});

test("rejects duplicate ids", () => {
  for (const id of ["a", "c", "s1"]) {
    const r = applyOps(base(), [{ op: "add", section: "s2", item: { id, c: { type: "text", md: "dup" } } }]);
    expect(r.ok, id).toBe(false);
  }
  const r = applyOps(base(), [{ op: "addSection", section: { id: "s9", layout: "grid", items: [{ id: "b", c: { type: "text", md: "x" } }] } }]);
  expect(r.ok).toBe(false);
});

test("changed lists touched ids", () => {
  const r = ok(base(), [
    { op: "add", section: "s1", item: { id: "z", c: { type: "text", md: "z" } } },
    { op: "update", id: "b", item: { span: 6 } },
    { op: "move", id: "c", section: "s1" },
  ]);
  expect(r.changed.sort()).toEqual(["b", "c", "z"]);
});

test("input view is not mutated", () => {
  const v = deepFreeze(base());
  const r = ok(v, [{ op: "update", id: "c", item: { c: { value: { x: 2 } } } }, { op: "remove", id: "a" }, { op: "set", title: "X" }]);
  expect(r.view.title).toBe("X");
  expect(v.title).toBe("T");
});

test("allIds lists sections and items", () => {
  expect(allIds(base()).sort()).toEqual(["a", "b", "c", "s1", "s2"]);
});

test("PatchOpSchema rejects an unknown op", () => {
  expect(PatchOpSchema.safeParse({ op: "explode", id: "a" }).success).toBe(false);
  expect(PatchOpSchema.safeParse({ op: "remove", id: "a" }).success).toBe(true);
});
