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
  expect((await status(request, "kit1")).problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
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

test("the skill's 3D mechanism example renders as a hero with no warnings", async ({ page, request }) => {
  const { readFileSync } = await import("node:fs");
  const dir = new URL("../../server/src/skill/examples/mechanism/", import.meta.url);
  const files = Object.fromEntries(["App.tsx", "Engine.tsx", "model.ts"].map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#kitmech");
  await expect(page.locator(".conn.up")).toBeVisible();
  const view = { v: 2, id: "kitmech", title: "V8", sections: [{ id: "s", layout: "grid", items: [{ id: "d", span: 12, c: { type: "design", framework: "react", display: "hero", files } }] }, { id: "t", layout: "grid", items: [{ id: "x", span: 12, c: { type: "text", md: "below" } }] }] };
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  await expect(frame(page).locator("canvas")).toHaveCount(1);
  await expect(frame(page).getByText("crankshaft", { exact: true })).toBeVisible();
  await page.waitForTimeout(3500); // design checks run after the frame settles
  const s = await status(request, "kitmech");
  expect(s.unverified).toEqual([]);
  expect(s.problems).toEqual([]);
});

const tokenHex = (page: Page, name: string) => frame(page).locator("body").evaluate((_, n) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const c = document.createElement("canvas").getContext("2d")!; c.fillStyle = v; return c.fillStyle as string;
}, name);

test("token materials recolor when their color prop or the theme changes", async ({ page, request }) => {
  const app = `
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Scene, Glow } from "aurora/kit";
function Probe({ color }) { const ref = useRef(null); useFrame(() => { if (ref.current) document.body.dataset.mat = "#" + ref.current.material.color.getHexString(); }); return <mesh ref={ref}><boxGeometry /><Glow color={color} /></mesh>; }
export default function App() { const [c, setC] = useState("--s1"); return <div style={{ height: 320 }}><button id="swap" onClick={() => setC("--bad")}>swap</button><Scene><Probe color={c} /></Scene></div>; }`;
  await show(page, request, "kit5", [{ id: "d", c: design(app) }]);
  const mat = () => frame(page).locator("body").getAttribute("data-mat");
  await expect.poll(mat).toBe(await tokenHex(page, "--s1"));
  await frame(page).locator("#swap").click();
  await expect.poll(mat).toBe(await tokenHex(page, "--bad"));
  await page.locator(".theme-toggle").click();
  await expect.poll(async () => (await tokenHex(page, "--bad")) === (await mat())).toBe(true);
  expect(await tokenHex(page, "--bad")).not.toBe("#d03b3b"); // the dark value, not the light one
});

test("3D labels sit below floating panels", async ({ page, request }) => {
  await show(page, request, "kit6", [{ id: "d", c: design(SCENE_APP) }]);
  const z = await frame(page).locator("[data-kit-label]").first().evaluate((el) => Number(getComputedStyle(el.parentElement!.parentElement!).zIndex || 0));
  expect(z).toBeLessThan(10);
});

test("on a phone the stage grows so every panel stays reachable", async ({ page, request }) => {
  const app = SCENE_APP.replace('<Panel at="top-left"><h2 id="title">Kit scene</h2></Panel>', '<Panel at="top-left"><h2 id="title">Kit scene</h2><p>A long paragraph that wraps over several lines on a narrow phone screen, so the panels need room.</p></Panel><Panel at="top-right"><div style={{ height: 380 }}>Second panel, tall like a dial plus readouts and a paragraph.</div></Panel>');
  await show(page, request, "kit7", [{ id: "d", c: { type: "design", framework: "react", viewport: "phone", files: { "App.tsx": app } } }]);
  const f = frame(page);
  await expect(f.getByRole("button", { name: "Pause" })).toBeAttached();
  await page.waitForTimeout(800);
  const inside = await f.getByRole("button", { name: "Pause" }).evaluate((b) => b.getBoundingClientRect().bottom <= b.closest("[data-kit-stage]")!.getBoundingClientRect().bottom);
  expect(inside).toBe(true);
});

test("a bug inside a 3D scene is reported, not blamed on WebGL", async ({ page, request }) => {
  const app = `import { Scene } from "aurora/kit";\nfunction Broken() { throw new Error("boom3d"); }\nexport default function App() { return <div style={{ height: 300 }}><Scene><Broken /></Scene></div>; }`;
  await show(page, request, "kit8", [{ id: "d", c: design(app) }]);
  await expect(frame(page).locator("[data-kit-fallback]")).toContainText("hit an error");
  await expect.poll(async () => JSON.stringify((await status(request, "kit8")).problems)).toContain("boom3d");
});

test("panels and labels carry no box by default; glass is opt-in", async ({ page, request }) => {
  const app = `
import { Stage, Scene, Metal, Label, Panel, Stat } from "aurora/kit";
export default function App() {
  return (
    <Stage scene={<Scene><mesh><boxGeometry /><Metal /></mesh><Label at={[0, 1, 0]}>part</Label></Scene>}>
      <Panel at="top-left"><h2 id="bare">Bare</h2></Panel>
      <Panel at="top-right" glass><h2 id="glass">Glass</h2></Panel>
      <Panel at="bottom-left"><Stat label="Revenue" value="$98,491" note="all regions" /></Panel>
    </Stage>
  );
}`;
  await show(page, request, "kit9", [{ id: "d", c: design(app) }]);
  const f = frame(page);
  await expect(f.getByText("part")).toBeVisible();
  const box = (sel: string) => f.locator(sel).evaluate((el) => {
    const p = el.closest("[data-kit-panel]") as HTMLElement, cs = getComputedStyle(p);
    return { bg: cs.backgroundColor, shadow: cs.boxShadow };
  });
  const bare = await box("#bare");
  expect(bare.bg).toBe("rgba(0, 0, 0, 0)");
  expect(bare.shadow).toBe("none");
  expect((await box("#glass")).shadow).not.toBe("none");
  const pill = await f.locator("[data-kit-label] span").last().evaluate((el) => { const cs = getComputedStyle(el); return { bg: cs.backgroundColor, shadow: cs.boxShadow }; });
  expect(pill).toEqual({ bg: "rgba(0, 0, 0, 0)", shadow: "none" });
  const value = f.getByText("$98,491");
  expect(parseFloat(await value.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(40);
  await expect.poll(async () => (await status(request, "kit9")).unverified).toEqual([]);
  expect((await status(request, "kit9")).problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
});

test("in a hero, left panels stay clear of the screen's title", async ({ page, request }) => {
  const app = `import { Stage, Scene, Metal, Panel } from "aurora/kit";
export default function App() { return <Stage scene={<Scene><mesh><boxGeometry /><Metal /></mesh></Scene>}><Panel at="top-left"><h2 id="tl">Readout</h2></Panel></Stage>; }`;
  await page.setViewportSize({ width: 1280, height: 800 });
  await show(page, request, "kit10", [{ id: "d", c: { type: "design", framework: "react", display: "hero", files: { "App.tsx": app } } }]);
  const f = frame(page);
  await expect(f.locator("#tl")).toBeVisible();
  const { left, width } = await f.locator("#tl").evaluate((el) => ({ left: (el.closest("[data-kit-panel]") as HTMLElement).getBoundingClientRect().left, width: innerWidth }));
  expect(left).toBeGreaterThanOrEqual(width * 0.18);
});
