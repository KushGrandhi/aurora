import { expect, test, type Page } from "@playwright/test";

// A view that sets its own page sets the whole stage: the document, the chrome, charts, diagrams, code and designs
// all draw from it, its mode follows the page whatever the person chose, and text stays legible.

const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const lum = ([r, g, b]: number[]) => [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a: string, b: string) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const view = (id: string, page: string) => ({
  v: 2, id, title: "The night shift", summary: "Most deliveries now land after dark.",
  palette: { page, accent: "#f4b942" },
  datasets: { d: { inline: [{ hour: "18", n: 10 }, { hour: "22", n: 30 }, { hour: "02", n: 25 }] } },
  queries: { q: { sql: "SELECT hour, n FROM d" }, total: { sql: "SELECT sum(n) AS n FROM d" } },
  sections: [{ id: "s", title: "After dark", layout: "grid", items: [
    { id: "k", span: 4, c: { type: "kpi", query: "total", field: "n", label: "Deliveries" } },
    { id: "ch", span: 8, c: { type: "chart", query: "q", vegaLite: { mark: "bar", encoding: { x: { field: "hour", type: "nominal" }, y: { field: "n", type: "quantitative" } } } } },
    { id: "dg", span: 6, c: { type: "diagram", source: "flowchart LR\n  A[Depot] --> B[Door]" } },
    { id: "cd", span: 6, c: { type: "code", lang: "ts", code: "const late = true;" } },
    { id: "ds", span: 12, c: { type: "design", framework: "react", files: { "App.tsx": "export default () => <p id='p' className='bg-page text-ink-2'>night</p>;" } } },
  ] }],
});

async function open(page: Page, request: import("@playwright/test").APIRequestContext, id: string, pageColour: string) {
  await page.goto(`/#${id}`);
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view: view(id, pageColour) } });
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator('[data-item="ch"] svg').first()).toBeVisible();
}

for (const [id, pageColour, mode] of [["stg1", "#0b1d3a", "dark"], ["stg2", "#f4efe6", "light"]] as const) {
  test(`a ${mode} stage (${pageColour}) reaches everything and stays legible`, async ({ page, request }) => {
    // the person prefers the other theme; the view's stage wins
    await page.addInitScript((m) => localStorage.setItem("aurora-theme", m), mode === "dark" ? "light" : "dark");
    await open(page, request, id, pageColour);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(mode);
    const body = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(rgb(body)).toEqual(rgb(`rgb(${[1, 3, 5].map((i) => parseInt(pageColour.slice(i, i + 2), 16)).join(",")})`));
    await expect(page.locator(".theme-toggle")).toBeDisabled();

    const color = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).color);
    expect(ratio(await color(".summary"), body)).toBeGreaterThanOrEqual(6);
    expect(ratio(await color('[data-item="k"] .label'), body)).toBeGreaterThanOrEqual(4.5);
    // chart axis labels are drawn from the stage, not the house theme
    const axis = await page.locator('[data-item="ch"] .role-axis-label text').first().evaluate((el) => getComputedStyle(el).fill);
    expect(ratio(axis, body)).toBeGreaterThanOrEqual(3.5);
    // Mermaid nodes sit on the stage's raised colour, code on its surface
    await expect(page.locator('[data-item="dg"] svg').first()).toBeVisible();
    const node = await page.locator('[data-item="dg"] .node rect, [data-item="dg"] .node path').first().evaluate((el) => getComputedStyle(el).fill);
    expect(ratio(node, body)).toBeLessThan(1.6);
    await expect(page.locator('[data-item="cd"] .shiki')).toBeVisible();
    const code = await page.locator('[data-item="cd"] .shiki').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(ratio(code, body)).toBeLessThan(1.3);
    // the design sandbox has the same stage and mode
    const f = page.frameLocator('[data-item="ds"] iframe');
    await expect(f.locator("#p")).toBeVisible();
    const inside = await f.locator("#p").evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, fg: getComputedStyle(el).color, dark: document.documentElement.classList.contains("dark") }));
    expect(rgb(inside.bg)).toEqual(rgb(body));
    expect(ratio(inside.fg, inside.bg)).toBeGreaterThanOrEqual(6);
    expect(inside.dark).toBe(mode === "dark");
  });
}

test("a page no text can be read on is refused with a way out; a hard-to-see chosen colour is a warning", async ({ request }) => {
  const bad = await request.post("/api/views", { data: { view: view("stg3", "#777777") } });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).toMatch(/darker or lighter/);
  const v = { ...view("stg4", "#0a0a0a"), palette: { page: "#0a0a0a", series: ["#e8590c", "#111111"] } };
  const r = await request.post("/api/views", { data: { view: v } });
  expect(r.status()).toBe(200);
  const problems = (await (await request.get("/api/views/stg4/status")).json()).problems as { message: string }[];
  expect(problems.some((p) => /#111111/.test(p.message))).toBe(true);
});

test("leaving a view with its own stage gives the person's theme back", async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem("aurora-theme", "light"));
  await open(page, request, "stg5", "#0b1d3a");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark");
  const plain = { v: 2, id: "stg6", title: "Plain", sections: [{ id: "s", layout: "grid", items: [{ id: "t", c: { type: "text", md: "hi" } }] }] };
  expect((await request.post("/api/views", { data: { view: plain } })).status()).toBe(200);
  await page.goto("/#stg6");
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
  expect(rgb(await page.evaluate(() => getComputedStyle(document.body).backgroundColor))).toEqual([249, 249, 247]);
});
