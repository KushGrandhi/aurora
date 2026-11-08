import { expect, test } from "@playwright/test";

// A design that shows what the story and the params tell it.
const visual = `import { useEffect, useState } from "react";
export default function App() {
  const a = (window as any).aurora;
  const [s, setS] = useState(a.story);
  const [p, setP] = useState(a.params);
  useEffect(() => a.onStory((v: any) => setS(v)), []);
  useEffect(() => a.onParams((v: any) => setP(v)), []);
  return <div style={{ height: 400 }}><p id="story">{s ? s.index + ":" + JSON.stringify(s.state ?? null) : "none"}</p><p id="rpm">{String(p?.rpm)}</p><p id="focus">{a.focus ?? ""}</p></div>;
}`;
const filler = "Words to give the step some length. ".repeat(12);
const view = {
  v: 2, id: "st1", title: "How a stroke works",
  datasets: { d: { inline: [{ x: 1 }] } },
  params: { rpm: { type: "number", label: "Engine speed", min: 600, max: 7000, step: 100, default: 800, unit: "rpm" },
    gear: { type: "select", label: "Gear", options: ["first", "second", "third"] } },
  sections: [
    { id: "story", title: "Four strokes", layout: "story", items: [
      { id: "v", c: { type: "design", framework: "react", files: { "App.tsx": visual } } },
      { id: "s1", c: { type: "text", md: "**Intake.** The piston falls. " + filler }, story: { focus: "intake", state: { phase: 0 } } },
      { id: "s2", c: { type: "text", md: "**Compression.** Both valves shut. " + filler }, story: { focus: "compression", state: { phase: 1 } } },
      { id: "s3", c: { type: "text", md: "**Power.** The spark fires. " + filler }, story: { state: { phase: 2 } } },
    ] },
    { id: "after", title: "Try it", layout: "grid", items: [
      { id: "prose", c: { type: "text", md: "At {{rpm}} the crank turns fast; in {{gear}} gear it pulls hard." } },
    ] },
  ],
};

test("a story pins its visual while steps scroll past and drive it", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#st1");
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view } });
  expect(r.status(), await r.text()).toBe(200);
  const f = page.frameLocator('[data-item="v"] iframe');
  await expect(f.locator("#story")).toBeVisible();
  const step = (id: string) => page.locator(`[data-item="${id}"]`);
  await step("s1").scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, 0));
  // scroll each step to the middle of the screen
  for (const [id, want] of [["s2", '1:{"phase":1}'], ["s3", '2:{"phase":2}'], ["s1", '0:{"phase":0}']] as const) {
    await step(id).evaluate((el) => el.scrollIntoView({ block: "center" }));
    await expect(f.locator("#story")).toHaveText(want);
    await expect(step(id)).toHaveClass(/\bactive\b/);
    // the visual stays on screen
    const b = (await page.locator('[data-item="v"]').boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(-1);
    expect(b.y + b.height).toBeLessThanOrEqual(801);
  }
  // a step's focus lights the same word up everywhere (here: the design hears it)
  await step("s2").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(f.locator("#story")).toHaveText('1:{"phase":1}');
  await expect.poll(async () => (await (await request.get("/api/views/st1/status")).json()).problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
});

test("prose controls: a draggable number and an inline choice set the view's params, and designs hear them", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/#st2");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: { ...view, id: "st2" } } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="v"] iframe');
  await expect(f.locator("#rpm")).toHaveText("800");
  const num = page.locator('[data-item="prose"] [data-param="rpm"]');
  await num.scrollIntoViewIfNeeded();
  await expect(num).toContainText("800");
  // drag right to raise it
  const b = (await num.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await (await request.get("/api/views/st2/status")).json()).params.rpm).toBeGreaterThan(800);
  const rpm = (await (await request.get("/api/views/st2/status")).json()).params.rpm;
  expect(rpm % 100).toBe(0);
  await expect(num).toContainText(rpm.toLocaleString("en-US"));
  await expect(f.locator("#rpm")).toHaveText(String(rpm));
  // keyboard works too
  await num.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await (await request.get("/api/views/st2/status")).json()).params.rpm).toBe(rpm + 100);
  // an inline choice
  await page.locator('[data-item="prose"] [data-param="gear"] select').selectOption("third");
  await expect.poll(async () => (await (await request.get("/api/views/st2/status")).json()).params.gear).toBe("third");
});

test("at a laptop size a story's visual fills the screen behind the steps, never a narrow column", async ({ page, request }) => {
  await page.setViewportSize({ width: 1000, height: 560 });
  await page.goto("/#st3");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: { ...view, id: "st3" } } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="v"] iframe');
  await expect(f.locator("#story")).toBeVisible();
  await page.locator('[data-item="s2"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(f.locator("#story")).toHaveText('1:{"phase":1}');
  // nothing beside the view: the visual spans the screen edge to edge and the full height
  await expect(page.locator(".side")).toHaveCount(0);
  const v = (await page.locator('[data-item="v"] iframe').boundingBox())!;
  expect(v.width).toBeGreaterThanOrEqual(1000 - 2);
  expect(v.height).toBeGreaterThanOrEqual(560 - 2);
  expect(v.y).toBeGreaterThanOrEqual(-1);
  // the step being read is on screen, on the left, over the visual
  const s = (await page.locator('[data-item="s2"]').boundingBox())!;
  expect(s.x).toBeLessThan(500);
  expect(s.y).toBeGreaterThanOrEqual(0);
  expect(s.y + s.height).toBeLessThanOrEqual(560);
  // the design is told it is a hero-like stage (kit panels on the left clear the steps)
  expect(await f.locator("body").evaluate(() => document.documentElement.dataset.display)).toBe("hero");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1000);
});

test("on a phone a story stacks: visual on top, the step below it", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/#st4");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view: { ...view, id: "st4" } } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="v"] iframe');
  await page.locator('[data-item="s2"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
  await expect(f.locator("#story")).toHaveText('1:{"phase":1}');
  const v = (await page.locator('[data-item="v"] iframe').boundingBox())!, s = (await page.locator('[data-item="s2"]').boundingBox())!;
  expect(v.width).toBeGreaterThanOrEqual(390 - 2);
  expect(s.y).toBeGreaterThanOrEqual(v.y + v.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
