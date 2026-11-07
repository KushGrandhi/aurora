import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();
const frame = (page: Page, item = "d") => page.frameLocator(`[data-item="${item}"] iframe`);
const design = (app: string, more: Record<string, unknown> = {}) => ({ type: "design", framework: "react", height: 520, files: { "App.tsx": app }, ...more });

async function show(page: Page, request: APIRequestContext, id: string, items: { id: string; c: unknown }[]) {
  await page.goto(`/#${id}`);
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view: { v: 2, id, title: "Kit", sections: [{ id: "s", layout: "grid", items: items.map((i) => ({ span: 12, ...i })) }] } } });
  expect(r.status(), await r.text()).toBe(200);
}

const SCENE_APP = `
import { Stage, Scene, Metal, Label, Panel, ControlBar, useClock } from "aurora/kit";
export default function App() {
  const clock = useClock({ period: 720, speed: 90 });
  return (
    <Stage scene={<Scene><mesh castShadow><cylinderGeometry args={[0.5, 0.5, 1, 32]} /><Metal /></mesh><Label at={[0, 1, 0]}>piston</Label></Scene>}>
      <Panel at="top-left"><h2 id="title">Kit scene</h2></Panel>
      <Panel at="bottom"><ControlBar clock={clock} /></Panel>
    </Stage>
  );
}`;

test("a kit scene renders with labels, panels and controls", async ({ page, request }) => {
  await show(page, request, "kit1", [{ id: "d", c: design(SCENE_APP) }]);
  const f = frame(page);
  await expect(f.locator("canvas")).toHaveCount(1);
  await expect(f.locator("#title")).toHaveText("Kit scene");
  await expect(f.getByText("piston")).toBeVisible();
  await f.getByRole("button", { name: "Pause" }).click();
  await expect(f.getByRole("button", { name: "Play" })).toBeVisible();
  await expect.poll(async () => (await status(request, "kit1")).unverified).toEqual([]);
  expect((await status(request, "kit1")).problems).toEqual([]);
});

test("two kit scenes on one view both render", async ({ page, request }) => {
  const app = `import { Scene, Glass } from "aurora/kit";\nexport default function App() { return <div style={{ height: 400 }}><Scene><mesh><boxGeometry /><Glass /></mesh></Scene></div>; }`;
  await show(page, request, "kit2", [{ id: "a", c: design(app) }, { id: "b", c: design(app) }]);
  await expect(frame(page, "a").locator("canvas")).toHaveCount(1);
  await expect(frame(page, "b").locator("canvas")).toHaveCount(1);
});

test("kit colors follow the theme without remounting", async ({ page, request }) => {
  const app = `
import { useEffect, useRef, useState } from "react";
import { Panel, useToken } from "aurora/kit";
let mounts = 0;
export default function App() {
  const [n] = useState(() => ++mounts);
  const accent = useToken("--accent");
  const [, force] = useState(0);
  useEffect(() => window.aurora?.onTheme?.(() => force((x) => x + 1)), []);
  return <div style={{ height: 300 }}><Panel at="top-left"><p id="t" data-mounts={n} data-accent={"#" + accent.getHexString()}>hello</p></Panel></div>;
}`;
  await show(page, request, "kit3", [{ id: "d", c: design(app) }]);
  const t = frame(page).locator("#t");
  await expect(t).toBeVisible();
  const before = await t.getAttribute("data-accent");
  const colorBefore = await t.evaluate((el) => getComputedStyle(el.closest("[data-kit-panel]")!).color);
  await page.locator(".theme-toggle").click();
  await expect.poll(() => t.getAttribute("data-accent")).not.toBe(before);
  await expect.poll(() => t.evaluate((el) => getComputedStyle(el.closest("[data-kit-panel]")!).color)).not.toBe(colorBefore);
  expect(await t.getAttribute("data-mounts")).toBe("1");
});
