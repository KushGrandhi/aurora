import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sales = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures/sales.csv");
const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();
const frame = (page: Page, item = "d") => page.frameLocator(`[data-item="${item}"] iframe`);

async function show(page: Page, request: APIRequestContext, id: string, c: Record<string, unknown>, extra: Record<string, unknown> = {}, siblings: unknown[] = []) {
  await page.goto(`/#${id}`);
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view: { v: 2, id, title: "Design", ...extra, sections: [{ id: "s", layout: "grid", items: [{ id: "d", span: 12, c }, ...siblings] }] } } });
  expect(r.status(), await r.text()).toBe(200);
}

const react = (files: Record<string, string>, more: Record<string, unknown> = {}) => ({ type: "design", framework: "react", files, ...more });

test("react design renders with tailwind, motion and lucide", async ({ page, request }) => {
  await show(page, request, "ds1", react({
    "App.tsx": "import Hero from './Hero';\nimport { useState } from 'react';\nexport default function App() { const [n, setN] = useState(0); return <main className='p-8'><Hero /><button id='inc' onClick={() => setN(n + 1)}>count {n}</button></main>; }",
    "Hero.tsx": "import { motion } from 'motion/react';\nimport { Sparkles } from 'lucide-react';\nexport default function Hero() { return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className='bg-indigo-600 text-white p-6 rounded-xl'><Sparkles /> <h1>Hello canvas</h1></motion.div>; }",
  }));
  const f = frame(page);
  await expect(f.locator("h1")).toHaveText("Hello canvas");
  await expect(f.locator("svg.lucide")).toHaveCount(1);
  await expect.poll(() => f.locator(".bg-indigo-600").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await f.locator("#inc").click();
  await expect(f.locator("#inc")).toHaveText("count 1");
  await expect.poll(async () => (await status(request, "ds1")).unverified).toEqual([]);
  expect((await status(request, "ds1")).problems).toEqual([]);
});

test("html custom renders", async ({ page, request }) => {
  await show(page, request, "ds2", { type: "custom", html: "<h2 class='text-2xl font-bold'>Plain HTML</h2><script>document.querySelector('h2').dataset.ran = 'yes'</script>" });
  await expect(frame(page).locator("h2")).toHaveAttribute("data-ran", "yes");
  await expect.poll(async () => (await status(request, "ds2")).unverified).toEqual([]);
  expect((await status(request, "ds2")).problems).toEqual([]);
});

test("three and d3 load offline", async ({ page, request }) => {
  await page.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  await show(page, request, "ds3", react({
    "App.tsx": "import { useEffect, useRef } from 'react';\nimport * as THREE from 'three';\nimport * as d3 from 'd3';\nexport default function App() {\n  const box = useRef<HTMLDivElement>(null);\n  useEffect(() => {\n    const r = new THREE.WebGLRenderer({ antialias: true }); r.setSize(200, 120); box.current!.appendChild(r.domElement);\n    const scene = new THREE.Scene(); const cam = new THREE.PerspectiveCamera(50, 200 / 120, 0.1, 10); cam.position.z = 3;\n    scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial())); r.render(scene, cam);\n    d3.select(box.current).append('svg').attr('id', 'chart').append('circle').attr('r', 10);\n  }, []);\n  return <div ref={box} />;\n}",
  }));
  await expect(frame(page).locator("canvas")).toHaveCount(1);
  await expect(frame(page).locator("svg#chart circle")).toHaveCount(1);
  await expect.poll(async () => (await status(request, "ds3")).problems).toEqual([]);
});

test("runtime error becomes a problem", async ({ page, request }) => {
  await show(page, request, "ds4", react({ "App.tsx": "export default () => <button id='b' onClick={() => { throw new Error('boom'); }}>go</button>;" }));
  await frame(page).locator("#b").click();
  await expect.poll(async () => JSON.stringify((await status(request, "ds4")).problems)).toContain("render failed: design: boom");
  await expect(frame(page).locator("#b")).toBeVisible();
  await expect(page.locator('[data-item="d"] .design-error')).toContainText("boom");
});

test("compile error becomes a problem with file and line", async ({ page, request }) => {
  await show(page, request, "ds4b", react({ "App.tsx": "export default function App() {\n  return <div>;\n}" }));
  await expect.poll(async () => JSON.stringify((await status(request, "ds4b")).problems)).toMatch(/render failed: design: App\.tsx:\d+:\d+/);
});

test("network is blocked and reported", async ({ page, request }) => {
  await show(page, request, "ds5", react({ "App.tsx": "import { useEffect } from 'react';\nexport default function App() { useEffect(() => { fetch('https://example.com/data.json').catch(() => {}); }, []); return <h1>Still here</h1>; }" }));
  await expect(frame(page).locator("h1")).toHaveText("Still here");
  await expect.poll(async () => JSON.stringify((await status(request, "ds5")).problems)).toContain("blocked network request to https://example.com");
});

test("the frame cannot touch the screen", async ({ page, request }) => {
  await show(page, request, "ds6", react({ "App.tsx": [
    "import { useEffect } from 'react';",
    "export default function App() {",
    "  useEffect(() => {",
    "    let top = 'blocked', doc = 'blocked';",
    "    try { (window.top as Window).location.href = 'about:blank'; top = 'navigated'; } catch {}",
    "    try { doc = String(!!(window.parent as Window).document.title); } catch {}",
    "    localStorage.setItem('k', 'v');",
    "    (window as any).genui.send('probe', { top, doc, storage: localStorage.getItem('k') });",
    "  }, []);",
    "  return <h1>probe</h1>;",
    "}",
  ].join("\n") }));
  await expect(frame(page).locator("h1")).toHaveText("probe");
  await expect.poll(async () => (await (await request.get("/api/views/ds6/events")).json()).events.length).toBe(1);
  const [ev] = (await (await request.get("/api/views/ds6/events")).json()).events;
  expect(ev.payload.doc).toBe("blocked");
  expect(ev.payload.storage).toBe("v");
  expect(page.url()).toContain("#ds6");
  await expect(page.locator("h1").first()).toHaveText("Design");
});

test("send reaches the caller", async ({ page, request }) => {
  await show(page, request, "ds7", react({ "App.tsx": "export default () => <button id='b' onClick={() => (window as any).genui.send('chose', { plan: 'pro' })}>Pro</button>;" }));
  const poll = request.get("/api/views/ds7/events?after=0&wait=5000");
  await frame(page).locator("#b").click();
  const { events } = await (await poll).json();
  expect(events).toMatchObject([{ itemId: "d", name: "chose", payload: { plan: "pro" } }]);
});

test("send is rate-limited", async ({ page, request }) => {
  await show(page, request, "ds8", react({ "App.tsx": "export default () => <button id='b' onClick={() => { for (let i = 0; i < 1000; i++) (window as any).genui.send('spam', i); }}>spam</button>;" }));
  await frame(page).locator("#b").click();
  await page.waitForTimeout(800);
  const n = (await (await request.get("/api/views/ds8/events")).json()).events.length;
  expect(n).toBeGreaterThan(0);
  expect(n).toBeLessThanOrEqual(20);
});

test("stuck design reports a problem", async ({ page, request }) => {
  test.setTimeout(30_000);
  await show(page, request, "ds9", react({ "App.tsx": "await new Promise(() => {});\nexport default () => <h1>never</h1>;" }), {}, [{ id: "t", span: 12, c: { type: "text", md: "sibling" } }]);
  await expect(page.locator('[data-item="t"]')).toContainText("sibling");
  await expect.poll(async () => JSON.stringify((await status(request, "ds9")).problems), { timeout: 15_000 }).toContain("did not finish loading");
});

test("data and theme reach the page live", async ({ page, request }) => {
  await show(page, request, "ds10", react({ "App.tsx": "import { useEffect, useState } from 'react';\nexport default function App() { const g = (window as any).genui; const [rows, setRows] = useState(g.data.q); useEffect(() => g.onData((d: any) => setRows(d.q)), []); return <h1 id='n'>{rows[0].n}</h1>; }" }, { data: ["q"] }), {
    datasets: { data: sales },
    params: { region: { type: "select", label: "Region", options: ["East", "West"] } },
    queries: { q: { sql: "SELECT count(*) AS n FROM data WHERE ($region IS NULL OR region = $region)" } },
  });
  const f = frame(page);
  await expect(f.locator("#n")).toHaveText("240");
  await f.locator("body").evaluate(() => { (window as unknown as { tag: string }).tag = "same"; });
  await page.locator(".filterbar select").selectOption("East");
  await expect(f.locator("#n")).toHaveText("48");
  expect(await f.locator("body").evaluate(() => (window as unknown as { tag?: string }).tag)).toBe("same");
  await page.locator(".theme-toggle").click();
  await expect(f.locator("html")).toHaveClass(/dark/);
});

test("editFile patch updates the page", async ({ page, request }) => {
  await show(page, request, "ds11", react({ "App.tsx": "export default () => <h1 className='text-3xl'>First title</h1>;" }));
  await expect(frame(page).locator("h1")).toHaveText("First title");
  const r = await request.post("/api/views/ds11/patch", { data: { ops: [{ op: "editFile", id: "d", path: "App.tsx", edits: [{ find: "First title", replace: "Second title" }] }] } });
  expect(r.status()).toBe(200);
  await expect(frame(page).locator("h1")).toHaveText("Second title");
});

test("viewport switcher narrows the frame", async ({ page, request }) => {
  await show(page, request, "ds12", react({ "App.tsx": "export default () => <h1>responsive</h1>;" }));
  await page.locator('[data-item="d"] button[data-viewport="phone"]').click();
  await expect.poll(async () => Math.round((await page.locator('[data-item="d"] iframe').boundingBox())!.width)).toBe(390);
});
