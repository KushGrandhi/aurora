import { expect, test } from "vitest";
import type { View, ViewItem } from "@genui/spec";
import { validateView } from "../src/validateView.ts";

const view = (items: ViewItem[], extra: Partial<View> = {}): View => ({
  v: 2, id: "v", title: "T",
  queries: { total: { sql: "SELECT sum(revenue) AS v FROM data" }, rows: { sql: "SELECT region, revenue FROM data" }, size: { sql: "SELECT sum(size_mb) AS total_size FROM data" } },
  sections: [{ id: "main", layout: "grid", items }], ...extra,
});
const ctx = () => ({ queryRows: new Map([["total", 1], ["rows", 5], ["size", 1]]), querySql: new Map([["total", "SELECT sum(revenue) AS v FROM data"], ["rows", "SELECT region, revenue FROM data"], ["size", "SELECT sum(size_mb) AS total_size FROM data"]]) });
const items = (v: View) => v.sections[0].items;

test("unknown type is an error but others survive", () => {
  const r = validateView(view([{ id: "x", c: { type: "hologram" } }, { id: "t", c: { type: "text", md: "hi" } }]), ctx());
  expect(r.invalid).toEqual(new Set(["x"]));
  expect(r.problems).toHaveLength(1);
  expect(r.problems[0]).toMatchObject({ itemId: "x", severity: "error" });
  expect(r.problems[0].message).toContain("hologram");
  expect(items(r.view)).toHaveLength(2);
});

test("schema error names the path", () => {
  const r = validateView(view([{ id: "k", c: { type: "kpi", query: "total", label: "Total" } }]), ctx());
  expect(r.invalid.has("k")).toBe(true);
  expect(r.problems[0].message).toContain("field");
});

test("kpi on multi-row query is invalid", () => {
  const r = validateView(view([{ id: "k", c: { type: "kpi", query: "rows", field: "revenue", label: "Revenue" } }]), ctx());
  expect(r.invalid.has("k")).toBe(true);
  expect(r.problems[0].message).toMatch(/5 rows/);
});

test("authored text may contain numbers", () => {
  const r = validateView({ v: 2, id: "v", title: "T", summary: "Runs 2 regions", sections: [{ id: "s", layout: "tabs", items: [{ id: "t", title: "Step 1", c: { type: "text", md: "3 replicas behind 1 load balancer" } }, { id: "j", c: { type: "json", value: { replicas: 3 } } }] }] }, { queryRows: new Map(), querySql: new Map() });
  expect(r.problems).toEqual([]);
  expect(r.invalid.size).toBe(0);
});

test("data-bound kpi label with digits is invalid", () => {
  const r = validateView(view([{ id: "k", c: { type: "kpi", query: "total", field: "v", label: "Revenue 4.2M" } }]), ctx());
  expect(r.invalid.has("k")).toBe(true);
  expect(r.problems[0].message).toContain("4.2");
});

test("currency on megabytes is corrected", () => {
  const r = validateView(view([{ id: "k", c: { type: "kpi", query: "size", field: "total_size", label: "Total size", format: "currency" } }]), ctx());
  expect(r.problems).toEqual([]);
  expect(items(r.view)[0].c.format).toBe("megabytes");
});

test("chart inline data stripped", () => {
  const r = validateView(view([{ id: "c", c: { type: "chart", query: "rows", vegaLite: { data: { values: [{ a: 1 }] }, mark: "bar", encoding: { x: { field: "revenue", type: "quantitative" }, y: { field: "region", type: "nominal" } } } } }]), ctx());
  expect(r.problems).toEqual([]);
  expect((items(r.view)[0].c.vegaLite as Record<string, unknown>).data).toBeUndefined();
});

test("placeholder to missing query is invalid", () => {
  const r = validateView(view([{ id: "t", c: { type: "text", md: "Total {nope.v|currency}" } }]), ctx());
  expect(r.invalid.has("t")).toBe(true);
  expect(r.problems[0].message).toContain("nope");
});

test("data-bound item reading a missing query is invalid", () => {
  const r = validateView(view([{ id: "tb", c: { type: "table", query: "ghost" } }]), ctx());
  expect(r.invalid.has("tb")).toBe(true);
  expect(r.problems[0].message).toContain("ghost");
});

test("placeholder on multi-row query is invalid, single-row placeholder normalized", () => {
  const bad = validateView(view([{ id: "t", c: { type: "text", md: "Lead {rows.revenue}" } }]), ctx());
  expect(bad.invalid.has("t")).toBe(true);
  const good = validateView(view([{ id: "t", c: { type: "text", md: "Size {size.total_size|currency}" } }]), ctx());
  expect(good.problems).toEqual([]);
  expect(items(good.view)[0].c.md).toBe("Size {size.total_size|megabytes}");
});

test("summary placeholders are checked", () => {
  const r = validateView(view([], { summary: "Total {ghost.v}" }), ctx());
  expect(r.problems[0].message).toContain("ghost");
});

test("d_ ids are allowed in views", () => {
  const r = validateView(view([{ id: "d_total", c: { type: "kpi", query: "total", field: "v", label: "Total" } }]), ctx());
  expect(r.problems).toEqual([]);
});

test("query with unknown $var is an error", () => {
  const r = validateView({ v: 2, id: "v", title: "T", queries: { f: { sql: "SELECT sum(revenue) AS v FROM data WHERE region = $region" } }, sections: [] }, { queryRows: new Map(), querySql: new Map() });
  expect(r.problems).toHaveLength(1);
  expect(r.problems[0].itemId).toBeUndefined();
  expect(r.problems[0].message).toContain("f");
  expect(r.problems[0].message).toContain("$region");
  const ok = validateView({ v: 2, id: "v", title: "T", params: { region: { type: "select", label: "Region", options: ["East"] } }, queries: { f: { sql: "SELECT sum(revenue) AS v FROM data WHERE region = $region" } }, sections: [] }, { queryRows: new Map(), querySql: new Map() });
  expect(ok.problems).toEqual([]);
});

test("component check failure is invalid", () => {
  const r = validateView(view([{ id: "a", c: { type: "architecture", nodes: [{ id: "x", label: "X" }], edges: [{ from: "x", to: "ghost" }] } }]), ctx());
  expect(r.invalid.has("a")).toBe(true);
  expect(r.problems[0]).toMatchObject({ itemId: "a", severity: "error" });
  expect(r.problems[0].message).toContain("ghost");
});

test("param options query must exist", () => {
  const r = validateView(view([], { params: { region: { type: "select", label: "Region", options: { query: "regions", field: "region" } } } }), ctx());
  expect(r.problems).toHaveLength(1);
  expect(r.problems[0].message).toContain("regions");
});
