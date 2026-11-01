import { expect, test } from "vitest";
import type { Part, RenderEvent } from "@aurora/spec";
import { compose } from "../src/compose.ts";
import { SpecCache } from "../src/cache.ts";
import { openDb } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import { createFakeProvider } from "../src/llm/fake.ts";
import { createPartsParser } from "../src/partsParser.ts";
import { profileDatasets } from "../src/profile.ts";
import { explainQuery, referencesData, runQuery } from "../src/sql.ts";
import { validatePart } from "../src/validate.ts";
import { fx } from "./helpers.ts";

const q = (id: string, sql: string) => ({ kind: "query", id, sql });
const kpi = (id: string, query: string, label = "Revenue") => ({ kind: "item", item: { id, span: 3, c: { type: "kpi", query, field: "v", label } } });
const totalQ = q("total", "SELECT sum(revenue) AS v FROM data");

async function run(doc: object, fake: Parameters<typeof createFakeProvider>[1] = {}) {
  const events: RenderEvent[] = [];
  await compose({ renderId: "r", input: fx("sales.csv"), provider: createFakeProvider(doc, { chunkSize: 9, ...fake }), cache: new SpecCache(), emit: (e) => events.push(e) });
  return events;
}
const composed = (ev: RenderEvent[]) => ev.flatMap((e) => (e.t === "item" && !e.item.id.startsWith("d_") ? [e.item] : []));
const ctx = () => ({ knownQueries: new Set(["t"]), intent: "", queryLimits: new Map<string, number>() });
const chart = (vegaLite: object): Part => ({ kind: "item", item: { id: "c", span: 6, c: { type: "chart", query: "t", vegaLite: vegaLite as Record<string, unknown> } } });

// C1
test("held item is validated before release", async () => {
  const ev = await run({ title: "T", parts: [kpi("k_bad", "total", "Revenue 4.2M"), totalQ] });
  expect(composed(ev).map((i) => i.id)).not.toContain("k_bad");
});
test("held chart is sanitized before release", async () => {
  const c = { kind: "item", item: { id: "c1", span: 6, c: { type: "chart", query: "total", vegaLite: { mark: "bar", data: { values: [{ v: 999 }] } } } } };
  const ev = await run({ title: "T", parts: [c, totalQ] });
  const item = composed(ev).find((i) => i.id === "c1")!;
  expect((item.c as any).vegaLite.data).toBeUndefined();
});
test("text waiting on a placeholder query is not released by another query", async () => {
  const text = { kind: "item", item: { id: "t1", span: 12, c: { type: "text", md: "Total {later.v|currency}" } } };
  const ev = await run({ title: "T", parts: [text, totalQ, kpi("k1", "total")] });
  expect(composed(ev).map((i) => i.id)).toEqual(["k1"]);
});

// I1 + minor 1
test("explain rejects E-string multi-statement smuggling and data survives", async () => {
  const db = await openDb();
  await ingest(db, fx("sales.csv"));
  const r = await explainQuery(db, "SELECT E'\\'' AS a; DROP TABLE data; SELECT ''");
  expect(r.ok).toBe(false);
  expect((await runQuery(db, "SELECT count(*) AS n FROM data")).rows[0].n).toBe(240);
  await db.close();
});
test("query with trailing line comment runs", async () => {
  const db = await openDb();
  await ingest(db, fx("sales.csv"));
  expect((await runQuery(db, "SELECT count(*) AS n FROM data -- all rows")).rows[0].n).toBe(240);
  await db.close();
});

// I2
test.each([
  ["title object", { title: { text: "Revenue 4.2M" }, mark: "bar" }],
  ["subtitle", { title: { text: "Rev", subtitle: "up 37%" }, mark: "bar" }],
  ["text mark literal", { mark: { type: "text", text: "$4.2M" } }],
  ["calculate literal", { mark: "bar", transform: [{ calculate: "4200000", as: "fake" }] }],
  ["axis title", { mark: "bar", encoding: { x: { field: "a", title: "Up 37%" } } }],
  ["encoding value", { mark: "text", encoding: { text: { value: "42" } } }],
  ["labelExpr literal", { mark: "bar", encoding: { x: { field: "a", axis: { labelExpr: "'99'" } } } }],
])("rejects typed number in vega-lite %s", (_n, vl) => {
  expect(validatePart(chart(vl), ctx()).ok).toBe(false);
});
test("strips data nested in lookup transform", () => {
  const r = validatePart(chart({ mark: "bar", transform: [{ lookup: "a", from: { data: { values: [{ a: 1 }] }, key: "a" } }] }), ctx());
  expect(r.ok && JSON.stringify(r.part)).not.toContain("values");
});
test("allows filter literals and plain titles", () => {
  expect(validatePart(chart({ title: "Revenue by region", mark: "bar", transform: [{ filter: "datum.v > 3" }] }), ctx()).ok).toBe(true);
});

// I3
test("malformed part is reported and later parts still emit", () => {
  const parts: unknown[] = [];
  const bad: string[] = [];
  const p = createPartsParser({ onMeta() {}, onPart: (x) => parts.push(x), onBadPart: (raw) => bad.push(raw) });
  p.push('{"title":"T","parts":[{"kind":"item","item":{"md":"line\nbreak"}},{"kind":"query","id":"q","sql":"SELECT 1"}]}');
  expect(p.end().complete).toBe(true);
  expect(bad).toHaveLength(1);
  expect(parts).toEqual([{ kind: "query", id: "q", sql: "SELECT 1" }]);
});

// I4
test("done waits for default results when LLM sends no queries", async () => {
  const ev = await run({ title: "T", parts: [] });
  const t = ev.map((e) => e.t);
  expect(t.lastIndexOf("result")).toBeLessThan(t.indexOf("done"));
  expect((ev.at(-1) as any).timings.default).toBeGreaterThan(0);
});

// I5
test("a repair does not block later parts", async () => {
  const bad = { kind: "item", item: { id: "t_bad", span: 12, c: { type: "text", md: "grew 12%" } } };
  const fixed = { kind: "item", item: { id: "t_bad", span: 12, c: { type: "text", md: "grew {total.v}" } } };
  const ev = await run({ title: "T", parts: [totalQ, bad, kpi("k1", "total")] }, { repair: fixed, repairDelayMs: 150 });
  expect(composed(ev).map((i) => i.id)).toEqual(["k1", "t_bad"]);
});

// I6
test("truncated stream emits an error", async () => {
  const ev = await run({ title: "T", parts: [totalQ, kpi("k1", "total"), kpi("k2", "total")] }, { truncateAt: 0.8 });
  expect(ev.some((e) => e.t === "error" && /truncated/.test(e.message))).toBe(true);
});

// I7
test("referencesData requires a dataset table", () => {
  expect(referencesData("SELECT 4200000 AS v", ["data"])).toBe(false);
  expect(referencesData('WITH m AS (SELECT * FROM "data") SELECT 1 FROM m', ["data"])).toBe(true);
  expect(referencesData("select a from orders o join data d on true", ["data"])).toBe(true);
});
test("constant query is not shown", async () => {
  const ev = await run({ title: "T", parts: [q("fake", "SELECT 4200000 AS v"), kpi("k_fake", "fake")] });
  expect(composed(ev)).toEqual([]);
  expect(ev.some((e) => e.t === "queryError" && e.queryId === "fake")).toBe(true);
});

// Minor 2 (re-graded)
test("infinity dates do not break profiling or queries", async () => {
  const db = await openDb();
  await ingest(db, { inline: [{ d: "2026-01-01" }] }, { lock: false });
  await db.conn.run(`CREATE TABLE inf AS SELECT 'infinity'::DATE AS d, 'infinity'::TIMESTAMP AS t, 1 AS n`);
  const p = await profileDatasets(db, ["inf"]);
  expect(p.datasets[0].rowCount).toBe(1);
  const r = await runQuery(db, "SELECT * FROM inf");
  expect(r.rows[0]).toMatchObject({ t: "infinity", n: 1 });
  await db.close();
});

// Minor 7 (re-graded)
test("rejects markdown images in text", () => {
  const p: Part = { kind: "item", item: { id: "x", span: 12, c: { type: "text", md: "![](https://x/{t.v})" } } };
  expect(validatePart(p, ctx()).ok).toBe(false);
});

// Minor 5 (re-graded)
test("rejects reserved d_ ids from the model", () => {
  expect(validatePart({ kind: "query", id: "d_data_table", sql: "SELECT 1" }, ctx()).ok).toBe(false);
  expect(validatePart({ kind: "item", item: { id: "d_x", span: 3, c: { type: "kpi", query: "t", field: "v", label: "L" } } }, ctx()).ok).toBe(false);
});

// Single-row rule: headline numbers and placeholders must read a one-row query
test("kpi on a multi-row query is not shown", async () => {
  const grouped = q("by_region", "SELECT region, sum(revenue) AS total_revenue FROM data GROUP BY 1");
  const ev = await run({ title: "T", parts: [grouped, kpi("k_bad", "by_region")] });
  expect(composed(ev)).toEqual([]);
});
test("prose placeholder on a multi-row query is not shown", async () => {
  const grouped = q("by_region", "SELECT region, sum(revenue) AS total_revenue FROM data GROUP BY 1");
  const text = { kind: "item", item: { id: "t1", span: 12, c: { type: "text", md: "Total {by_region.total_revenue|currency}" } } };
  const ev = await run({ title: "T", parts: [grouped, text], summary: "Total {by_region.total_revenue|currency}" });
  expect(composed(ev)).toEqual([]);
  expect((ev.filter((e) => e.t === "meta").at(-1) as any).summary).toBeUndefined();
});
test("kpi on a LIMIT 1 ranking query is shown", async () => {
  const top = q("top", "SELECT region, sum(revenue) AS region_revenue FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT 1");
  const ev = await run({ title: "T", parts: [top, { kind: "item", item: { id: "k1", span: 3, c: { type: "kpi", query: "top", field: "region_revenue", label: "Top region" } } }] });
  expect(composed(ev).map((i) => i.id)).toEqual(["k1"]);
});
