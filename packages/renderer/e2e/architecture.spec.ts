import { expect, test, type APIRequestContext } from "@playwright/test";

const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();
const arch = {
  type: "architecture", direction: "right",
  groups: [{ id: "backend", label: "Backend" }],
  nodes: [
    { id: "web", label: "Web app", kind: "client" },
    { id: "api", label: "API gateway", kind: "gateway", group: "backend" },
    { id: "svc", label: "Orders service", kind: "service", group: "backend", note: "Node + Fastify" },
    { id: "db", label: "Postgres", kind: "database", group: "backend" },
  ],
  edges: [{ from: "web", to: "api", label: "HTTPS", flow: true }, { from: "api", to: "svc" }, { from: "svc", to: "db", style: "dashed" }],
};
const post = (request: APIRequestContext, id: string) => request.post("/api/views", { data: { view: { v: 2, id, title: "Architecture", sections: [{ id: "s", layout: "grid", items: [{ id: "a", span: 12, c: arch }] }] } } });

test("architecture renders with icons and labels", async ({ page, request }) => {
  await page.goto("/#ar1");
  await expect(page.locator(".conn.up")).toBeVisible();
  await post(request, "ar1");
  const a = page.locator('[data-item="a"]');
  await expect(a.locator(".arch-node")).toHaveCount(4);
  for (const t of ["Web app", "API gateway", "Orders service", "Node + Fastify", "Postgres", "Backend", "HTTPS"]) await expect(a).toContainText(t);
  await expect(a.locator(".arch-node svg.lucide")).toHaveCount(4);
  await expect(a.locator(".arch-edge")).toHaveCount(3);
  await expect.poll(async () => (await status(request, "ar1")).unverified).toEqual([]);
  expect((await status(request, "ar1")).problems).toEqual([]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: "test-results/architecture.png", fullPage: true });
});

test("patch keeps unchanged nodes and moves them", async ({ page, request }) => {
  await page.goto("/#ar2");
  await expect(page.locator(".conn.up")).toBeVisible();
  await post(request, "ar2");
  await expect(page.locator('[data-node="api"]')).toBeVisible();
  await page.evaluate(() => { (document.querySelector('[data-node="api"]') as Element & { tag?: string }).tag = "same"; });
  await request.post("/api/views/ar2/patch", { data: { ops: [{ op: "update", id: "a", item: { c: {
    nodes: [...arch.nodes, { id: "cache", label: "Redis", kind: "cache", group: "backend" }],
    edges: [...arch.edges, { from: "svc", to: "cache" }],
  } } }] } });
  await expect(page.locator('[data-node="cache"]')).toBeVisible();
  expect(await page.evaluate(() => (document.querySelector('[data-node="api"]') as Element & { tag?: string }).tag)).toBe("same");
  await expect(page.locator('[data-item="a"] .arch-edge')).toHaveCount(4);
});

test("reduced motion disables flow animation", async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#ar3");
  await expect(page.locator(".conn.up")).toBeVisible();
  await post(request, "ar3");
  const flow = page.locator('[data-item="a"] path.flow');
  await expect(flow).toHaveCount(1);
  expect(await flow.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
});
