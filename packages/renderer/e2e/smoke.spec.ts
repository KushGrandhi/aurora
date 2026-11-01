import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const sales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures/sales.csv");

test("plan 1 render: default then composed view for sales.csv", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator(".conn.up")).toBeVisible();
  const res = await request.post("/api/render", { data: { data: sales, intent: "revenue" } });
  expect(res.status()).toBe(202);
  const { renderId } = await res.json();
  await page.goto(`/#${renderId}`);
  await expect(page.locator("h1")).toHaveText("Revenue overview");
  await expect(page.locator('[data-item="k_total"] .value')).toContainText("$");
  await expect(page.locator('[data-item="c_monthly"] svg').first()).toBeVisible();
  await expect(page.locator('[data-item="t_monthly"] tbody tr').nth(2)).toBeVisible();
  await expect(page.locator('[data-item="t_note"]')).toContainText("leads with $");
  await expect(page.locator('[data-item^="d_"]')).toHaveCount(0);
  await expect(page.locator(".summary")).not.toContainText("{");
  await page.screenshot({ path: "test-results/smoke.png", fullPage: true });
});

test("v2 view: sections, tabs, patch, reports and version picking", async ({ page, request }) => {
  await page.goto("/#canvas");
  await expect(page.locator(".conn.up")).toBeVisible();
  const view = {
    v: 2, id: "canvas", title: "Canvas demo", datasets: { data: sales },
    queries: { total: { sql: "SELECT sum(revenue) AS total_revenue FROM data" }, byRegion: { sql: "SELECT region, sum(revenue) AS revenue FROM data GROUP BY 1 ORDER BY 2 DESC" } },
    sections: [
      { id: "overview", title: "Overview", layout: "grid", items: [
        { id: "k", span: 4, c: { type: "kpi", query: "total", field: "total_revenue", label: "Revenue" } },
        { id: "ch", span: 8, c: { type: "chart", query: "byRegion", vegaLite: { mark: "bar", encoding: { y: { field: "region", type: "nominal", sort: "-x" }, x: { field: "revenue", type: "quantitative" } } } } },
      ] },
      { id: "details", title: "Details", layout: "tabs", items: [
        { id: "notes", title: "Notes", c: { type: "text", md: "Runs on **3 replicas**." } },
        { id: "cfg", title: "Config", c: { type: "json", value: { service: "auth", replicas: 3, regions: ["eu", "us"] } } },
      ] },
    ],
  };
  const r1 = await request.post("/api/views", { data: { view } });
  expect((await r1.json()).version).toBe(1);
  await expect(page.locator("h1")).toHaveText("Canvas demo");
  await expect(page.locator('[data-item="k"] .value')).toContainText("$");
  await expect(page.locator('[data-item="ch"] svg').first()).toBeVisible();
  await page.getByRole("tab", { name: "Config" }).click();
  await expect(page.locator('[data-item="cfg"] .json')).toContainText("replicas");

  const r2 = await request.post("/api/views/canvas/patch", { data: { baseVersion: 1, ops: [{ op: "add", section: "overview", item: { id: "added", span: 12, c: { type: "text", md: "Added by a patch" } } }] } });
  expect((await r2.json()).version).toBe(2);
  await expect(page.locator('[data-item="added"]')).toContainText("Added by a patch");

  await expect.poll(async () => (await (await request.get("/api/views/canvas/status")).json()).unverified, { timeout: 5000 }).toEqual([]);

  await page.locator(".version-chip").click();
  await page.locator('.version-list button[data-version="1"]').click();
  await expect(page.locator(".preview-banner")).toBeVisible();
  await expect(page.locator('[data-item="added"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Use this version" }).click();
  await expect.poll(async () => (await (await request.get("/api/views/canvas")).json()).version).toBe(3);
  await expect(page.locator(".preview-banner")).toHaveCount(0);
  await expect(page.locator('[data-item="added"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/canvas.png", fullPage: true });
});
