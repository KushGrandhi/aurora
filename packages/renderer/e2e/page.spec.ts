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

const heroView = (id: string, heroFirst: boolean, title = "Full page") => {
  const hero = { id: "d", span: 12, c: { type: "design", framework: "react", display: "hero", files: { "App.tsx": app.replace("Full page", title) } } };
  const text = { id: "t", span: 12, c: { type: "text", md: "below the hero" } };
  return { v: 2, id, title: "Hero", sections: [{ id: "s", layout: "grid", items: heroFirst ? [hero] : [text, hero] }, { id: "more", title: "More", layout: "grid", items: heroFirst ? [text] : [] }].filter((s) => s.items.length) };
};

test("a hero design spans the page with sections below", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#hero1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: heroView("hero1", true) } })).status()).toBe(200);
  const hero = page.locator('[data-item="d"]');
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Full page");
  await expect(hero).not.toHaveClass(/\bcard\b/);
  await expect(hero.locator(".design-bar")).toHaveCount(0);
  const h = (await hero.boundingBox())!, t = (await page.locator('[data-item="t"]').boundingBox())!;
  expect(h.x + h.width).toBeGreaterThanOrEqual(1280 - 1); // runs to the window's right edge
  expect(h.y).toBeLessThanOrEqual(1); // from the very top
  expect(h.height).toBeGreaterThanOrEqual(800 - 2); // the whole first screen
  expect(t.y).toBeGreaterThan(h.y + h.height - 1);
  await expect.poll(async () => (await (await request.get("/api/views/hero1/status")).json()).unverified).toEqual([]);
  expect((await (await request.get("/api/views/hero1/status")).json()).problems).toEqual([]);
  // still versioned: a new version of the hero, then back to v1
  expect((await request.post("/api/views", { data: { view: heroView("hero1", true, "Second") } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Second");
  await hero.locator("button.open-page").click();
  await expect(page.locator(".page-view")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".page-view")).toHaveCount(0);
});

test("a hero that is not first renders as a card with a warning", async ({ page, request }) => {
  await page.goto("/#hero2");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: heroView("hero2", false) } })).status()).toBe(200);
  await expect(page.locator('[data-item="d"]')).toHaveClass(/\bcard\b/);
  await expect.poll(async () => JSON.stringify((await (await request.get("/api/views/hero2/status")).json()).problems)).toContain("hero only applies");
});

const sales = new URL("../../engine/test/fixtures/sales.csv", import.meta.url).pathname;

test("a hero view is immersive: the whole screen, the title on the stage, filters as one pill", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#hero3");
  await expect(page.locator(".conn.up")).toBeVisible();
  const view = { ...heroView("hero3", true), title: "Revenue, as light", summary: "One line under the title.", datasets: { data: sales },
    params: { region: { type: "select", label: "Region", options: { query: "regions", field: "region" } } },
    queries: { regions: { sql: "SELECT DISTINCT region FROM data ORDER BY region" } } };
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Full page");
  await expect(page.locator(".app")).toHaveClass(/\bimmersive\b/);
  // nothing beside the view: the stage spans the screen, and the way back to the list is a link in its corner
  await expect(page.locator(".side")).toHaveCount(0);
  const hero = (await page.locator(".hero").boundingBox())!;
  expect(hero.x).toBeLessThanOrEqual(0);
  expect(hero.width).toBeGreaterThanOrEqual(1280 - 2);
  await expect(page.locator(".hero .home-link")).toBeVisible();
  // the title, summary and filters sit on the stage, in its first screen
  const head = page.locator(".hero-head");
  await expect(head.locator("h1")).toHaveText("Revenue, as light");
  await expect(head).toContainText("One line under the title.");
  await expect(page.locator(".view-head")).toHaveCount(0);
  const hb = (await head.boundingBox())!;
  expect(hb.y + hb.height).toBeLessThanOrEqual(800);
  await expect(head.locator(".filterbar.pill select")).toBeVisible();
  await head.locator(".filterbar.pill select").selectOption("East");
  await expect.poll(async () => (await (await request.get("/api/views/hero3/status")).json()).params.region).toBe("East");
  await expect(head.locator(".version-strip, .versions, button").first()).toBeVisible();
});

test("every view has the whole screen; the list of views is a page of its own", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#hero4");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: heroView("hero4", false) } })).status()).toBe(200);
  await expect(page.locator('[data-item="d"]')).toHaveClass(/\bcard\b/);
  await expect(page.locator(".app")).not.toHaveClass(/\bimmersive\b/);
  await expect(page.locator(".side")).toHaveCount(0);
  expect((await page.locator("main").boundingBox())!.x).toBe(0);
  // the corner link opens the list; choosing a view opens it on the whole screen again
  await page.locator(".home-link").click();
  await expect(page).toHaveURL(/#\/views$/);
  await expect(page.locator(".views-title")).toHaveText("Views");
  await expect(page.locator(".app")).toHaveCount(0);
  await page.locator('.views-list a[data-view="hero4"]').click();
  await expect(page).toHaveURL(/#hero4$/);
  await expect(page.locator('[data-item="d"]')).toBeVisible();
});

test("on a phone a hero view stacks the title above the stage", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/#hero5");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: heroView("hero5", true) } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Full page");
  const head = (await page.locator(".hero-head").boundingBox())!, scene = (await page.locator('[data-item="d"]').boundingBox())!;
  expect(scene.y).toBeGreaterThanOrEqual(head.y + head.height - 1);
  expect(scene.width).toBeGreaterThanOrEqual(390 - 60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
