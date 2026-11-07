import { expect, test } from "vitest";
import { mergeReport, mergeWarnings, type Pending } from "../src/reports.ts";

test("reports for one version accumulate; failures win", () => {
  let p: Pending | undefined;
  p = mergeReport(p, 1, "a", true)!;
  p = mergeReport(p, 1, "b", false, "boom")!;
  p = mergeReport(p, 1, "b", true)!;
  expect([...p.ok]).toEqual(["a"]);
  expect([...p.failed]).toEqual([["b", "boom"]]);
});

test("a newer version starts fresh", () => {
  const p = mergeReport(mergeReport(undefined, 1, "a", true), 2, "b", true)!;
  expect(p.version).toBe(2);
  expect([...p.ok]).toEqual(["b"]);
});

test("a late report for an older version doesn't discard the newer pending report", () => {
  const v2 = mergeReport(undefined, 2, "a", true)!;
  expect(mergeReport(v2, 1, "map", true)).toBeUndefined();
});

test("a retracting ok report clears the item's earlier failure", () => {
  let p = mergeReport(undefined, 1, "d", false, "design: did not finish loading")!;
  p = mergeReport(p, 1, "d", true)!;
  expect([...p.failed]).toEqual([["d", "design: did not finish loading"]]);
  p = mergeReport(p, 1, "d", true, undefined, true)!;
  expect([...p.failed]).toEqual([]);
  expect([...p.ok]).toEqual(["d"]);
});

test("design warnings ride along with a version and never fail the item", () => {
  let p = mergeReport(undefined, 3, "d", true)!;
  p = mergeWarnings(p, 3, "d", ["text overflows"])!;
  expect([...p.ok]).toEqual(["d"]);
  expect([...p.warnings]).toEqual([["d", ["text overflows"]]]);
  const v4 = mergeReport(p, 4, "d", true)!;
  expect([...v4.warnings]).toEqual([]);
  expect(mergeWarnings(v4, 3, "d", ["late"])).toBeUndefined();
});
