import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// look: pictures of a view from a headless browser on the server, for the model to judge its work by eye.

const view = {
  v: 2, id: "lk1", title: "Two pumps", summary: "One heart, two loops.", palette: { page: "#0b1d3a" },
  sections: [
    { id: "st", title: "The beat", layout: "story", items: [
      { id: "vis", c: { type: "design", framework: "react", files: { "App.tsx": "export default () => <div id='v' className='bg-page text-ink p-10 text-4xl'>pinned</div>;" } } },
      { id: "s1", c: { type: "text", md: "**Fill.** Blood flows in." }, story: { state: { phase: 0 } } },
      { id: "s2", c: { type: "text", md: "**Squeeze.** The walls contract." }, story: { state: { phase: 1 } } },
    ] },
    { id: "end", title: "Why it matters", layout: "grid", items: [{ id: "t", c: { type: "text", md: "It never stops." } }] },
  ],
};

test("look takes desktop and phone pictures, one per story step, without counting as a screen or changing problems", async ({ page, request }) => {
  test.setTimeout(60_000);
  await page.goto("/#lk1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  await expect(page.frameLocator('[data-item="vis"] iframe').locator("#v")).toBeVisible();
  const before = (await (await request.get("/api/views/lk1/status")).json()).problems;
  const screens = async () => (await (await request.get("/api/health")).json()).screens;
  expect(await screens()).toBe(1);

  const looking = request.post("/api/views/lk1/look", { data: { sizes: ["desktop", "phone"] }, timeout: 45_000 });
  const seen: number[] = [];
  const watch = (async () => { for (let i = 0; i < 20; i++) { seen.push(await screens()); await new Promise((r) => setTimeout(r, 150)); } })();
  const r = await looking;
  await watch;
  expect(r.status(), await r.text()).toBe(200);
  const out = await r.json() as { version: number; shots: { size: string; file: string; caption: string }[] };
  // the capture page is never the person's screen
  expect(new Set(seen)).toEqual(new Set([1]));
  const desktop = out.shots.filter((s) => s.size === "desktop"), phone = out.shots.filter((s) => s.size === "phone");
  expect(desktop.length).toBeGreaterThanOrEqual(3);
  expect(phone.length).toBeGreaterThanOrEqual(1);
  expect(desktop[0].caption).toMatch(/^desktop 1440×900, 0–/);
  expect(desktop.some((s) => /story step s1 in view/.test(s.caption))).toBe(true);
  expect(desktop.some((s) => /story step s2 in view/.test(s.caption))).toBe(true);
  for (const s of out.shots) {
    expect(existsSync(s.file)).toBe(true);
    expect([...readFileSync(s.file).subarray(0, 2)]).toEqual([0xff, 0xd8]); // JPEG
  }
  expect((await (await request.get("/api/views/lk1/status")).json()).problems).toEqual(before);
});

test("look at a view that doesn't exist is a 404, and a section that doesn't exist gives no pictures", async ({ request }) => {
  expect((await request.post("/api/views/nope_look/look", { data: {} })).status()).toBe(404);
  const r = await request.post("/api/views/lk1/look", { data: { section: "missing" } });
  expect(r.status()).toBe(200);
  expect((await r.json()).shots).toEqual([]);
});
