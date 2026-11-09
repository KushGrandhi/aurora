import { expect, test } from "@playwright/test";

// A design can change the view's params: a slider or a picked case re-runs the queries, and the design gets the rows.
const app = `import { useParamState, useQuery } from "aurora/kit";
export default function App() {
  const [cut, setCut] = useParamState<number>("cut");
  const rows = useQuery<{ n: number }>("above");
  return (<div className="p-4">
    <button id="up" onClick={() => setCut((cut ?? 0) + 2)}>up</button>
    <button id="same" onClick={() => setCut(cut ?? 0)}>same</button>
    <span id="cut">{String(cut)}</span> <span id="n">{rows[0]?.n ?? "…"}</span>
  </div>);
}`;
const view = {
  v: 2, id: "dp1", title: "T",
  datasets: { d: { inline: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => ({ v })) } },
  params: { cut: { type: "number", label: "Cut", min: 0, max: 10, default: 4 } },
  queries: { above: { sql: "SELECT count(*) AS n FROM d WHERE v > $cut" } },
  sections: [{ id: "s", layout: "grid", items: [{ id: "x", span: 12, c: { type: "design", framework: "react", data: ["above"], files: { "App.tsx": app } } }] }],
};

test("a design sets a param: its queries re-run, the design gets the new rows, a repeat does nothing", async ({ page, request }) => {
  await page.goto("/#dp1");
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
  const f = page.frameLocator('[data-item="x"] iframe');
  await expect(f.locator("#n")).toHaveText("6");
  await f.locator("#up").click();
  await expect.poll(async () => (await (await request.get("/api/views/dp1/status")).json()).params.cut).toBe(6);
  await expect(f.locator("#n")).toHaveText("4");
  await expect(f.locator("#cut")).toHaveText("6");
  await f.locator("#same").click();
  await page.waitForTimeout(300);
  expect((await (await request.get("/api/views/dp1/status")).json()).params.cut).toBe(6);
});

test("a design can't set a param the view doesn't have", async ({ page, request }) => {
  await page.goto("/#dp2");
  await expect(page.locator(".conn.up")).toBeVisible();
  const bad = { ...view, id: "dp2", sections: [{ id: "s", layout: "grid", items: [{ id: "x", span: 12, c: { type: "design", framework: "react", files: { "App.tsx": `import { setParam } from "aurora/kit";\nexport default function App() { return <button id="b" onClick={() => setParam("nope", 1)}>b</button>; }` } } }] }] };
  expect((await request.post("/api/views", { data: { view: bad } })).status()).toBe(200);
  await page.frameLocator('[data-item="x"] iframe').locator("#b").click();
  await expect.poll(async () => JSON.stringify((await (await request.get("/api/views/dp2/status")).json()).problems)).toContain("no param");
});
