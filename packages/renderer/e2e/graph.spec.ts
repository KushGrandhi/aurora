import { expect, test, type APIRequestContext } from "@playwright/test";

const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();

test("graph of 1000 nodes renders within 5 s and reports ok", async ({ page, request }) => {
  await page.goto("/#gr1");
  await expect(page.locator(".conn.up")).toBeVisible();
  const rows = Array.from({ length: 999 }, (_, i) => ({ source: `n${Math.floor(i / 3)}`, target: `n${i + 1}`, weight: 1 + (i % 4) }));
  const groups = Array.from({ length: 1000 }, (_, i) => ({ id: `n${i}`, label: `Node ${i}`, group: `g${i % 5}` }));
  const t0 = Date.now();
  await request.post("/api/views", { data: { view: { v: 2, id: "gr1", title: "Big graph",
    datasets: { gr_edges: { inline: rows }, gr_nodes: { inline: groups } },
    queries: { e: { sql: "SELECT source, target, weight FROM gr_edges" }, n: { sql: "SELECT id, label, \"group\" FROM gr_nodes" } },
    sections: [{ id: "s", layout: "grid", items: [{ id: "g", span: 12, c: { type: "graph", query: { edges: "e", nodes: "n" } } }] }] } } });
  await expect.poll(async () => (await status(request, "gr1")).unverified, { timeout: 5000 }).toEqual([]);
  expect(Date.now() - t0).toBeLessThan(5000);
  expect((await status(request, "gr1")).problems).toEqual([]);
  await expect(page.locator('[data-item="g"] canvas').first()).toBeVisible();
  await expect(page.locator('[data-item="g"] .legend .chip')).toHaveCount(5);
  await page.screenshot({ path: "test-results/graph.png" });
});

test("update keeps existing positions", async ({ page, request }) => {
  await page.goto("/#gr2");
  await expect(page.locator(".conn.up")).toBeVisible();
  const edges = [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }, { from: "c", to: "d" }];
  await request.post("/api/views", { data: { view: { v: 2, id: "gr2", title: "Small graph", sections: [{ id: "s", layout: "grid", items: [{ id: "g", span: 12, c: { type: "graph", edges } }] }] } } });
  await expect.poll(async () => (await status(request, "gr2")).unverified).toEqual([]);
  const box = page.locator('[data-item="g"] .graph-canvas');
  await expect(box).toHaveAttribute("data-positions", /"d"/);
  await page.waitForTimeout(900);
  const before = JSON.parse((await box.getAttribute("data-positions"))!);
  await request.post("/api/views/gr2/patch", { data: { ops: [{ op: "update", id: "g", item: { c: { edges: [...edges, { from: "d", to: "e" }] } } }] } });
  await expect(box).toHaveAttribute("data-positions", /"e"/);
  const after = JSON.parse((await box.getAttribute("data-positions"))!);
  for (const id of ["a", "b", "c", "d"]) {
    expect(Math.abs(after[id].x - before[id].x), id).toBeLessThanOrEqual(1);
    expect(Math.abs(after[id].y - before[id].y), id).toBeLessThanOrEqual(1);
  }
});
