import { expect, test, type Page } from "@playwright/test";

// Scroll as a continuous value: a story's pinned design hears where the reader is between steps, every frame.

const probe = "import { useEffect, useState } from 'react';\nexport default () => { const [s, setS] = useState('none'); useEffect(() => window.aurora.onScroll((v) => setS(`${v.position.toFixed(3)}|${v.index}|${v.count}|${v.progress.toFixed(3)}|${v.reduced}`)), []); return <div id='sc' className='p-8 text-2xl'>{s}</div>; };";
const step = (id: string, n: number) => ({ id, c: { type: "text", md: `**Step ${n}.** ${"Words about this moment. ".repeat(6)}` }, story: { state: { n } } });
const view = (id: string) => ({
  v: 2, id, title: "Scrubbing", summary: "Scroll moves the scene.",
  sections: [
    { id: "intro", title: "Before", layout: "grid", items: [{ id: "t0", c: { type: "text", md: "Some text before the story. ".repeat(20) } }] },
    { id: "st", title: "The story", layout: "story", items: [{ id: "vis", c: { type: "design", framework: "react", files: { "App.tsx": probe } } }, step("s0", 0), step("s1", 1), step("s2", 2)] },
    { id: "after", title: "After", layout: "grid", items: [{ id: "t9", c: { type: "text", md: "Some text after. ".repeat(40) } }] },
  ],
});
const read = async (page: Page) => (await page.frameLocator('[data-item="vis"] iframe').locator("#sc").textContent())!.split("|");
const centre = (page: Page, id: string) => page.locator(`[data-item="${id}"]`).evaluate((el) => el.scrollIntoView({ block: "center" }));

test("a story's design hears a continuous position: whole numbers on a step, fractions between, and the active step agrees", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#sc1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: view("sc1") } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="vis"] iframe').locator("#sc")).toBeVisible();
  for (const [id, k] of [["s1", 1], ["s2", 2], ["s0", 0]] as const) {
    await centre(page, id);
    await expect.poll(async () => Math.abs(Number((await read(page))[0]) - k)).toBeLessThan(0.02);
    expect((await read(page))[1]).toBe(String(k));
    expect((await read(page))[2]).toBe("3");
    await expect(page.locator(`[data-item="${id}"]`)).toHaveClass(/\bactive\b/);
  }
  // halfway between step 1 and step 2: a fraction
  const mid = await page.evaluate(() => {
    const c = (id: string) => { const r = document.querySelector(`[data-item="${id}"]`)!.getBoundingClientRect(); return r.top + r.height / 2 + scrollY; };
    return (c("s1") + c("s2")) / 2 - innerHeight / 2;
  });
  await page.evaluate((y) => scrollTo(0, y), mid);
  await expect.poll(async () => Math.abs(Number((await read(page))[0]) - 1.5)).toBeLessThan(0.05);
  // scrolling a little moves it a little: continuous, not stepped
  const before = Number((await read(page))[0]);
  await page.mouse.wheel(0, 40);
  await expect.poll(async () => Number((await read(page))[0])).toBeGreaterThan(before + 0.01);
  expect(Number((await read(page))[0])).toBeLessThan(before + 0.5);
});

test("with reduced motion the value snaps to steps", async ({ browser, request }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/#sc2");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: view("sc2") } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="vis"] iframe').locator("#sc")).toBeVisible();
  await centre(page, "s1");
  await page.mouse.wheel(0, 120);
  await expect.poll(async () => (await read(page))[4]).toBe("true");
  const pos = Number((await read(page))[0]);
  expect(pos).toBe(Math.round(pos));
  expect(Number((await read(page))[3]) * 4 % 1).toBe(0);
  await ctx.close();
});

test("a design outside a story gets its journey through the window, starting at 0 on load", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#sc3");
  await expect(page.locator(".conn.up")).toBeVisible();
  const v = { v: 2, id: "sc3", title: "Grid", sections: [
    { id: "a", layout: "grid", items: [{ id: "vis", c: { type: "design", framework: "react", height: 400, files: { "App.tsx": probe } } }] },
    { id: "b", layout: "grid", items: [{ id: "t", c: { type: "text", md: "Filler. ".repeat(400) } }] },
  ] };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="vis"] iframe');
  await expect(f.locator("#sc")).toBeVisible();
  await expect.poll(async () => (await read(page))[3]).toBe("0.000");
  await page.mouse.wheel(0, 300);
  await expect.poll(async () => Number((await read(page))[3])).toBeGreaterThan(0.05);
});

test("the kit reads it in an animation loop: useScroll, span and useScrollStep", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#sc4");
  await expect(page.locator(".conn.up")).toBeVisible();
  const app = "import { useEffect, useRef } from 'react';\nimport { useScroll, useScrollStep, span } from 'aurora/kit';\nexport default () => { const s = useScroll(); const step = useScrollStep(); const el = useRef(null); useEffect(() => { let r = 0; const loop = () => { if (el.current) el.current.textContent = span(s.position, 1, 2).toFixed(2); r = requestAnimationFrame(loop); }; loop(); return () => cancelAnimationFrame(r); }, []); return <div><div id='t' ref={el} /><div id='step'>{step}</div></div>; };";
  const v = view("sc4");
  v.sections[1].items[0] = { id: "vis", c: { type: "design", framework: "react", files: { "App.tsx": app } } };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="vis"] iframe');
  await expect(f.locator("#t")).toBeVisible();
  await centre(page, "s1");
  await expect(f.locator("#t")).toHaveText("0.00");
  await expect(f.locator("#step")).toHaveText("1");
  await centre(page, "s2");
  await expect(f.locator("#t")).toHaveText("1.00");
  await expect(f.locator("#step")).toHaveText("2");
});
