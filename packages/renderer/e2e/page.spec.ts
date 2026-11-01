import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const app = "export default () => <main className='min-h-screen grid place-items-center bg-slate-900 text-white'><h1 className='text-5xl'>Full page</h1></main>;";
async function post(page: Page, request: APIRequestContext, id: string, display: "page" | "card", siblings: unknown[] = []) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/#${id}`);
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id, title: "Launch", sections: [{ id: "s", title: "Section", layout: "grid", items: [{ id: "d", span: 12, c: { type: "design", framework: "react", display, files: { "App.tsx": app } } }, ...siblings] }] } } });
}

test("page display fills the screen", async ({ page, request }) => {
  await post(page, request, "pg1", "page");
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Full page");
  const box = (await page.locator('[data-item="d"] iframe').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(800 * 0.9);
  expect(box.width).toBeGreaterThanOrEqual(1280 * 0.85);
  await expect(page.locator(".section-title")).toHaveCount(0);
  await expect(page.locator(".page-bar")).toContainText("Launch");
  await expect.poll(async () => (await (await request.get("/api/views/pg1/status")).json()).unverified).toEqual([]);
});

test("card opens full screen and Escape returns", async ({ page, request }) => {
  await post(page, request, "pg2", "card", [{ id: "t", span: 12, c: { type: "text", md: "below" } }]);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Full page");
  await page.locator('[data-item="d"] button.open-page').click();
  await expect(page.locator(".page-view")).toBeVisible();
  const box = (await page.locator('.page-view iframe').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(800 * 0.9);
  await page.keyboard.press("Escape");
  await expect(page.locator(".page-view")).toHaveCount(0);
  await expect(page.locator('[data-item="t"]')).toContainText("below");
});

test("phone viewport is 390 wide in page display", async ({ page, request }) => {
  await post(page, request, "pg3", "page");
  await page.mouse.move(640, 20);
  await page.locator('.page-bar button[data-viewport="phone"]').click();
  await expect.poll(async () => Math.round((await page.locator('[data-item="d"] iframe').boundingBox())!.width)).toBe(390);
});

test("the bar comes back when the pointer reaches the top edge", async ({ page, request }) => {
  await post(page, request, "pg4", "page");
  await expect(page.locator(".page-bar")).toHaveClass(/idle/, { timeout: 5000 });
  await page.mouse.move(640, 400);
  await page.mouse.move(640, 10);
  await expect(page.locator(".page-bar")).not.toHaveClass(/idle/);
});
