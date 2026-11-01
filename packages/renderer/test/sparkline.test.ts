import { expect, test } from "vitest";
import { sparklinePath } from "../src/sparkline.ts";

test("sparklinePath scales into the box", () => {
  const d = sparklinePath([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 2 }], 100, 20);
  expect(d.startsWith("M2,")).toBe(true);
  expect(d.match(/L/g)).toHaveLength(2);
  expect(d).toBe("M2,18L50,2L98,10");
});

test("sparklinePath needs two points", () => {
  expect(sparklinePath([{ x: 0, y: 1 }], 100, 20)).toBe("");
  expect(sparklinePath([], 100, 20)).toBe("");
});

test("equal ys draw a flat line through the middle", () => {
  const d = sparklinePath([{ x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 }], 100, 20);
  for (const [, y] of d.matchAll(/[ML][\d.]+,([\d.]+)/g)) expect(Number(y)).toBe(10);
});
