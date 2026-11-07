import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const shots = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/screenshots");
const status = async (request: APIRequestContext) => (await request.get("/api/views/gallery/status")).json();

async function show(page: Page, request: APIRequestContext, scheme: "light" | "dark") {
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.emulateMedia({ colorScheme: scheme });
  await page.goto("/#gallery");
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/gallery", { data: {} });
  expect(r.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("Component gallery");
  await expect.poll(async () => (await status(request)).unverified, { timeout: 15_000 }).toEqual([]);
  const s = await status(request);
  expect(s.problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
  await page.waitForTimeout(1500); // entrances and count-ups settle
  // Design frames outside the viewport aren't painted in a full-page capture: make the viewport the whole page first.
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 1360, height: h });
  await page.waitForTimeout(1200);
}

test("gallery renders every component in light and dark", async ({ page, request }) => {
  test.setTimeout(60_000);
  await show(page, request, "light");
  await page.screenshot({ path: path.join(shots, "gallery-light.png"), fullPage: true });
  await show(page, request, "dark");
  await page.screenshot({ path: path.join(shots, "gallery-dark.png"), fullPage: true });  // The catalog's own examples are what the skill teaches: they must pass aurora's design checks.
  await page.waitForTimeout(2000);
  expect((await status(request)).problems.filter((p: { severity: string; message: string }) => p.severity === "warning" && p.message.startsWith("design: "))).toEqual([]);
});
