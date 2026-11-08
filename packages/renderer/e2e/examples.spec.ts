import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// The skill's reference stories draw on a real screen with no problems at all: they are what models copy.

for (const dir of ["data-story", "cinematic", "blueprint"]) {
  test(`the ${dir} example draws with no errors and no warnings`, async ({ page, request }) => {
    test.setTimeout(60_000);
    const view = JSON.parse(readFileSync(new URL(`../../server/src/skill/examples/${dir}/view.json`, import.meta.url), "utf8"));
    view.id = `ex_${dir.replace("-", "_")}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/#${view.id}`);
    await expect(page.locator(".conn.up")).toBeVisible();
    const r = await request.post("/api/views", { data: { view } });
    expect(r.status(), await r.text()).toBe(200);
    // scroll through it, so every item draws and every design runs its checks
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 700) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(150); }
    // (tests never fetch fonts, so a Google family shows as a stand-in with a warning: that one is expected here)
    const real = async () => ((await (await request.get(`/api/views/${view.id}/status`)).json()).problems as { message: string }[]).filter((p) => !/fetching fonts is turned off/.test(p.message));
    await expect.poll(real, { timeout: 20_000 }).toEqual([]);
  });
}
