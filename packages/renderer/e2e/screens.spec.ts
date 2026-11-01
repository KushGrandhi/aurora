import { expect, test } from "@playwright/test";

test("another screen's render failure doesn't stop this screen drawing the item", async ({ page, request, browser }) => {
  await request.post("/api/views", { data: { view: { v: 2, id: "scr1", title: "Screens", sections: [{ id: "s", layout: "grid", items: [{ id: "c", c: { type: "callout", tone: "note", md: "drawn here" } }] }] } } });
  // A stale screen (older build) reports it can't draw the callout.
  const stale = await browser.newPage();
  await stale.goto("/api/health"); // same origin, but no screen app running
  await stale.evaluate(() => new Promise<void>((resolve) => {
    const ws = new WebSocket(location.origin.replace("http", "ws") + "/ws");
    ws.onopen = () => { ws.send(JSON.stringify({ t: "rendered", viewId: "scr1", version: 1, ok: [], failed: [{ itemId: "c", message: 'no renderer for "callout" on this screen' }] })); setTimeout(resolve, 200); };
  }));
  await stale.close();
  await expect.poll(async () => JSON.stringify((await (await request.get("/api/views/scr1/status")).json()).problems)).toContain("render failed");

  await page.goto("/#scr1");
  await expect(page.locator('[data-item="c"] .callout')).toContainText("drawn here");
  await expect.poll(async () => (await (await request.get("/api/views/scr1/status")).json()).problems).toEqual([]);
});
