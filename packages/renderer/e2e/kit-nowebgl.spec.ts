import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Its own file: launch options force a new browser, which Playwright allows only at the top level of a file.
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-3d-apis"] } });

const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();
const frame = (page: Page) => page.frameLocator(`[data-item="d"] iframe`);

test("a kit scene without webgl shows its fallback", async ({ page, request }) => {
  await page.goto("/#kit4");
  await expect(page.locator(".conn.up")).toBeVisible();
  const app = `import { Scene, Metal } from "aurora/kit";\nexport default function App() { return <div style={{ height: 300 }}><Scene><mesh><boxGeometry /><Metal /></mesh></Scene></div>; }`;
  const r = await request.post("/api/views", { data: { view: { v: 2, id: "kit4", title: "Kit", sections: [{ id: "s", layout: "grid", items: [{ id: "d", span: 12, c: { type: "design", framework: "react", height: 400, files: { "App.tsx": app } } }] }] } } });
  expect(r.status(), await r.text()).toBe(200);
  await expect(frame(page).locator("[data-kit-fallback]")).toBeVisible();
  await expect.poll(async () => (await status(request, "kit4")).unverified).toEqual([]);
  expect((await status(request, "kit4")).problems).toEqual([]);
});
