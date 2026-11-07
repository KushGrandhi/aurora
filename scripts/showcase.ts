// Publishes one view that shows everything aurora can do. Usage: npx tsx scripts/showcase.ts  (screen on AURORA_PORT, default 4317)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const f = (n: string) => readFileSync(path.join(here, "showcase", n), "utf8");
const base = `http://localhost:${process.env.AURORA_PORT ?? 4317}`;

const view = {
  v: 2, id: "showcase", title: "Show anything, live.", summary: "Revenue by region as light: a 3D design reading a live query. Change a filter and the columns reshape; drag to turn it. Below, every component aurora has.",
  datasets: { sales: path.join(root, "packages/engine/test/fixtures/sales.csv") },
  params: {
    region: { type: "select", label: "Region", options: { query: "regions", field: "region" } },
    when: { type: "daterange", label: "Date" },
  },
  queries: {
    regions: { sql: "SELECT DISTINCT region FROM sales ORDER BY region" },
    by_region: { sql: "SELECT region, round(sum(revenue)) AS revenue, sum(units) AS units FROM sales WHERE ($region IS NULL OR region = $region) AND ($when_from IS NULL OR date >= $when_from::DATE) AND ($when_to IS NULL OR date <= $when_to::DATE) GROUP BY region ORDER BY region" },
    total: { sql: "SELECT sum(revenue) AS revenue, sum(units) AS units, count(*) AS orders, avg(revenue) AS avg_order FROM sales WHERE ($region IS NULL OR region = $region) AND ($when_from IS NULL OR date >= $when_from::DATE) AND ($when_to IS NULL OR date <= $when_to::DATE)" },
    monthly: { sql: "SELECT strftime(date_trunc('month', date), '%Y-%m') AS month, sum(revenue) AS revenue FROM sales WHERE ($region IS NULL OR region = $region) AND ($when_from IS NULL OR date >= $when_from::DATE) AND ($when_to IS NULL OR date <= $when_to::DATE) GROUP BY 1 ORDER BY 1" },
    top_orders: { sql: "SELECT date, region, product, units, revenue FROM sales WHERE ($region IS NULL OR region = $region) AND ($when_from IS NULL OR date >= $when_from::DATE) AND ($when_to IS NULL OR date <= $when_to::DATE) ORDER BY revenue DESC LIMIT 50" },
  },
  sections: [
    { id: "hero", layout: "grid", items: [
      { id: "scene", span: 12, c: { type: "design", framework: "react", display: "hero", data: ["by_region"], files: { "App.tsx": f("App.tsx"), "Bars.tsx": f("Bars.tsx") } } },
    ] },
    { id: "numbers", title: "Numbers", layout: "grid", items: [
      { id: "k_rev", span: 3, c: { type: "kpi", query: "total", field: "revenue", label: "Revenue", format: "currency", sparkline: { query: "monthly", x: "month", y: "revenue" } } },
      { id: "k_units", span: 3, c: { type: "kpi", query: "total", field: "units", label: "Units sold", format: "integer" } },
      { id: "k_orders", span: 3, c: { type: "kpi", query: "total", field: "orders", label: "Orders", format: "integer" } },
      { id: "k_avg", span: 3, c: { type: "kpi", query: "total", field: "avg_order", label: "Average order", format: "currency" } },
      { id: "trend", span: 7, c: { type: "chart", query: "monthly", vegaLite: { title: "Revenue by month", mark: { type: "line", point: true }, encoding: { x: { field: "month", type: "ordinal" }, y: { field: "revenue", type: "quantitative" } } } } },
      { id: "regions_chart", span: 5, c: { type: "chart", query: "by_region", vegaLite: { title: "Revenue by region", mark: "bar", encoding: { y: { field: "region", type: "nominal", sort: "-x" }, x: { field: "revenue", type: "quantitative" } } } } },
      { id: "orders", span: 12, c: { type: "table", query: "top_orders", title: "Largest orders" } },
    ] },
    { id: "system", title: "How aurora is built", layout: "grid", items: [
      { id: "arch", span: 12, c: { type: "architecture", direction: "right", groups: [{ id: "local", label: "Your machine" }], nodes: [
        { id: "agent", label: "Any model", kind: "client", note: "Claude, Haiku, Ollama" },
        { id: "mcp", label: "MCP / HTTP", kind: "gateway", group: "local" },
        { id: "server", label: "aurora server", kind: "service", group: "local", note: "validates, versions" },
        { id: "duck", label: "DuckDB", kind: "database", group: "local" },
        { id: "screen", label: "Screen", kind: "client", group: "local", note: "React + motion" },
        { id: "sandbox", label: "Design sandbox", kind: "service", group: "local", note: "kit, three, checks" } ],
        edges: [{ from: "agent", to: "mcp", label: "view + patches", flow: true }, { from: "mcp", to: "server" }, { from: "server", to: "duck", label: "SQL" }, { from: "server", to: "screen", label: "websocket", flow: true }, { from: "screen", to: "sandbox" }, { from: "sandbox", to: "server", style: "dashed", label: "problems" }] } },
      { id: "seq", span: 7, c: { type: "diagram", source: "sequenceDiagram\n  participant M as Model\n  participant A as aurora\n  participant S as Screen\n  M->>A: render(view)\n  A->>S: draw v1\n  S-->>A: rendered + design checks\n  M->>A: status\n  A-->>M: problems\n  M->>A: patch(editFile)\n  A->>S: draw v2", caption: "The loop every model follows" } },
      { id: "steps", span: 5, c: { type: "steps", steps: [{ title: "Render", detail: "Send a view: title, sections, items" }, { title: "Patch", detail: "Add one item at a time" }, { title: "Check", detail: "status returns errors and design warnings" }, { title: "Refine", detail: "Small editFile patches, every version kept" }] } },
    ] },
    { id: "world", title: "Relationships, places and time", layout: "grid", items: [
      { id: "deps", span: 6, c: { type: "graph", layout: "force", nodes: [{ id: "spec", group: "core" }, { id: "engine", group: "core" }, { id: "renderer", group: "ui" }, { id: "server", group: "core" }, { id: "kit", group: "ui" }, { id: "three", group: "lib" }, { id: "duckdb", group: "lib" }, { id: "react", group: "lib" }], edges: [{ from: "engine", to: "spec" }, { from: "renderer", to: "spec" }, { from: "server", to: "spec" }, { from: "server", to: "engine" }, { from: "kit", to: "three" }, { from: "kit", to: "react" }, { from: "renderer", to: "react" }, { from: "engine", to: "duckdb" }, { from: "renderer", to: "kit" }] } },
      { id: "map", span: 6, c: { type: "map", tiles: "none", points: [{ lat: 37.77, lon: -122.42, label: "San Francisco" }, { lat: 12.97, lon: 77.59, label: "Bengaluru" }, { lat: 51.51, lon: -0.13, label: "London" }, { lat: 35.68, lon: 139.69, label: "Tokyo" }], routes: [{ path: [[-122.42, 37.77], [-0.13, 51.51], [77.59, 12.97], [139.69, 35.68]], label: "Open source, everywhere" }] } },
      { id: "history", span: 12, c: { type: "timeline", events: [{ date: "2026-10-01", end: "2026-10-20", title: "Components and data", group: "Build" }, { date: "2026-10-25", title: "Design canvas", group: "Build" }, { date: "2026-11-02", title: "Public, MIT", group: "Release" }, { date: "2026-11-06", end: "2026-11-07", title: "3D kit, hero, design checks", group: "Build" }] } },
    ] },
    { id: "work", title: "Code, collections and media", layout: "tabs", items: [
      { id: "code", title: "Code", c: { type: "code", lang: "tsx", filename: "Bars.tsx", highlight: [3], code: f("Bars.tsx").split("\n").slice(0, 14).join("\n") } },
      { id: "cards", title: "Cards", c: { type: "cards", items: [{ title: "aurora/kit", subtitle: "3D scenes, panels, controls", tags: ["three", "react"] }, { title: "Design checks", subtitle: "Warnings for ugly output", tags: ["quality"] }, { title: "Hero display", subtitle: "Full-width visual, sections below", tags: ["layout"] }] } },
      { id: "media", title: "Media", c: { type: "media", items: [{ src: path.join(root, "docs/screenshots/gallery-dark.png"), caption: "Every component, dark theme" }] } },
      { id: "json", title: "JSON", c: { type: "json", value: { op: "editFile", id: "scene", path: "App.tsx", edits: [{ find: "Show anything", replace: "Show everything" }] } } },
    ] },
    { id: "notes", layout: "grid", items: [
      { id: "tip", span: 6, c: { type: "callout", tone: "tip", title: "Every number above is live", md: "Change **Region** or **Date** and the KPIs, charts, table and the 3D columns all re-query DuckDB. Revenue right now: {total.revenue|currency}." } },
      { id: "prose", span: 6, c: { type: "text", md: "**Built by any model.** aurora validates what a model sends, renders it with motion, keeps every version, and reports errors and design warnings back so the model can fix them." } },
    ] },
  ],
};

const r = await fetch(`${base}/api/views`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ view }) });
const out = await r.json();
console.log(r.status, out.url ?? "");
await new Promise((ok) => setTimeout(ok, 6000));
const s = await (await fetch(`${base}/api/views/showcase/status`)).json();
console.log(JSON.stringify(s.problems, null, 1));
