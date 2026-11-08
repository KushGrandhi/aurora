import { expect, test } from "vitest";
import type { Item } from "@aurora/spec";
import { packRows } from "../src/layout.ts";

const it = (id: string, span: number, type = "chart"): Item =>
  ({ id, span, c: type === "kpi" ? { type: "kpi", query: "q", field: "v", label: "L" } : { type: "table", query: "q" } }) as Item;
const spans = (items: Item[]) => packRows(items).map((i) => i.span);

test("a run of KPIs shares the row evenly", () => {
  expect(spans([it("a", 4, "kpi"), it("b", 4, "kpi"), it("t", 12)])).toEqual([6, 6, 12]);
  expect(spans([it("a", 3, "kpi"), it("b", 3, "kpi"), it("c", 3, "kpi")])).toEqual([4, 4, 4]);
});
test("a row that does not fill the width is stretched", () => {
  expect(spans([it("a", 6), it("b", 4), it("c", 12)])).toEqual([6, 6, 12]);
  expect(spans([it("a", 8)])).toEqual([12]);
});
test("full rows are untouched", () => {
  expect(spans([it("a", 8), it("b", 4)])).toEqual([8, 4]);
});
test("a lone KPI keeps its span beside other items", () => {
  expect(spans([it("k", 4, "kpi"), it("c", 8)])).toEqual([4, 8]);
});

test("KPI runs split into balanced rows whose sizes divide twelve", async () => {
  const { kpiRows } = await import("../src/layout.ts");
  expect(kpiRows(8)).toEqual([4, 4]);
  expect(kpiRows(6)).toEqual([3, 3]);
  expect(kpiRows(6, 6)).toEqual([6]);
  expect(kpiRows(5)).toEqual([3, 2]);
  expect(kpiRows(5, 6)).toEqual([3, 2]);
  expect(kpiRows(7)).toEqual([4, 3]);
  expect(kpiRows(10, 6)).toEqual([3, 2, 3, 2]);
  for (let n = 2; n <= 12; n++) for (const max of [4, 6]) for (const c of kpiRows(n, max)) expect(12 % c, `${n}/${max}`).toBe(0);
});

test("KPIs that finish a row beside other items keep their spans", () => {
  expect(spans([it("t", 6), it("a", 3, "kpi"), it("b", 3, "kpi"), it("c", 12)])).toEqual([6, 3, 3, 12]);
  expect(spans([it("t", 4), it("a", 4, "kpi"), it("b", 4, "kpi")])).toEqual([4, 4, 4]);
  expect(spans([it("a", 3, "kpi"), it("b", 3, "kpi"), it("t", 6), it("c", 12)])).toEqual([3, 3, 6, 12]);
  // uneven or too-narrow tiles are balanced as before
  expect(spans([it("t", 6), it("a", 5, "kpi"), it("b", 1, "kpi")])).toEqual([12, 6, 6]);
  expect(spans([it("a", 2, "kpi"), it("b", 2, "kpi"), it("t", 4)])).toEqual([6, 6, 12]);
  // a run that doesn't fit the rest of its row is still balanced on rows of its own
  expect(spans([it("t", 6), it("a", 4, "kpi"), it("b", 4, "kpi")])).toEqual([12, 6, 6]);
});
