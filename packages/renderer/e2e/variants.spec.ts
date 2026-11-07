import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const hero = (text: string) => `export default () => <main className='min-h-screen grid place-items-center'><h1 className='text-6xl font-bold'>${text}</h1></main>;`;
async function setup(page: Page, request: APIRequestContext, id: string) {
  await page.setViewportSize({ width: 1360, height: 860 });
  await page.goto(`/#${id}`);
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id, title: "Hero", sections: [{ id: "s", layout: "grid", items: [{ id: "d", c: { type: "design", framework: "react", display: "page", files: { "App.tsx": hero("Original") } } }] }] } } });
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Original");
}
const edit = (label: string, text: string) => ({ label, ops: [{ op: "editFile", id: "d", path: "App.tsx", content: hero(text) }] });

test("three options, pick one", async ({ page, request }) => {
  await setup(page, request, "vr1");
  const r = await request.post("/api/views/vr1/variants", { data: { variants: [edit("Bold", "Option A"), edit("Calm", "Option B"), edit("Playful", "Option C")] } });
  expect(r.status()).toBe(200);
  const cols = page.locator(".variants .variant");
  await expect(cols).toHaveCount(3);
  await expect(cols.nth(0).locator(".variant-label")).toHaveText("Bold");
  for (const [i, t] of ["Option A", "Option B", "Option C"].entries()) await expect(cols.nth(i).frameLocator("iframe").locator("h1")).toHaveText(t);
  await cols.nth(1).locator("button.choose").click();
  await expect(page.locator(".variants")).toHaveCount(0);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Option B");
  const s = await (await request.get("/api/views/vr1/status")).json();
  expect(s.version).toBe(2);
  const { events } = await (await request.get("/api/views/vr1/events")).json();
  expect(events.at(-1)).toMatchObject({ name: "aurora:variant-picked", payload: { index: 1, label: "Calm", version: 2 } });
});

test("variants can be closed and reopened", async ({ page, request }) => {
  await setup(page, request, "vr2");
  await request.post("/api/views/vr2/variants", { data: { variants: [edit("A", "One"), edit("B", "Two")] } });
  await expect(page.locator(".variants .variant")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".variants")).toHaveCount(0);
  await page.mouse.move(680, 10);
  await page.locator("button.variants-open").click();
  await expect(page.locator(".variants .variant")).toHaveCount(2);
});

test("compare two versions and use one", async ({ page, request }) => {
  await setup(page, request, "vr3");
  await request.post("/api/views/vr3/patch", { data: { ops: [{ op: "editFile", id: "d", path: "App.tsx", content: hero("Second") }] } });
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Second");
  await page.mouse.move(680, 10);
  await page.locator(".version-chip").click();
  await page.locator('input[data-compare="1"]').check();
  await page.locator('input[data-compare="2"]').check();
  await page.locator("button.compare").click();
  const cols = page.locator(".variants .variant");
  await expect(cols).toHaveCount(2);
  await expect(cols.nth(0).locator(".variant-label")).toHaveText("v1");
  await expect(cols.nth(0).frameLocator("iframe").locator("h1")).toHaveText("Original");
  await cols.nth(0).locator("button.choose").click();
  await expect(page.locator(".variants")).toHaveCount(0);
  await expect(page.frameLocator('[data-item="d"] iframe').locator("h1")).toHaveText("Original");
  expect((await (await request.get("/api/views/vr3/status")).json()).version).toBe(3);
});

test("variant previews don't change the live view's design warnings", async ({ page, request }) => {
  await setup(page, request, "vr9");
  const scene = "import { Scene, Metal } from 'aurora/kit';\nexport default () => <div style={{ height: 400 }}><Scene><mesh><boxGeometry /><Metal /></mesh></Scene></div>;";
  const r = await request.post("/api/views/vr9/variants", { data: { variants: [
    { label: "A", ops: [{ op: "editFile", id: "d", path: "App.tsx", content: scene }, { op: "update", id: "d", item: { c: { display: "card" } } }] },
    { label: "B", ops: [{ op: "editFile", id: "d", path: "App.tsx", content: scene }, { op: "update", id: "d", item: { c: { display: "card" } } }] },
  ] } });
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator(".variants .variant")).toHaveCount(2);
  await page.waitForTimeout(5000);
  const s = await (await request.get("/api/views/vr9/status")).json();
  expect(s.problems.filter((p: { message: string }) => p.message.startsWith("design: "))).toEqual([]);
});
