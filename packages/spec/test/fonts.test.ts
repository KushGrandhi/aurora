import { expect, test } from "vitest";
import { css2Family, fontEntry, fontSlug, FontsSchema, suggestFonts, ViewSchema } from "../src/index.ts";

test("finds a Google Fonts family by name, ignoring case and spacing", () => {
  expect(fontEntry("Fraunces")?.family).toBe("Fraunces");
  expect(fontEntry("  space grotesk ")?.family).toBe("Space Grotesk");
  expect(fontEntry("Frances")).toBeUndefined();
  expect(fontEntry("Material Symbols Outlined")).toBeUndefined();
});

test("a misspelt family gets suggestions", () => {
  expect(suggestFonts("Frances")).toContain("Fraunces");
  expect(suggestFonts("Space Grotesque")[0]).toBe("Space Grotesk");
});

test("slugs are safe path segments", () => {
  expect(fontSlug("IBM Plex Mono")).toBe("ibm-plex-mono");
  expect(fontSlug("../../etc")).toBe("etc");
});

test("the CSS2 request matches what each family actually has", () => {
  // variable with italics, static with italics, a single style
  expect(css2Family(fontEntry("Fraunces")!)).toBe("Fraunces:ital,wght@0,100..900;1,100..900");
  expect(css2Family(fontEntry("IBM Plex Mono")!)).toBe("IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700");
  expect(css2Family(fontEntry("Bebas Neue")!)).toBe("Bebas+Neue");
});

test("a view can name its fonts", () => {
  const v = { v: 2, id: "x", title: "x", sections: [] };
  expect(ViewSchema.safeParse({ ...v, fonts: { display: "Fraunces", body: "Inter", mono: "JetBrains Mono", extra: ["Caveat"] } }).success).toBe(true);
  expect(FontsSchema.safeParse({ display: "x".repeat(100) }).success).toBe(false);
});
