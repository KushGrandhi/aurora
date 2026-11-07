import { expect, test } from "@playwright/test";
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { FONTS_DIR } from "../playwright.config.ts";

// A view names Google Fonts families; the screen and its designs use them, loaded only from aurora.

test.beforeAll(() => {
  // Pretend Fraunces was fetched once before: a cached family (its file is a bundled face; the name is what counts).
  rmSync(FONTS_DIR, { recursive: true, force: true });
  const files = path.join(import.meta.dirname, "../dist/lib/fonts/files");
  const one = readdirSync(files).find((f) => f.startsWith("hanken-grotesk") && f.includes("latin-wght"))!;
  mkdirSync(path.join(FONTS_DIR, "fraunces"), { recursive: true });
  cpSync(path.join(files, one), path.join(FONTS_DIR, "fraunces", "0.woff2"));
  writeFileSync(path.join(FONTS_DIR, "fraunces", "font.css"), "@font-face { font-family: 'Fraunces'; font-weight: 100 900; src: url(../g/fraunces/0.woff2) format('woff2'); }");
});

const view = (id: string, fonts: Record<string, string>) => ({
  v: 2, id, title: "Night shift", summary: "Most deliveries land after dark.", fonts,
  sections: [{ id: "s", title: "After dark", layout: "grid", items: [
    { id: "t", span: 6, c: { type: "text", md: "Plain prose." } },
    { id: "cd", span: 6, c: { type: "code", lang: "ts", code: "const late = true;" } },
    { id: "ds", span: 12, c: { type: "design", framework: "react", files: { "App.tsx": "export default () => <div><h2 id='h' className='font-display text-4xl'>Headline</h2><p id='b'>Body</p></div>;" } } },
  ] }],
});

test("a view's fonts reach the headline, prose, code and designs, and nothing is fetched from outside", async ({ page, request }) => {
  const outside: string[] = [];
  await page.route((u) => !["localhost", "127.0.0.1"].includes(u.hostname), (r) => { outside.push(r.request().url()); return r.abort(); });
  await page.goto("/#fo1");
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view: view("fo1", { display: "Fraunces", body: "Newsreader", mono: "JetBrains Mono" }) } });
  expect(r.status(), await r.text()).toBe(200);
  await expect(page.locator(".section-title")).toBeVisible();
  const family = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await family(".section-title")).toMatch(/^"?Fraunces/);
  expect(await family('[data-item="t"]')).toMatch(/^"?Newsreader/);
  expect(await family('[data-item="cd"] pre')).toMatch(/^"?JetBrains Mono/);
  await expect.poll(() => page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("32px Fraunces") && document.fonts.check("16px Newsreader"); })).toBe(true);
  const f = page.frameLocator('[data-item="ds"] iframe');
  await expect(f.locator("#h")).toBeVisible();
  expect(await f.locator("#h").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Fraunces/);
  expect(await f.locator("#b").evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/^"?Newsreader/);
  await expect.poll(() => f.locator("#h").evaluate(async () => { await document.fonts.ready; return document.fonts.check("32px Fraunces"); })).toBe(true);
  expect(outside).toEqual([]);
  // JetBrains Mono is not cached and fetching is off: a warning says so (mono falls back to the system monospace)
  const problems = (await (await request.get("/api/views/fo1/status")).json()).problems as { message: string }[];
  expect(problems.map((p) => p.message)).toContainEqual(expect.stringMatching(/JetBrains Mono.*fetching fonts is turned off/));
});

test("a misspelt family gets suggestions; an uncached one is shown with a stand-in under its own name", async ({ page, request }) => {
  await page.goto("/#fo2");
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view: view("fo2", { display: "Playfair Display", body: "Frances" }) } });
  expect(r.status()).toBe(200);
  const problems = ((await r.json()).problems as { message: string }[]).map((p) => p.message);
  expect(problems).toContainEqual(expect.stringMatching(/"Frances" is not a Google Fonts family; did you mean "Fraunces"/));
  expect(problems).toContainEqual(expect.stringMatching(/"Playfair Display" is shown as Newsreader/));
  await expect(page.locator(".section-title")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("32px 'Playfair Display'"); })).toBe(true);
});
