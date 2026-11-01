import { expect, test } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "genui-e2e-media-"));
const svg = path.join(dir, "sample.svg");
writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200"><rect width="320" height="200" fill="#2a78d6"/><circle cx="160" cy="100" r="60" fill="#fcfcfb"/></svg>');
const svg2 = path.join(dir, "second.svg");
writeFileSync(svg2, '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#1baf7a"/></svg>');

const status = async (request: import("@playwright/test").APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();

test("authored components render and report", async ({ page, request }) => {
  await page.goto("/#cmp");
  await expect(page.locator(".conn.up")).toBeVisible();
  const res = await request.post("/api/views", { data: { view: { v: 2, id: "cmp", title: "Components", sections: [{ id: "s", layout: "grid", items: [
    { id: "co", span: 6, c: { type: "callout", tone: "warning", title: "Heads up", md: "Tokens expire **hourly**." } },
    { id: "st", span: 6, c: { type: "steps", steps: [{ title: "Install", status: "done" }, { title: "Build", status: "current" }, { title: "Ship" }] } },
    { id: "ca", span: 12, c: { type: "cards", items: [{ title: "Alpha", subtitle: "First", image: svg, tags: ["a"], fields: { owner: "kush" } }, { title: "Beta", tags: ["b"] }] } },
    { id: "tl", span: 12, c: { type: "timeline", events: [{ date: "2026-01-10", title: "Start", group: "A" }, { date: "2026-02-01", end: "2026-03-15", title: "Build", group: "B", detail: "the long part" }, { date: "2026-04-01", title: "Launch", group: "A" }] } },
    { id: "md", span: 12, c: { type: "media", layout: "gallery", items: [{ src: svg, caption: "One" }, { src: svg2, caption: "Two" }] } },
  ] }] } } });
  expect(res.status()).toBe(200);
  for (const id of ["co", "st", "ca", "tl", "md"]) await expect(page.locator(`[data-item="${id}"]`)).toBeVisible();
  await expect(page.locator('[data-item="co"]')).toContainText("Warning");
  await expect(page.locator('[data-item="tl"]')).toContainText("Launch");
  await expect(page.locator('[data-item="ca"] img')).toHaveCount(1);
  await expect.poll(async () => (await status(request, "cmp")).unverified).toEqual([]);
  const s = await status(request, "cmp");
  expect(s.problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);

  await page.waitForTimeout(600);
  await page.screenshot({ path: "test-results/components.png", fullPage: true });
  await page.locator('[data-item="md"] button.thumb').first().click();
  await expect(page.locator(".lightbox")).toBeVisible();
  await expect(page.locator(".lightbox figcaption")).toHaveText("One");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".lightbox figcaption")).toHaveText("Two");
  await page.keyboard.press("Escape");
  await expect(page.locator(".lightbox")).toHaveCount(0);
});

test("missing media is a warning, not a crash", async ({ page, request }) => {
  await page.goto("/#cmp_missing");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id: "cmp_missing", title: "Missing", sections: [{ id: "s", layout: "grid", items: [
    { id: "md", span: 6, c: { type: "media", items: [{ src: path.join(dir, "nope.png"), caption: "Gone" }] } },
    { id: "t", span: 6, c: { type: "text", md: "still here" } },
  ] }] } } });
  await expect(page.locator('[data-item="t"]')).toContainText("still here");
  await expect(page.locator('[data-item="md"]')).toContainText("nope.png");
  await expect.poll(async () => (await status(request, "cmp_missing")).unverified).toEqual([]);
  const s = await status(request, "cmp_missing");
  expect(s.problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
  expect(s.problems.some((p: { severity: string; itemId: string }) => p.severity === "warning" && p.itemId === "md")).toBe(true);
});
