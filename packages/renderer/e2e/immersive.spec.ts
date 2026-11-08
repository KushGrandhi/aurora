import { expect, test, type Page } from "@playwright/test";

// Immersive views: one designed page. Full-screen opening, sections on their own grounds, full-screen moments,
// reels that slide sideways, and stories whose visual sits behind the steps.

// rgb(…) or color(srgb r g b / a), as computed styles give them
const rgb = (s: string) => { const n = (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); return s.startsWith("color(") ? n.map((v) => v * 255) : n; };
const lum = ([r, g, b]: number[]) => [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const text = (id: string, md: string) => ({ id, c: { type: "text", md } });

const view = (id: string) => ({
  v: 2, id, title: "The night shift", summary: "Most deliveries now land after dark.", immersive: true,
  datasets: { d: { inline: [{ hour: "18", n: 10 }, { hour: "22", n: 30 }, { hour: "02", n: 25 }] } },
  queries: { q: { sql: "SELECT hour, n FROM d" } },
  sections: [
    { id: "big", layout: "grid", height: "screen", items: [text("t1", "# 65%\nof parcels arrive after 6 pm.")] },
    { id: "dark", title: "After dark", layout: "grid", background: "ink", items: [text("t2", "The city keeps moving."), { id: "ch", c: { type: "chart", query: "q", vegaLite: { mark: "bar", encoding: { x: { field: "hour", type: "nominal" }, y: { field: "n", type: "quantitative" } } } } }] },
    { id: "reel", title: "Three shifts", layout: "reel", items: [text("p1", "## Evening\nThe first wave."), text("p2", "## Night\nThe peak."), text("p3", "## Dawn\nThe last drops.")] },
    { id: "end", title: "What changes", layout: "grid", background: "surface", items: [text("t3", "Plan for the night.")] },
  ],
});

async function open(page: Page, request: import("@playwright/test").APIRequestContext, id: string, w = 1280, h = 800) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`/#${id}`);
  await expect(page.locator(".conn")).toHaveCount(1);
  const r = await request.post("/api/views", { data: { view: view(id) } });
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator('[data-item="ch"] svg').first()).toBeVisible();
}

test("an immersive view opens on a full screen, tucks its controls away and has no bands", async ({ page, request }) => {
  await open(page, request, "im1");
  await expect(page.locator(".app")).toHaveClass(/\bimmersive\b/);
  expect((await page.locator(".view-head.opening").boundingBox())!.height).toBeGreaterThanOrEqual(800 - 1);
  expect(Number(await page.locator(".topbar").evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
  await expect(page.locator(".section.band")).toHaveCount(0);
  // a full-screen moment
  expect((await page.locator('[data-section="big"]').boundingBox())!.height).toBeGreaterThanOrEqual(800 - 1);
  for (const [w, h] of [[390, 800], [1000, 600], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `${w}`).toBeLessThanOrEqual(w);
  }
});

test("a section on the ink ground repaints edge to edge, and its text and chart follow it", async ({ page, request }) => {
  await open(page, request, "im2");
  const sec = page.locator('[data-section="dark"]');
  await sec.scrollIntoViewIfNeeded();
  const bg = await sec.evaluate((el) => getComputedStyle(el).backgroundColor);
  const page_bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(ratio(bg, page_bg)).toBeGreaterThan(5); // ink on a light page
  expect(ratio(await page.locator('[data-item="t2"]').evaluate((el) => getComputedStyle(el).color), bg)).toBeGreaterThanOrEqual(4.5);
  const axis = await page.locator('[data-item="ch"] .role-axis-label text').first().evaluate((el) => getComputedStyle(el).fill);
  expect(ratio(axis, bg)).toBeGreaterThanOrEqual(3.5);
  // edge to edge: the ground is spread past the page column to the window's edges (and clipped top and bottom)
  const paint = await sec.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, clip: getComputedStyle(el).clipPath }));
  expect(paint.shadow).toContain(bg);
  expect(paint.clip).toContain("inset");
  const bad = await request.post("/api/views", { data: { view: { ...view("im2b"), sections: [{ id: "s", layout: "grid", background: "red", items: [] }] } } });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).toMatch(/page.*surface.*ink.*accent/);
});

test("a reel pins and slides its panels sideways as the reader scrolls down", async ({ page, request }) => {
  await open(page, request, "im3");
  const reel = page.locator('[data-section="reel"] .reel');
  const top = await reel.evaluate((el) => el.getBoundingClientRect().top + scrollY);
  const span = await reel.evaluate((el) => el.getBoundingClientRect().height - innerHeight);
  for (const k of [0, 1, 2]) {
    await page.evaluate((y) => scrollTo(0, y), top + (k * span) / 2);
    await expect.poll(async () => Math.abs((await page.locator(`[data-item="p${k + 1}"]`).boundingBox())!.x)).toBeLessThan(3);
  }
});

test("with reduced motion a reel stacks; on a phone it is a row to swipe", async ({ browser, request }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto("/#im4");
  await expect(page.locator(".conn")).toHaveCount(1);
  expect((await request.post("/api/views", { data: { view: view("im4") } })).status()).toBe(200);
  await expect(page.locator('[data-item="p3"]')).toBeAttached();
  const ys = await Promise.all(["p1", "p2", "p3"].map(async (id) => (await page.locator(`[data-item="${id}"]`).boundingBox())!.y));
  expect(ys[0]).toBeLessThan(ys[1]);
  expect(ys[1]).toBeLessThan(ys[2]);
  await ctx.close();
  const phone = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await phone.goto("/#im4");
  await expect(phone.locator('[data-item="p3"]')).toBeAttached();
  expect(await phone.locator('[data-section="reel"] .reel-track').evaluate((el) => el.scrollWidth > el.clientWidth + 2)).toBe(true);
  expect(await phone.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await phone.close();
});

test("look takes one picture per reel panel", async ({ request }) => {
  test.setTimeout(60_000);
  expect((await request.post("/api/views", { data: { view: view("im5") } })).status()).toBe(200);
  const r = await request.post("/api/views/im5/look", { data: { section: "reel", maxShots: 6 }, timeout: 45_000 });
  expect(r.status(), await r.text()).toBe(200);
  const captions = ((await r.json()).shots as { caption: string }[]).map((s) => s.caption);
  for (const k of [1, 2, 3]) expect(captions.some((c) => c.includes(`panel ${k} of 3`)), captions.join("\n")).toBe(true);
});

test("behind a story's steps, the visual's own controls stay clickable", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#im6");
  await expect(page.locator(".conn")).toHaveCount(1);
  const app = "import { Stage, Scene, Panel } from 'aurora/kit';\nexport default () => <Stage scene={<Scene><mesh><boxGeometry /><meshStandardMaterial /></mesh></Scene>}><Panel at='bottom' glass><button id='go'>Play</button></Panel></Stage>;";
  const v = { v: 2, id: "im6", title: "Behind", sections: [{ id: "st", layout: "story", items: [
    { id: "vis", c: { type: "design", framework: "react", files: { "App.tsx": app } } },
    text("s1", "**One.** A short step."), text("s2", "**Two.** Another short step."),
  ] }] };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="vis"] iframe');
  await expect(f.locator("#go")).toBeVisible();
  await page.locator('[data-item="s1"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  // the button starts past the step column, and nothing of the screen's sits on top of it
  const frame = (await page.locator('[data-item="vis"] iframe').boundingBox())!;
  const btn = (await f.locator("#go").boundingBox())!;
  const card = (await page.locator('[data-item="s1"] > *').first().boundingBox())!;
  expect(btn.x).toBeGreaterThan(card.x + card.width - 1);
  const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.tagName, [btn.x + btn.width / 2, btn.y + btn.height / 2]);
  expect(hit).toBe("IFRAME");
  expect(frame.width).toBeGreaterThanOrEqual(1280 - 2);
  // the step card reads clearly on its scrim
  const cardBg = await page.locator('[data-item="s1"] > *').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(ratio(await page.locator('[data-item="s1"]').evaluate((el) => getComputedStyle(el).color), cardBg)).toBeGreaterThanOrEqual(4.5);
});
