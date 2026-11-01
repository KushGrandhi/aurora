import { expect, test, type APIRequestContext } from "@playwright/test";

const view = (id: string) => ({ v: 2, id, title: "Motion", sections: [{ id: "s", layout: "grid", items: [
  { id: "keep", span: 6, c: { type: "text", md: "I stay put" } },
  { id: "other", span: 6, c: { type: "text", md: "Other" } },
] }] });
const render = (request: APIRequestContext, id: string) => request.post("/api/views", { data: { view: view(id) } });

test("patch does not remount unchanged items", async ({ page, request }) => {
  await page.goto("/#mo1");
  await expect(page.locator(".conn.up")).toBeVisible();
  await render(request, "mo1");
  await expect(page.locator('[data-item="keep"]')).toContainText("I stay put");
  await page.evaluate(() => { (document.querySelector('[data-item="keep"]') as HTMLElement & { tag?: string }).tag = "same"; });
  await request.post("/api/views/mo1/patch", { data: { ops: [
    { op: "add", section: "s", item: { id: "new", span: 12, c: { type: "text", md: "New one" } }, after: null },
    { op: "update", id: "other", item: { c: { md: "Other changed" } } },
  ] } });
  await expect(page.locator('[data-item="other"]')).toContainText("Other changed");
  await expect(page.locator('[data-item="new"]')).toBeVisible();
  expect(await page.evaluate(() => (document.querySelector('[data-item="keep"]') as HTMLElement & { tag?: string }).tag)).toBe("same");
  await expect(page.locator('[data-item="other"]')).toHaveAttribute("data-glow", "true");
  await expect(page.locator('[data-item="keep"]')).not.toHaveAttribute("data-glow", "true");
});

test("reduced motion renders without transforms", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#mo2");
  await expect(page.locator(".conn.up")).toBeVisible();
  await render(request, "mo2");
  await expect(page.locator('[data-item="keep"]')).toBeVisible();
  await page.waitForTimeout(50);
  const transform = await page.locator('[data-item="keep"]').evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe("none");
});
