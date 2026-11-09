import { expect, test } from "@playwright/test";

// The guardrails that replace the old rules: legible text, scrims on busy surfaces, something to change on a data page.
const design = (id: string, app: string, extra: Record<string, unknown> = {}, cExtra: Record<string, unknown> = {}) => ({
  v: 2, id, title: "T", ...extra,
  sections: [{ id: "s", layout: "grid", items: [{ id: "x", span: 12, c: { type: "design", framework: "react", files: { "App.tsx": app }, ...cExtra } }] }],
});
const warnings = async (request: import("@playwright/test").APIRequestContext, id: string) =>
  JSON.stringify(((await (await request.get(`/api/views/${id}/status`)).json()).problems as { message: string }[]).map((p) => p.message));

async function show(page: import("@playwright/test").Page, request: import("@playwright/test").APIRequestContext, view: Record<string, unknown>) {
  await page.goto(`/#${view.id}`);
  await expect(page.locator(".conn.up")).toBeVisible();
  expect((await request.post("/api/views", { data: { view } })).status()).toBe(200);
}

test("low-contrast text is reported", async ({ page, request }) => {
  await show(page, request, design("lc1", `export default function App() { return <div className="bg-page p-8"><p className="text-sm" style={{ color: "var(--line)" }}>This sentence is nearly invisible on its ground.</p></div>; }`));
  await expect.poll(() => warnings(request, "lc1"), { timeout: 15_000 }).toContain("hard to read");
});

test("text on a busy surface without a scrim is reported; with one it isn't", async ({ page, request }) => {
  const app = (scrim: string) => `import { Surface } from "aurora/kit";\nexport default function App() { return <Surface kind="contour" ${scrim} className="p-10 bg-page"><h2 className="text-2xl text-ink">A long headline sitting on the lines of a map</h2><p className="text-ink-2">And a sentence under it that should stay easy to read.</p></Surface>; }`;
  await show(page, request, design("sc1", app("")));
  await expect.poll(() => warnings(request, "sc1"), { timeout: 15_000 }).toContain("without a scrim");
  await show(page, request, design("sc2", app('scrim="all"')));
  await expect.poll(() => warnings(request, "sc2"), { timeout: 15_000 }).not.toContain("unverified");
  expect(await warnings(request, "sc2")).not.toContain("without a scrim");
});

test("a data page with nothing to change is reported", async ({ page, request }) => {
  const extra = { datasets: { d: { inline: [{ v: 1 }, { v: 2 }] } }, queries: { all: { sql: "SELECT v FROM d" } } };
  await show(page, request, design("nc1", `import { useQuery } from "aurora/kit";\nexport default function App() { const rows = useQuery<{ v: number }>("all"); return <div className="p-8 text-ink">{rows.map((r) => <p key={r.v}>Value {r.v}</p>)}</div>; }`, extra, { display: "page", data: ["all"] }));
  await expect.poll(() => warnings(request, "nc1"), { timeout: 15_000 }).toContain("nothing to change");
});
