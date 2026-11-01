import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();
const view = (id: string, tiles: "osm" | "none") => ({ v: 2, id, title: "Map", datasets: {
  map_city_rows: { inline: [{ city: "London", lat: 51.51, lon: -0.13, visitors: 820 }, { city: "Paris", lat: 48.86, lon: 2.35, visitors: 640 }, { city: "Berlin", lat: 52.52, lon: 13.4, visitors: 410 }] },
  map_country_rows: { inline: [{ iso3: "GBR", visitors: 820 }, { iso3: "FRA", visitors: 640 }, { iso3: "DEU", visitors: 410 }] },
}, queries: { cities: { sql: "SELECT city, lat, lon, visitors FROM map_city_rows" }, countries: { sql: "SELECT iso3, visitors FROM map_country_rows" } },
sections: [{ id: "s", layout: "grid", items: [{ id: "m", span: 12, c: { type: "map", tiles,
  points: { query: "cities", lat: "lat", lon: "lon", label: "city", size: "visitors" },
  choropleth: { query: "countries", key: "iso3", value: "visitors" },
  routes: [{ path: [[-0.13, 51.51], [2.35, 48.86], [13.4, 52.52]], label: "Tour" }],
} }] }] });

/** Distinct colours in a grid of samples from the map canvas. */
const colours = (page: Page) => page.locator('[data-item="m"] canvas').evaluate((c: HTMLCanvasElement) => {
  const t = document.createElement("canvas");
  t.width = c.width; t.height = c.height;
  const g = t.getContext("2d")!;
  g.drawImage(c, 0, 0);
  const seen = new Set<string>();
  for (let x = 5; x < c.width; x += Math.floor(c.width / 24)) for (let y = 5; y < c.height; y += Math.floor(c.height / 16)) seen.add(g.getImageData(x, y, 1, 1).data.slice(0, 3).join(","));
  return seen.size;
});

test("points, routes and choropleth render", async ({ page, request }) => {
  await page.goto("/#mp1");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: view("mp1", "none") } });
  await expect(page.locator('[data-item="m"] canvas')).toBeVisible();
  await expect.poll(async () => (await status(request, "mp1")).unverified, { timeout: 10_000 }).toEqual([]);
  expect((await status(request, "mp1")).problems).toEqual([]);
  await expect(page.locator('[data-item="m"] .map-legend')).toContainText("Visitors");
  await expect.poll(() => colours(page)).toBeGreaterThan(3);
});

test("map works offline", async ({ page, request }) => {
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto("/#mp2");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: view("mp2", "osm") } });
  await expect.poll(async () => (await status(request, "mp2")).unverified, { timeout: 10_000 }).toEqual([]);
  expect((await status(request, "mp2")).problems).toEqual([]);
  await expect.poll(() => colours(page)).toBeGreaterThan(1);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "test-results/map-offline.png" });
});
