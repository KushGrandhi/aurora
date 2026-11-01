import { expect, test } from "vitest";
import { SPRING, SPRING_SOFT, shouldGlow } from "../src/motion.tsx";

test("shouldGlow only for the current version", () => {
  expect(shouldGlow({ a: 3 }, "a", 3)).toBe(true);
  expect(shouldGlow({ a: 2 }, "a", 3)).toBe(false);
  expect(shouldGlow({}, "a", 3)).toBe(false);
});

test("spring presets", () => {
  expect(SPRING).toEqual({ type: "spring", stiffness: 380, damping: 32, mass: 0.9 });
  expect(SPRING_SOFT).toEqual({ type: "spring", stiffness: 220, damping: 28 });
});
