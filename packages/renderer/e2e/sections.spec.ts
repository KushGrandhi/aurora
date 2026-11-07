import { expect, test, type Page } from "@playwright/test";

// Sections read like an article: content sits on the page under strong headings; only dense data keeps a surface.
const view = {
  v: 2, id: "sec1", title: "Sections",
  datasets: { d: { inline: [{ region: "East", revenue: 10 }, { region: "West", revenue: 20 }] } },
  queries: { total: { sql: "SELECT sum(revenue) AS revenue FROM d" }, rows: { sql: "SELECT region, revenue FROM d ORDER BY region" } },
  sections: [
    { id: "a", title: "Numbers", layout: "grid", items: [
      { id: "k", span: 4, c: { type: "kpi", query: "total", field: "revenue", label: "Revenue" } },
      { id: "t", span: 8, c: { type: "text", md: "Plain prose on the page." } },
      { id: "tbl", span: 12, c: { type: "table", query: "rows", title: "Rows" } },
    ] },
    { id: "b", title: "How it works", layout: "grid", items: [
      { id: "st", span: 12, c: { type: "steps", steps: [{ title: "One" }, { title: "Two" }] } },
    ] },
  ],
};

const look = (page: Page, id: string) => page.locator(`[data-item="${id}"]`).evaluate((el) => {
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, shadow: cs.boxShadow, outline: cs.outlineStyle === "none" || cs.outlineWidth === "0px" ? "none" : cs.outlineStyle };
});

test("sections read like an article: bare items, strong numbered headings, alternating bands", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#sec1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  await expect(page.locator('[data-item="tbl"] td').first()).toBeVisible();
  // prose, numbers and steps sit straight on the page
  for (const id of ["k", "t", "st"]) expect(await look(page, id), id).toEqual({ bg: "rgba(0, 0, 0, 0)", shadow: "none", outline: "none" });
  // a table keeps a surface
  expect((await look(page, "tbl")).bg).not.toBe("rgba(0, 0, 0, 0)");
  // headings are large, with a number above them
  const h = page.locator('[data-section="a"] .section-title');
  expect(parseFloat(await h.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
  await expect(page.locator('[data-section="a"] .section-eyebrow')).toHaveText("01");
  await expect(page.locator('[data-section="b"] .section-eyebrow')).toHaveText("02");
  // every other section sits on a full-width band, without covering the sidebar or scrolling sideways
  await expect(page.locator('[data-section="b"]')).toHaveClass(/\bband\b/);
  await expect(page.locator('[data-section="a"]')).not.toHaveClass(/\bband\b/);
  await page.locator('[data-section="b"]').scrollIntoViewIfNeeded();
  const b = (await page.locator('[data-section="b"]').boundingBox())!;
  const atSide = await page.evaluate(([y]) => !!document.elementFromPoint(100, y)?.closest(".side"), [b.y + b.height / 2]);
  expect(atSide).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
});

test("a titled section that only held the hero leaves no empty heading behind", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#sec2");
  await expect(page.locator(".conn.up")).toBeVisible();
  const hero = { id: "d", c: { type: "design", framework: "react", display: "hero", files: { "App.tsx": "export default () => <h1>Scene</h1>;" } } };
  const v = { v: 2, id: "sec2", title: "Heart", sections: [
    { id: "a", title: "The heart in motion", layout: "grid", items: [hero] },
    { id: "b", title: "The circuit", layout: "grid", items: [{ id: "t", c: { type: "text", md: "steps" } }] },
  ] };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Scene");
  await expect(page.locator('[data-section="a"]')).toHaveCount(0);
  await expect(page.locator('[data-section="b"] .section-eyebrow')).toHaveText("01");
});
