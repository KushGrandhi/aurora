import { expect, test } from "@playwright/test";

// Linked focus: pointing at a thing in one item lights it up in every item of the view.
const design = `import { useEffect, useState } from "react";
export default function App() {
  const a = (window as any).aurora;
  const [f, setF] = useState(a.focus ?? null);
  useEffect(() => a.onFocus((v: string | null) => setF(v)), []);
  return <div><p id="f">{f ?? "none"}</p><button id="east" onClick={() => a.setFocus("East")}>East</button><button id="clear" onClick={() => a.setFocus(null)}>clear</button></div>;
}`;
const view = {
  v: 2, id: "foc1", title: "Focus",
  datasets: { d: { inline: [{ region: "East", revenue: 10 }, { region: "West", revenue: 20 }] } },
  queries: { rows: { sql: "SELECT region, revenue FROM d ORDER BY region" } },
  sections: [{ id: "s", layout: "grid", items: [
    { id: "ch", span: 6, c: { type: "chart", query: "rows", vegaLite: { mark: "bar", encoding: { y: { field: "region", type: "nominal", sort: null }, x: { field: "revenue", type: "quantitative" } } } } },
    { id: "tbl", span: 6, c: { type: "table", query: "rows", title: "Rows" } },
    { id: "t", span: 6, c: { type: "text", md: "The West region leads; East follows." } },
    { id: "d", span: 6, c: { type: "design", framework: "react", height: 200, files: { "App.tsx": design } } },
  ] }],
};

test("pointing at a bar lights the same thing up in the table, the prose and a design", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/#foc1");
  await expect(page.locator(".conn.up")).toBeVisible();
  const r = await request.post("/api/views", { data: { view } });
  expect(r.status(), await r.text()).toBe(200);
  const f = page.frameLocator('[data-item="d"] iframe');
  await expect(f.locator("#f")).toHaveText("none");
  const bars = page.locator('[data-item="ch"] .mark-rect path');
  await expect(bars).toHaveCount(2);
  await page.waitForTimeout(1200); // the chart's reveal settles

  // hover West's bar (the second)
  await bars.nth(1).hover();
  await expect(page.locator('[data-item="tbl"] tr.focused')).toContainText("West");
  await expect(page.locator('[data-item="tbl"] tr.focused')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => (CSS as any).highlights?.get("aurora-focus")?.size ?? 0)).toBe(1);
  await expect(f.locator("#f")).toHaveText("West");
  // the other bar dims
  await expect.poll(() => bars.nth(0).evaluate((el) => Number(el.getAttribute("opacity") ?? getComputedStyle(el).opacity))).toBeLessThan(0.5);

  // leaving clears it
  await page.mouse.move(5, 990);
  await expect(page.locator('[data-item="tbl"] tr.focused')).toHaveCount(0);
  await expect(f.locator("#f")).toHaveText("none");

  // a design can set the focus too
  await f.locator("#east").click();
  await expect(page.locator('[data-item="tbl"] tr.focused')).toContainText("East");
  await expect.poll(() => bars.nth(1).evaluate((el) => Number(el.getAttribute("opacity") ?? getComputedStyle(el).opacity))).toBeLessThan(0.5);
  // hovering a table row focuses its value
  await page.locator('[data-item="tbl"] tr', { hasText: "West" }).hover();
  await expect(f.locator("#f")).toHaveText("West");
  await expect.poll(async () => (await (await request.get("/api/views/foc1/status")).json()).problems.filter((p: { severity: string }) => p.severity === "error")).toEqual([]);
});

test("a table row focuses its name, not its date, and charts without that value stay lit", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/#foc2");
  await expect(page.locator(".conn.up")).toBeVisible();
  const v = { v: 2, id: "foc2", title: "Focus",
    datasets: { d: { inline: [{ date: "2025-02-12", region: "West", revenue: 20 }, { date: "2025-03-01", region: "East", revenue: 10 }] } },
    queries: { rows: { sql: "SELECT date, region, revenue FROM d ORDER BY date" }, months: { sql: "SELECT strftime(date::DATE, '%Y-%m') AS month, sum(revenue) AS revenue FROM d GROUP BY 1 ORDER BY 1" } },
    sections: [{ id: "s", layout: "grid", items: [
      { id: "m", span: 12, c: { type: "chart", query: "months", vegaLite: { mark: "bar", encoding: { x: { field: "month", type: "ordinal" }, y: { field: "revenue", type: "quantitative" } } } } },
      { id: "tbl", span: 12, c: { type: "table", query: "rows" } },
      { id: "t", span: 12, c: { type: "text", md: "West leads." } },
    ] }] };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  const bars = page.locator('[data-item="m"] .mark-rect path');
  await expect(bars).toHaveCount(2);
  await page.waitForTimeout(1200);
  await page.locator('[data-item="tbl"] tr', { hasText: "West" }).hover();
  await expect.poll(() => page.evaluate(() => (CSS as any).highlights?.get("aurora-focus")?.size ?? 0)).toBe(1);
  await page.waitForTimeout(300);
  for (const i of [0, 1]) expect(await bars.nth(i).evaluate((el) => Number(el.getAttribute("opacity") ?? 1))).toBe(1);
});

test("a chart moves its marks to new values when a filter changes, instead of redrawing", async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/#foc3");
  await expect(page.locator(".conn.up")).toBeVisible();
  const v = { v: 2, id: "foc3", title: "Morph",
    datasets: { d: { inline: [{ region: "East", k: "a", revenue: 10 }, { region: "West", k: "a", revenue: 20 }, { region: "East", k: "b", revenue: 30 }, { region: "West", k: "b", revenue: 5 }] } },
    params: { k: { type: "select", label: "Kind", options: ["a", "b"], default: "a" } },
    queries: { rows: { sql: "SELECT region, revenue FROM d WHERE k = $k ORDER BY region" } },
    sections: [{ id: "s", layout: "grid", items: [{ id: "ch", c: { type: "chart", query: "rows", vegaLite: { mark: "bar", encoding: { y: { field: "region", type: "nominal", sort: null }, x: { field: "revenue", type: "quantitative", scale: { domain: [0, 40] } } } } } }] }] };
  expect((await request.post("/api/views", { data: { view: v } })).status()).toBe(200);
  const bar = page.locator('[data-item="ch"] .mark-rect path').first();
  await expect(bar).toBeVisible();
  await page.waitForTimeout(1300);
  await bar.evaluate((el) => { (el as SVGElement & { tag?: string }).tag = "same"; });
  const before = await bar.getAttribute("d");
  expect(await bar.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("d");
  await page.locator(".filterbar select").selectOption("b");
  await expect.poll(() => bar.getAttribute("d")).not.toBe(before);
  // the same element moved: no redraw
  expect(await page.locator('[data-item="ch"] .mark-rect path').first().evaluate((el) => (el as SVGElement & { tag?: string }).tag)).toBe("same");
});
