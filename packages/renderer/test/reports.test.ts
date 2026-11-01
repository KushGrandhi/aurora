import { expect, test } from "vitest";
import { mergeReport, type Pending } from "../src/reports.ts";

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
