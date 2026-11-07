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

test("sections read like an article: bare items, strong headings, alternating bands", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#sec1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  await expect(page.locator('[data-item="tbl"] td').first()).toBeVisible();
  // prose, numbers and steps sit straight on the page
  for (const id of ["k", "t", "st"]) expect(await look(page, id), id).toEqual({ bg: "rgba(0, 0, 0, 0)", shadow: "none", outline: "none" });
  // a table keeps a surface
  expect((await look(page, "tbl")).bg).not.toBe("rgba(0, 0, 0, 0)");
  // headings are large, with no template label above them
  const h = page.locator('[data-section="a"] .section-title');
  expect(parseFloat(await h.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(28);
  await expect(page.locator(".section-eyebrow")).toHaveCount(0);
  // every other section sits on a full-width band, without scrolling sideways
  await expect(page.locator('[data-section="b"]')).toHaveClass(/\bband\b/);
  await expect(page.locator('[data-section="a"]')).not.toHaveClass(/\bband\b/);
  await page.locator('[data-section="b"]').scrollIntoViewIfNeeded();
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
  await expect(page.locator('[data-section="b"] .section-title')).toHaveText("The circuit");
  await expect(page.locator('[data-section="b"]')).not.toHaveClass(/\bband\b/); // the first section shown starts the rhythm
});

test("the screen and designs use aurora's own typefaces, not Inter or the system font", async ({ page, request }) => {
  await page.goto("/#sec3");
  await expect(page.locator(".conn.up")).toBeVisible();
  const app = "export default () => <div><p id='sans'>Body</p><p id='serif' className='font-serif'>Serif</p></div>;";
  expect((await request.post("/api/views", { data: { view: { v: 2, id: "sec3", title: "Type", sections: [{ id: "s", layout: "grid", items: [{ id: "d", c: { type: "design", framework: "react", files: { "App.tsx": app } } }] }] } } })).status()).toBe(200);
  expect(await page.evaluate(() => getComputedStyle(document.body).fontFamily)).toMatch(/^"?Hanken Grotesk/);
  const f = page.frameLocator('[data-item="d"] iframe');
  await expect(f.locator("#sans")).toBeVisible();
  expect(await f.locator("#sans").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Hanken Grotesk/);
  expect(await f.locator("#serif").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Newsreader/);
  // the fonts actually load (bundled, no network)
  await expect.poll(() => f.locator("#serif").evaluate(() => document.fonts.check("16px 'Newsreader Variable'"))).toBe(true);
});

test("a headline number shows its value at once instead of counting up", async ({ page, request }) => {
  await page.goto("/#sec4");
  await expect(page.locator(".conn.up")).toBeVisible();
  const v = { v: 2, id: "sec4", title: "Numbers", datasets: { d: { inline: [{ n: 4934 }] } }, queries: { q: { sql: "SELECT sum(n) AS n FROM d" } },
    sections: [{ id: "s", layout: "grid", items: [{ id: "k", span: 4, c: { type: "kpi", query: "q", field: "n", label: "Units", format: "integer" } }] }] };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  const value = page.locator('[data-item="k"] .value');
  await expect(value).not.toHaveText("—");
  expect(await value.textContent()).toBe("4,934");
});

test("a view can choose its own palette; the screen, charts and designs all use it", async ({ page, request }) => {
  await page.goto("/#sec5");
  await expect(page.locator(".conn.up")).toBeVisible();
  const app = "export default () => <p id='p' className='text-accent'>tinted</p>;";
  const v = { v: 2, id: "sec5", title: "Heart", palette: { accent: "#c2410c", series: ["#b91c1c", "#1d4ed8"] },
    datasets: { d: { inline: [{ side: "left", ml: 70 }, { side: "right", ml: 70 }] } }, queries: { q: { sql: "SELECT side, ml FROM d" } },
    sections: [{ id: "s", layout: "grid", items: [
      { id: "ch", span: 6, c: { type: "chart", query: "q", vegaLite: { mark: "bar", encoding: { y: { field: "side", type: "nominal" }, x: { field: "ml", type: "quantitative" }, color: { field: "side", type: "nominal" } } } } },
      { id: "d", span: 6, c: { type: "design", framework: "react", files: { "App.tsx": app } } },
    ] }] };
  const r = await request.post("/api/views", { data: { view: v } });
  expect(r.status(), await r.text()).toBe(200);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector(".app")!).getPropertyValue("--accent").trim())).toBe("#c2410c");
  await expect(page.locator('[data-item="ch"] path[fill="#b91c1c"], [data-item="ch"] path[style*="#b91c1c"], [data-item="ch"] path[fill="rgb(185, 28, 28)"]').first()).toBeVisible();
  const f = page.frameLocator('[data-item="d"] iframe');
  await expect(f.locator("#p")).toBeVisible();
  expect(await f.locator("#p").evaluate((el) => getComputedStyle(el).color)).toBe("rgb(194, 65, 12)");
  // a bad colour is a problem on the view, not a crash
  const bad = await request.post("/api/views", { data: { view: { ...v, id: "sec5b", palette: { accent: "orange-ish" } } } });
  expect(bad.status()).toBe(400);
});
