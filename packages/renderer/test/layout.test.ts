import { expect, test } from "vitest";
import type { Item } from "@genui/spec";
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
