import { expect, test } from "vitest";
import { contrast, paletteWarnings, resolveStage, stageProblem, HOUSE, ViewSchema } from "../src/index.ts";

const HEX = /^#[0-9a-f]{6}$/;
const PAGES = ["#0a0a0a", "#f4efe6", "#0b1d3a", "#1e3b2f", "#fff7ed", "#3a0d0d", "#ffffff"];

test("without a page the stage is the house theme for the chosen mode", () => {
  const light = resolveStage("light");
  expect(light.mode).toBe("light");
  expect(light.page).toBe(HOUSE.light.page);
  expect(resolveStage("dark").ink).toBe(HOUSE.dark.ink);
  // a palette with only accent and series keeps the house stage and swaps those colours in
  const t = resolveStage("dark", { accent: "#e8590c", series: ["#e8590c", "#2f6fdf"] });
  expect(t.page).toBe(HOUSE.dark.page);
  expect(t.accent).toBe("#e8590c");
  expect(t.series.slice(0, 2)).toEqual(["#e8590c", "#2f6fdf"]);
  expect(t.series).toHaveLength(8);
});

test.each(PAGES)("page %s derives a legible, complete stage in hex", (page) => {
  const t = resolveStage("light", { page });
  for (const [k, v] of Object.entries(t)) {
    if (k === "mode" || k === "shadow" || k === "shadowHover") continue;
    for (const c of Array.isArray(v) ? v : [v]) expect(c, k).toMatch(HEX);
  }
  for (const bg of [t.page, t.surface]) {
    expect(contrast(t.ink, bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.ink2, bg)).toBeGreaterThanOrEqual(6);
    expect(contrast(t.muted, bg)).toBeGreaterThanOrEqual(3.5);
    for (const s of [t.good, t.bad, t.warn]) expect(contrast(s, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.accent, bg)).toBeGreaterThanOrEqual(3);
    for (const s of t.series) expect(contrast(s, bg)).toBeGreaterThanOrEqual(3);
  }
  // structure is visible but quiet
  expect(contrast(t.grid, t.page)).toBeGreaterThanOrEqual(1.15);
  expect(contrast(t.grid, t.page)).toBeLessThan(1.6);
  expect(contrast(t.axis, t.page)).toBeGreaterThan(contrast(t.grid, t.page));
  // the mode follows the page, whatever the person's theme
  expect(t.mode).toBe(contrast(page, "#ffffff") > contrast(page, "#000000") ? "dark" : "light");
  expect(resolveStage("dark", { page }).mode).toBe(t.mode);
});

test("a chosen ink is kept; a chosen accent and series are kept as the model wrote them", () => {
  const t = resolveStage("light", { page: "#0b0d10", ink: "#e9e6df", accent: "#e8590c", series: ["#e8590c", "#5b8def"] });
  expect(t.ink).toBe("#e9e6df");
  expect(t.accent).toBe("#e8590c");
  expect(t.series.slice(0, 2)).toEqual(["#e8590c", "#5b8def"]);
});

test("a page no ink can be read on, or an ink too faint for its page, is rejected with a way out", () => {
  expect(stageProblem({ page: "#777777" })).toMatch(/darker or lighter/);
  expect(stageProblem({ page: "#f4efe6", ink: "#999999" })).toMatch(/7:1/);
  expect(stageProblem({ ink: "#111111" })).toMatch(/page/);
  expect(stageProblem({ page: "#0a0a0a" })).toBeUndefined();
  expect(stageProblem({ accent: "#e8590c" })).toBeUndefined();
  const v = { v: 2, id: "x", title: "x", sections: [] };
  expect(ViewSchema.safeParse({ ...v, palette: { page: "#777777" } }).success).toBe(false);
  expect(ViewSchema.safeParse({ ...v, palette: { page: "#0b1d3a", ink: "#f2efe8", accent: "#f4b942" } }).success).toBe(true);
});

test("warnings name only the colours the model chose that are hard to see on the stage", () => {
  expect(paletteWarnings("light", { page: "#f4efe6" })).toEqual([]);
  expect(paletteWarnings("light", { page: "#0a0a0a", series: ["#e8590c", "#111111"] })).toEqual([expect.stringMatching(/#111111/)]);
  expect(paletteWarnings("dark", { accent: "#101010" })).toEqual([expect.stringMatching(/accent/)]);
});
