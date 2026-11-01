import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures/sales.csv");

test("filter re-runs dependent queries", async ({ page, request }) => {
  await page.goto("/#flt");
  await expect(page.locator(".conn.up")).toBeVisible();
  const res = await request.post("/api/views", { data: { view: {
    v: 2, id: "flt", title: "Filters", datasets: { data: sales },
    params: { region: { type: "select", label: "Region", options: { query: "regions", field: "region" } } },
    queries: {
      regions: { sql: "SELECT DISTINCT region FROM data ORDER BY region" },
      bound: { sql: "SELECT sum(revenue) AS revenue FROM data WHERE ($region IS NULL OR region = $region)" },
      fixed: { sql: "SELECT count(*) AS orders FROM data" },
    },
    sections: [{ id: "s", layout: "grid", items: [
      { id: "kb", span: 6, c: { type: "kpi", query: "bound", field: "revenue", label: "Revenue", format: "currency" } },
      { id: "kf", span: 6, c: { type: "kpi", query: "fixed", field: "orders", label: "Orders" } },
    ] }],
  } } });
  expect(res.status()).toBe(200);
  const bound = page.locator('[data-item="kb"] .value');
  await expect(bound).not.toHaveText("—");
  await page.waitForTimeout(1300); // count-up settles
  const before = await bound.textContent();
  await page.evaluate(() => { (document.querySelector('[data-item="kf"] .value') as HTMLElement & { tag?: string }).tag = "same"; });

  await page.locator(".filterbar select").selectOption("East");
  await expect(bound).not.toHaveText(before!);
  await expect.poll(async () => (await (await request.get("/api/views/flt/status")).json()).params.region).toBe("East");
  expect(await page.evaluate(() => (document.querySelector('[data-item="kf"] .value') as HTMLElement & { tag?: string }).tag)).toBe("same");
});

test("kpi sparkline renders", async ({ page, request }) => {
  await page.goto("/#spk");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: {
    v: 2, id: "spk", title: "Spark", datasets: { data: sales },
    queries: { total: { sql: "SELECT sum(revenue) AS revenue FROM data" }, trend: { sql: "SELECT date_trunc('month', date) AS month, sum(revenue) AS revenue FROM data GROUP BY 1 ORDER BY 1" } },
    sections: [{ id: "s", layout: "grid", items: [{ id: "k", span: 4, c: { type: "kpi", query: "total", field: "revenue", label: "Revenue", sparkline: { query: "trend", x: "month", y: "revenue" } } }] }],
  } } });
  const d = await page.locator('[data-item="k"] svg.spark path').first().getAttribute("d");
  expect(d && d.length).toBeTruthy();
  await expect.poll(async () => (await (await request.get("/api/views/spk/status")).json()).unverified).toEqual([]);
});
