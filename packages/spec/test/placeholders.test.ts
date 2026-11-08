import { expect, test } from "vitest";
import { fillPlaceholders, formatValue, parsePlaceholders, type QueryResult } from "../src/index.ts";

const r = (rows: Record<string, unknown>[]): QueryResult => ({ columns: [], rows, truncated: false, ms: 0 });

test("fills placeholders from first row with formats", () => {
  expect(fillPlaceholders("Rev {t.v|currency}, up {g.p|percent}, {g.p|delta}",
    { t: r([{ v: 1234.5 }]), g: r([{ p: 0.12 }]) })).toBe("Rev $1,234.50, up 12%, +12%");
});

test("missing result renders ellipsis", () => expect(fillPlaceholders("{x.y}", {})).toBe("…"));

test("parsePlaceholders extracts refs", () =>
  expect(parsePlaceholders("{a.b} and {c.d|integer}")).toEqual([
    { queryId: "a", field: "b" }, { queryId: "c", field: "d", format: "integer" }]));

test("whole dollars show no cents", () => {
  expect(formatValue(12180, "currency")).toBe("$12,180");
  expect(formatValue(12.5, "currency")).toBe("$12.50");
});
