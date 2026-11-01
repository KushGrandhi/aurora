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

test("a chart is not redrawn when another item is patched", async ({ page, request }) => {
  const { fileURLToPath } = await import("node:url");
  const path = await import("node:path");
  const sales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures/sales.csv");
  await page.goto("/#mo3");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id: "mo3", title: "Chart", datasets: { data: sales }, queries: { b: { sql: "SELECT region, sum(revenue) AS revenue FROM data GROUP BY 1" } },
    sections: [{ id: "s", layout: "grid", items: [{ id: "ch", span: 8, c: { type: "chart", query: "b", vegaLite: { mark: "bar", encoding: { y: { field: "region", type: "nominal" }, x: { field: "revenue", type: "quantitative" } } } } }, { id: "t", span: 4, c: { type: "text", md: "one" } }] }] } } });
  await expect(page.locator('[data-item="ch"] svg').first()).toBeVisible();
  await page.evaluate(() => { (document.querySelector('[data-item="ch"] svg') as SVGElement & { tag?: string }).tag = "same"; });
  await request.post("/api/views/mo3/patch", { data: { ops: [{ op: "update", id: "t", item: { c: { md: "two" } } }] } });
  await expect(page.locator('[data-item="t"]')).toContainText("two");
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (document.querySelector('[data-item="ch"] svg') as SVGElement & { tag?: string })?.tag)).toBe("same");
});

test("the screen follows a newly created view", async ({ page, request }) => {
  await page.goto("/#mo_first");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { ...view("mo_first"), title: "First" } } });
  await expect(page.locator("h1")).toHaveText("First");
  await request.post("/api/views", { data: { view: { ...view("mo_new"), title: "Brand new" } } });
  await expect(page.locator("h1")).toHaveText("Brand new");
  await expect.poll(async () => (await (await request.get("/api/views/mo_new/status")).json()).unverified).toEqual([]);
});
