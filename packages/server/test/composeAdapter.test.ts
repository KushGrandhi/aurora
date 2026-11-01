import { expect, test } from "vitest";
import type { RenderEvent, Spec } from "@genui/spec";
import { createComposeAdapter } from "../src/composeAdapter.ts";

const def: Spec = { v: 1, title: "Default", queries: { d_q: { sql: "SELECT count(*) AS n FROM data" } }, layout: { type: "grid", cols: 12, items: [
  { id: "d_rows", span: 3, c: { type: "kpi", query: "d_q", field: "n", label: "Rows" } },
  { id: "d_table", span: 12, c: { type: "table", query: "d_q" } },
] } };
const ev = (e: Record<string, unknown>) => ({ renderId: "r1", ...e }) as RenderEvent;

test("default view then composed items replace d_ items", () => {
  const adapt = createComposeAdapter("r1", "/data.csv");
  const r = adapt(ev({ t: "default", spec: def }));
  expect(r?.kind).toBe("render");
  if (r?.kind === "render") {
    expect(r.view.id).toBe("r1");
    expect(r.view.datasets).toEqual({ data: "/data.csv" });
    expect(r.view.sections[0].items.map((i) => i.id)).toEqual(["d_rows", "d_table"]);
  }
  const q = adapt(ev({ t: "result", queryId: "a", sql: "SELECT 1 AS v FROM data", result: { columns: [], rows: [], truncated: false, ms: 1 } }));
  expect(q).toEqual({ kind: "patch", ops: [{ op: "addQuery", id: "a", sql: "SELECT 1 AS v FROM data" }] });
  const first = adapt(ev({ t: "item", order: 1, item: { id: "k1", span: 3, c: { type: "kpi", query: "a", field: "v", label: "V" } } }));
  expect(first).toEqual({ kind: "patch", ops: [
    { op: "remove", id: "d_rows" }, { op: "remove", id: "d_table" },
    { op: "add", section: "main", item: { id: "k1", span: 3, c: { type: "kpi", query: "a", field: "v", label: "V" } }, after: null },
  ] });
  const earlier = adapt(ev({ t: "item", order: 0, item: { id: "k0", span: 3, c: { type: "text", md: "x" } } }));
  expect(earlier).toEqual({ kind: "patch", ops: [{ op: "add", section: "main", item: { id: "k0", span: 3, c: { type: "text", md: "x" } }, after: null }] });
  const later = adapt(ev({ t: "item", order: 5, item: { id: "k5", span: 3, c: { type: "text", md: "y" } } }));
  expect(later?.kind === "patch" && later.ops[0]).toMatchObject({ op: "add", after: "k1" });
  const again = adapt(ev({ t: "item", order: 5, item: { id: "k5", span: 6, c: { type: "text", md: "y2" } } }));
  expect(again?.kind === "patch" && again.ops[0]).toMatchObject({ op: "replace", id: "k5" });
});

test("meta becomes set op", () => {
  const adapt = createComposeAdapter("r1", "/data.csv");
  adapt(ev({ t: "default", spec: def }));
  expect(adapt(ev({ t: "meta", title: "T", summary: "S" }))).toEqual({ kind: "patch", ops: [{ op: "set", title: "T", summary: "S" }] });
});

test("start, done and errors become activity and problems", () => {
  const adapt = createComposeAdapter("r1", { a: "/a.csv" });
  expect(adapt(ev({ t: "start" }))?.kind).toBe("activity");
  expect(adapt(ev({ t: "error", message: "boom" }))).toEqual({ kind: "problem", problem: { severity: "error", message: "composer: boom" } });
  expect(adapt(ev({ t: "done", timings: {}, cached: false }))).toEqual({ kind: "activity", text: "" });
});

test("cached compose without a default renders on first meta", () => {
  const adapt = createComposeAdapter("r1", "/d.csv");
  const r = adapt(ev({ t: "meta", title: "Cached" }));
  expect(r?.kind).toBe("render");
  if (r?.kind === "render") expect(r.view.title).toBe("Cached");
});
