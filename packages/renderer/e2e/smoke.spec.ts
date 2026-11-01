import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const sales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures/sales.csv");

test("renders default then composed view for sales.csv", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.locator(".dot.up")).toBeVisible();
  const res = await request.post("/api/render", { data: { data: sales, intent: "revenue" } });
  expect(res.status()).toBe(202);

  await expect(page.locator("h1")).toHaveText("Revenue overview");
  const kpi = page.locator('[data-item="k_total"] .value');
  await expect(kpi).toContainText("$");
  await expect(page.locator('[data-item="c_monthly"] svg').first()).toBeVisible();
  await expect(page.locator('[data-item="t_monthly"] tbody tr').nth(2)).toBeVisible();
  await expect(page.locator('[data-item="t_note"]')).toContainText("leads with $");
  await expect(page.locator(".footer")).toContainText("total");
  await expect(page.locator('[data-item^="d_"]')).toHaveCount(0);
  await expect(page.locator(".summary")).not.toContainText("{");
  await page.screenshot({ path: "test-results/smoke.png", fullPage: true });
});
