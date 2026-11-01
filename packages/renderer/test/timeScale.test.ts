import { expect, test } from "vitest";
import { timeScale } from "../src/timeScale.ts";

test("three years give year ticks", () => {
  const s = timeScale(["2023-02-01", "2024-06-15", "2026-01-10"], 800);
  expect(s.ticks.length).toBeGreaterThanOrEqual(3);
  expect(s.ticks.length).toBeLessThanOrEqual(7);
  for (const t of s.ticks) expect(t.label).toMatch(/^\d{4}$/);
});

test("two weeks give day ticks", () => {
  const s = timeScale(["2026-03-01", "2026-03-08", "2026-03-15"], 800);
  expect(s.ticks.length).toBeGreaterThanOrEqual(3);
  expect(s.ticks.length).toBeLessThanOrEqual(7);
  for (const t of s.ticks) expect(t.label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
});

test("a few months give month ticks", () => {
  const s = timeScale(["2026-01-05", "2026-05-20"], 800);
  for (const t of s.ticks) expect(t.label).toMatch(/^[A-Z][a-z]{2} \d{4}$/);
});

test("x is linear and padded", () => {
  const s = timeScale(["2026-01-01", "2026-12-31"], 1000);
  expect(s.x("2026-01-01")).toBeLessThan(s.x("2026-12-31"));
  expect(s.x("2026-01-01")).toBeGreaterThan(0);
  expect(s.x("2026-12-31")).toBeLessThan(1000);
  for (const t of s.ticks) { expect(t.at).toBeGreaterThanOrEqual(0); expect(t.at).toBeLessThanOrEqual(1000); }
});

test("a single date still gives a usable scale", () => {
  const s = timeScale(["2026-04-01"], 600);
  expect(Number.isFinite(s.x("2026-04-01"))).toBe(true);
  expect(s.ticks.length).toBeGreaterThan(0);
});
