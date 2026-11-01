import { expect, test, type APIRequestContext } from "@playwright/test";

const status = async (request: APIRequestContext, id: string) => (await request.get(`/api/views/${id}/status`)).json();
const item = (id: string, source: string) => ({ id, span: 6, c: { type: "diagram", source } });

test("flowchart, sequence and state diagrams render", async ({ page, request }) => {
  await page.goto("/#dg1");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id: "dg1", title: "Diagrams", sections: [{ id: "s", layout: "grid", items: [
    item("flow", "flowchart LR\n  A[Request] --> B{Cached?}\n  B -- yes --> C[Return]\n  B -- no --> D[Compute] --> C"),
    item("seq", "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi"),
    item("state", "stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy: job\n  Busy --> Idle: done"),
  ] }] } } });
  for (const id of ["flow", "seq", "state"]) await expect(page.locator(`[data-item="${id}"] svg`).first()).toBeVisible();
  await expect.poll(async () => (await status(request, "dg1")).unverified).toEqual([]);
  expect((await status(request, "dg1")).problems).toEqual([]);
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/diagrams.png", fullPage: true });
});

test("broken mermaid becomes a problem", async ({ page, request }) => {
  await page.goto("/#dg2");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id: "dg2", title: "Broken", sections: [{ id: "s", layout: "grid", items: [
    item("bad", "graph TD; A-->"),
    { id: "ok", span: 6, c: { type: "text", md: "sibling" } },
  ] }] } } });
  await expect(page.locator('[data-item="bad"] .fallback')).toBeVisible();
  await expect(page.locator('[data-item="ok"]')).toContainText("sibling");
  await expect.poll(async () => (await status(request, "dg2")).unverified).toEqual([]);
  const s = await status(request, "dg2");
  const p = s.problems.find((x: { itemId?: string }) => x.itemId === "bad");
  expect(p.severity).toBe("error");
  expect(p.message.startsWith("render failed: mermaid:")).toBe(true);
  expect(s.problems.some((x: { itemId?: string }) => x.itemId === "ok")).toBe(false);
});

test("patching a diagram animates only new nodes", async ({ page, request }) => {
  await page.goto("/#dg3");
  await expect(page.locator(".conn.up")).toBeVisible();
  await request.post("/api/views", { data: { view: { v: 2, id: "dg3", title: "Grow", sections: [{ id: "s", layout: "grid", items: [
    item("g", "flowchart LR\n  A[One] --> B[Two]"),
  ] }] } } });
  await expect(page.locator('[data-item="g"] svg .node')).toHaveCount(2);
  await page.waitForTimeout(800);
  await request.post("/api/views/dg3/patch", { data: { ops: [{ op: "update", id: "g", item: { c: { source: "flowchart LR\n  A[One] --> B[Two] --> C[Three]" } } }] } });
  await expect(page.locator('[data-item="g"] svg .node')).toHaveCount(3);
  await expect(page.locator('[data-item="g"] svg .enter')).toHaveCount(1);
});
