import { expect, test } from "@playwright/test";

// A monitor or an explorer: compact sections are dense and glanceable, and carry the filters on screen.

const sales = { inline: Array.from({ length: 60 }, (_, i) => ({ day: `2026-0${1 + (i % 3)}-${String(1 + (i % 28)).padStart(2, "0")}`, region: ["North", "South", "East", "West"][i % 4], revenue: 100 + ((i * 37) % 90), orders: 10 + ((i * 13) % 20) })) };
const kpi = (id: string, field: string, label: string) => ({ id, c: { type: "kpi", query: "tot", field, label, sparkline: { query: "daily", x: "day", y: "revenue" } } });
const chart = (id: string, y: string) => ({ id, c: { type: "chart", query: "byRegion", vegaLite: { mark: "bar", encoding: { x: { field: "region", type: "nominal" }, y: { field: y, type: "quantitative" } } } } });
const view = (id: string, immersive = false) => ({
  v: 2, id, title: "Shop today", immersive,
  datasets: { s: sales },
  params: { region: { type: "select", label: "Region", options: ["North", "South", "East", "West"] } },
  queries: {
    tot: { sql: "SELECT sum(revenue) AS rev, sum(orders) AS ord, avg(revenue) AS avg, count(*) AS n, max(revenue) AS mx, min(revenue) AS mn, sum(revenue)/sum(orders) AS aov, count(DISTINCT region) AS regions FROM s WHERE ($region IS NULL OR region = $region)" },
    daily: { sql: "SELECT day, sum(revenue) AS revenue FROM s GROUP BY 1 ORDER BY 1" },
    byRegion: { sql: "SELECT region, sum(revenue) AS revenue, sum(orders) AS orders FROM s WHERE ($region IS NULL OR region = $region) GROUP BY 1" },
  },
  sections: [
    ...(immersive ? [{ id: "intro", layout: "grid", height: "screen", items: [{ id: "big", c: { type: "text", md: "# A story first" } }] }] : []),
    { id: "mon", title: "Right now", layout: "grid", density: "compact", items: [
      kpi("k1", "rev", "Revenue"), kpi("k2", "ord", "Orders"), kpi("k3", "avg", "Average"), kpi("k4", "n", "Rows"),
      kpi("k5", "mx", "Best"), kpi("k6", "mn", "Worst"), kpi("k7", "aov", "Order value"), kpi("k8", "regions", "Regions"),
      { ...chart("c1", "revenue"), span: 6 }, { ...chart("c2", "orders"), span: 6 },
    ] },
    { id: "rows", title: "Every row", layout: "grid", density: "compact", items: [{ id: "t", c: { type: "table", query: "byRegion" } }] },
  ],
});

test("a compact monitor shows its eight tiles and its charts on the first screen, tiles in balanced rows", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#dn1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: view("dn1") } })).status()).toBe(200);
  await expect(page.locator('[data-item="c2"] svg').first()).toBeVisible();
  const boxes = await Promise.all(["k1", "k4", "k5", "k8", "c1", "c2"].map(async (id) => (await page.locator(`[data-item="${id}"]`).boundingBox())!));
  for (const b of boxes) expect(b.y + b.height, JSON.stringify(b)).toBeLessThanOrEqual(900);
  // 8 tiles: 4 + 4, the same width
  expect(Math.round(boxes[0].width)).toBe(Math.round(boxes[1].width));
  expect(Math.round(boxes[0].y)).toBe(Math.round(boxes[1].y));
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  await expect(page.locator(".section.band")).toHaveCount(0);
  await expect(page.locator(".kpi.hero")).toHaveCount(0);
  // the filters live in the compact section and stay on screen while it scrolls
  await expect(page.locator(".view-body > .filterbar, .page > .filterbar")).toHaveCount(0);
  const bar = page.locator('[data-section="mon"] .section-filters');
  await expect(bar).toBeVisible();
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBe(0);
});

test("on a phone a compact section puts two tiles a row and doesn't scroll sideways", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/#dn2");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: view("dn2") } })).status()).toBe(200);
  await expect(page.locator('[data-item="k8"]')).toBeVisible();
  const [a, b] = await Promise.all(["k1", "k2"].map(async (id) => (await page.locator(`[data-item="${id}"]`).boundingBox())!));
  expect(Math.round(a.y)).toBe(Math.round(b.y));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("in an immersive story that hands over to an explorer, the sticky filters appear only with the explorer", async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#dn3");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: view("dn3", true) } })).status()).toBe(200);
  const bar = page.locator('[data-section="mon"] .section-filters');
  await expect(bar).toBeAttached();
  // on the opening screen the explorer's bar is far below
  expect((await bar.boundingBox())!.y).toBeGreaterThan(900);
  await page.locator('[data-section="rows"]').scrollIntoViewIfNeeded();
  await expect.poll(async () => Math.round((await bar.boundingBox())!.y)).toBeLessThanOrEqual(60);
});

test("a misspelt or misplaced field comes back as a warning naming where it belongs", async ({ request }) => {
  const v = view("dn4");
  (v as Record<string, unknown>).density = "compact";
  (v.sections[0] as Record<string, unknown>).densty = "compact";
  const r = await request.post("/api/views", { data: { view: v } });
  expect(r.status()).toBe(200);
  const msgs = ((await r.json()).problems as { message: string }[]).map((p) => p.message);
  expect(msgs).toContainEqual(expect.stringMatching(/the view has no field "density"; density belongs on a section/));
  expect(msgs).toContainEqual(expect.stringMatching(/section "mon" has no field "densty"; did you mean "density"/));
  // and the stored view doesn't keep them
  const stored = (await (await request.get("/api/views/dn4")).json()).view;
  expect(stored.density).toBeUndefined();
});
