import { expect, test } from "vitest";
import { HOUSE, SURFACES, contourPath, resolveStage, rgbOf, surfaceStyle } from "../src/index.ts";

test("every surface makes CSS for light and dark stages, coloured from the stage ink", () => {
  for (const mode of ["light", "dark"] as const) {
    const st = HOUSE[mode];
    const [r, g, b] = rgbOf(st.ink);
    for (const kind of SURFACES) {
      const css = surfaceStyle(kind, st);
      expect(css.backgroundImage.length, kind).toBeGreaterThan(10);
      if (["grain", "paper", "blueprint", "dots", "contour", "halftone"].includes(kind)) {
        const txt = decodeURIComponent(css.backgroundImage);
        const asFraction = [r, g, b].map((v) => (v / 255).toFixed(3)).join(" ");
        expect(txt.includes(`rgba(${r}, ${g}, ${b}`) || txt.replace(/\s+/g, " ").includes(asFraction.split(" ")[0]), `${mode} ${kind}`).toBe(true);
      }
    }
  }
});

test("a surface follows the view's palette", () => {
  const st = resolveStage("dark", { page: "#0b1d2a", ink: "#e6f0f5", accent: "#f2b134" });
  expect(surfaceStyle("thermal", st).backgroundImage).toContain(`rgba(${rgbOf(st.accent).join(", ")}`);
});

test("contours are deterministic per seed and small enough to draw at render time", () => {
  expect(contourPath(3)).toBe(contourPath(3));
  expect(contourPath(3)).not.toBe(contourPath(4));
  const t = performance.now();
  const p = contourPath(7);
  expect(performance.now() - t).toBeLessThan(60);
  expect(p.length).toBeGreaterThan(1000);
  expect(p.length).toBeLessThan(200_000);
});
