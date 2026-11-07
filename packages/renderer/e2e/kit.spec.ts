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

test("the skill's 3D mechanism example is a story: steps drive the pinned scene, with no warnings", async ({ page, request }) => {
  const { readFileSync } = await import("node:fs");
  const dir = new URL("../../server/src/skill/examples/mechanism/", import.meta.url);
  const files = Object.fromEntries(["App.tsx", "Engine.tsx", "model.ts"].map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#kitmech");
  await expect(page.locator(".conn.up")).toBeVisible();
  const filler = " Words to give the step some length.".repeat(10);
  const view = { v: 2, id: "kitmech", title: "V8", palette: { accent: "#e8590c" }, sections: [{ id: "s", title: "Four strokes", layout: "story", items: [
    { id: "d", c: { type: "design", framework: "react", files } },
    { id: "s1", c: { type: "text", md: "**Compression.**" + filler }, story: { state: { cylinder: 1, stroke: 3 } } },
    { id: "s2", c: { type: "text", md: "**Power.**" + filler }, story: { state: { cylinder: 1, stroke: 0 } } },
  ] }, { id: "t", layout: "grid", items: [{ id: "x", span: 12, c: { type: "text", md: "below" } }] }] };
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  await expect(frame(page).locator("canvas")).toHaveCount(1);
  await expect(frame(page).getByText("crankshaft", { exact: true })).toBeVisible();
  // each step freezes the engine on its stroke
  await page.locator('[data-item="s2"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(frame(page).locator("[data-kit-panel]").getByText("Power", { exact: true })).toBeVisible();
  await expect(frame(page).getByRole("button", { name: "Play" })).toBeVisible(); // frozen there, not running past it
  await page.waitForTimeout(1500);
  await expect(frame(page).locator("[data-kit-panel]").getByText("Power", { exact: true })).toBeVisible();
  await page.locator('[data-item="s1"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(frame(page).locator("[data-kit-panel]").getByText("Compression", { exact: true })).toBeVisible();
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

test("useFocus links a kit scene to the rest of the view", async ({ page, request }) => {
  const app = `import { useFocus } from "aurora/kit";
export default function App() {
  const [focus, setFocus] = useFocus();
  return <div><p id="v">{focus ?? "none"}</p><button id="b" onMouseEnter={() => setFocus("West")} onMouseLeave={() => setFocus(null)}>West</button></div>;
}`;
  await page.goto("/#kit11");
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view: { v: 2, id: "kit11", title: "Kit", datasets: { d: { inline: [{ region: "East" }, { region: "West" }] } }, queries: { q: { sql: "SELECT region FROM d ORDER BY region" } },
    sections: [{ id: "s", layout: "grid", items: [{ id: "d", span: 6, c: design(app, { height: 200 }) }, { id: "t", span: 6, c: { type: "table", query: "q" } }] }] } } });
  expect(r.status()).toBe(200);
  const f = frame(page);
  await expect(f.locator("#v")).toHaveText("none");
  await f.locator("#b").hover();
  await expect(page.locator('[data-item="t"] tr.focused')).toContainText("West");
  await page.locator('[data-item="t"] tr', { hasText: "East" }).hover();
  await expect(f.locator("#v")).toHaveText("East");
});

test("useStory and useParam give a kit scene the story step and the view's params", async ({ page, request }) => {
  const app = `import { useStory, useParam } from "aurora/kit";
export default function App() {
  const story = useStory();
  const rpm = useParam<number>("rpm");
  return <div style={{ height: 300 }}><p id="s">{story ? story.index + ":" + (story.state as any)?.phase : "none"}</p><p id="r">{String(rpm)}</p></div>;
}`;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#kit12");
  await expect(page.locator(".conn.up")).toBeVisible();
  const steps = [0, 1].map((i) => ({ id: `s${i}`, c: { type: "text", md: `Step ${i}. ` + "words ".repeat(80) }, story: { state: { phase: i } } }));
  const r = await request.post("/api/views", { data: { view: { v: 2, id: "kit12", title: "Kit", params: { rpm: { type: "number", label: "Speed", min: 0, max: 10, default: 4 } },
    sections: [{ id: "a", layout: "story", items: [{ id: "d", c: design(app) }, ...steps] }] } } });
  expect(r.status(), await r.text()).toBe(200);
  const f = frame(page);
  await expect(f.locator("#r")).toHaveText("4");
  await page.locator('[data-item="s1"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(f.locator("#s")).toHaveText("1:1");
});

test("Scrubber scrubs time and jumps to marked moments; Grab turns time by dragging a part", async ({ page, request }) => {
  const app = `import { Scene, Metal, Grab, Scrubber, useClock } from "aurora/kit";
export default function App() {
  const clock = useClock({ period: 720, speed: 90, playing: false });
  return (
    <div>
      <div style={{ height: 300 }}><Scene autoRotate={false}><Grab clock={clock} rate={2}><mesh><boxGeometry args={[3, 3, 3]} /><Metal /></mesh></Grab></Scene></div>
      <Scrubber clock={clock} marks={[{ at: 180, label: "ignition" }, { at: 540, label: "exhaust opens" }]} />
      <p id="t">{Math.round(clock.t)}</p>
    </div>
  );
}`;
  await page.setViewportSize({ width: 1280, height: 900 });
  await show(page, request, "kit13", [{ id: "d", c: design(app, { height: 520 }) }]);
  const f = frame(page);
  await expect(f.locator("#t")).toHaveText("0");
  // a marked moment
  await f.getByRole("button", { name: "ignition" }).click();
  await expect(f.locator("#t")).toHaveText("180");
  // drag along the track to three quarters
  const track = f.locator("[data-kit-scrubber] [role=slider]");
  const b = (await track.boundingBox())!;
  await page.mouse.move(b.x + 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.75, b.y + b.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await f.locator("#t").textContent())).toBeGreaterThan(500);
  await expect.poll(async () => Number(await f.locator("#t").textContent())).toBeLessThan(580);
  // the keyboard nudges it
  await track.focus();
  const before = Number(await f.locator("#t").textContent());
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => Number(await f.locator("#t").textContent())).not.toBe(before);
  // grab the part and drag: time moves
  await f.getByRole("button", { name: "ignition" }).click();
  await expect(f.locator("#t")).toHaveText("180");
  const c = (await f.locator("canvas").boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 60, c.y + c.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await f.locator("#t").textContent())).toBeGreaterThan(250);
});

test("Scrubber labels for moments close together don't overlap", async ({ page, request }) => {
  const app = `import { Scrubber, useClock } from "aurora/kit";
export default function App() {
  const clock = useClock({ period: 800, playing: false });
  return <div style={{ padding: 24 }}><Scrubber clock={clock} marks={[{ at: 0, label: "Atria squeeze" }, { at: 290, label: "Valves shut" }, { at: 320, label: "Outlets open" }, { at: 345, label: "Ejection" }, { at: 600, label: "Outlets shut" }]} /><p id="after">after</p></div>;
}`;
  await page.setViewportSize({ width: 1000, height: 800 });
  await show(page, request, "kit14", [{ id: "d", c: design(app, { height: 300 }) }]);
  const f = frame(page);
  const labels = f.locator("[data-kit-scrubber] button");
  await expect(labels).toHaveCount(5);
  await page.waitForTimeout(300);
  const boxes = await labels.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const overlap = a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
    expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
  }
  // and nothing below the scrubber is covered
  const after = (await f.locator("#after").boundingBox())!;
  for (const b of boxes) expect(b.b).toBeLessThanOrEqual(after.y + 1);
});

test("a design warning when panel text sits over the 3D model, and none when it is clear", async ({ page, request }) => {
  const app = (camera: string) => `import { Stage, Scene, Metal, Panel } from "aurora/kit";
export default function App() {
  return (
    <Stage scene={<Scene camera={${camera}} autoRotate={false}><mesh><boxGeometry args={[2, 2, 2]} /><Metal /></mesh></Scene>}>
      <Panel at="top-left"><p id="txt" style={{ width: 300 }}>A paragraph of readout text that would be hard to read on top of the model itself, and it wraps.</p></Panel>
    </Stage>
  );
}`;
  await page.setViewportSize({ width: 1280, height: 800 });
  const view = (id: string, camera: string) => ({ v: 2, id, title: "Over", sections: [{ id: "s", layout: "grid", items: [{ id: "d", c: { type: "design", framework: "react", display: "page", files: { "App.tsx": app(camera) } } }] }] });
  const warns = async (id: string) => (await status(request, id)).problems.filter((p: { message: string }) => p.message.includes("over the 3D model"));
  // close camera: the model fills the frame, the panel's text sits on it
  await page.goto("/#kit15");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: view("kit15", "[0, 0, 2.6]") } })).status()).toBe(200);
  await expect(frame(page).locator("#txt")).toBeVisible();
  await expect.poll(async () => (await warns("kit15")).length, { timeout: 15000 }).toBe(1);
  // far camera, model offset to the right: the text is clear
  expect((await request.post("/api/views", { data: { view: view("kit16", "[-3, 0, 14]") } })).status()).toBe(200);
  await page.goto("/#kit16");
  await expect(frame(page).locator("#txt")).toBeVisible();
  await expect.poll(async () => (await status(request, "kit16")).unverified, { timeout: 15000 }).toEqual([]);
  expect(await warns("kit16")).toEqual([]);
});
