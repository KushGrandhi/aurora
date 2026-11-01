import { expect, test } from "vitest";
import type { RenderEvent } from "@aurora/spec";
import { compose } from "../src/compose.ts";
import { SpecCache } from "../src/cache.ts";
import { createFakeProvider } from "../src/llm/fake.ts";
import { fx } from "./helpers.ts";

const goodDoc = {
  title: "Revenue",
  parts: [
    { kind: "query", id: "total", sql: "SELECT sum(revenue) AS v FROM data" },
    { kind: "item", item: { id: "k_total", span: 3, c: { type: "kpi", query: "total", field: "v", label: "Revenue", format: "currency" } } },
    { kind: "query", id: "byRegion", sql: "SELECT region, sum(revenue) AS revenue FROM data GROUP BY 1" },
    { kind: "item", item: { id: "c_region", span: 9, c: { type: "chart", query: "byRegion", vegaLite: { mark: "bar", encoding: { x: { field: "region" }, y: { field: "revenue" } } } } } },
    { kind: "item", item: { id: "t_note", span: 12, c: { type: "text", md: "Total is {total.v|currency}" } } },
  ],
  summary: "Revenue {total.v|currency}",
};

async function run(opts: Partial<Parameters<typeof compose>[0]> & { doc?: object; fake?: Parameters<typeof createFakeProvider>[1] }) {
  const events: RenderEvent[] = [];
  const provider = opts.provider ?? createFakeProvider(opts.doc ?? goodDoc, { chunkSize: 7, ...opts.fake });
  const t0 = performance.now();
  await compose({ renderId: "r1", input: fx("sales.csv"), provider, cache: opts.cache ?? new SpecCache(), emit: (e) => events.push(e), intent: opts.intent });
  return { events, ms: performance.now() - t0, provider };
}
const ts = (events: RenderEvent[]) => events.map((e) => e.t);
// Items may arrive out of order (parts are handled concurrently); `order` is their position in the model's stream.
const composedItems = (events: RenderEvent[]) =>
  events
    .flatMap((e) => (e.t === "item" && !e.item.id.startsWith("d_") ? [e] : []))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((e) => e.item);

test("emits default view before composed items", async () => {
  const { events } = await run({});
  const t = ts(events);
  expect(t[0]).toBe("start");
  expect(t.indexOf("default")).toBeLessThan(t.indexOf("item"));
  expect(t.at(-1)).toBe("done");
  expect(composedItems(events).map((i) => i.id)).toEqual(["k_total", "c_region", "t_note"]);
  expect(events.every((e) => e.renderId === "r1")).toBe(true);
});

test("every composed item's queries have results", async () => {
  const { events } = await run({});
  const results = new Set(events.flatMap((e) => (e.t === "result" ? [e.queryId] : [])));
  expect(results.has("total") && results.has("byRegion")).toBe(true);
  const done = events.at(-1) as Extract<RenderEvent, { t: "done" }>;
  expect(done.timings.firstComponent).toBeGreaterThan(0);
});

test("repairs bad query once", async () => {
  const doc = { ...goodDoc, parts: [{ kind: "query", id: "total", sql: "SELECT sum(nope) AS v FROM data" }, goodDoc.parts[1]] };
  const { events } = await run({ doc, fake: { repair: { kind: "query", id: "total", sql: "SELECT sum(units) AS v FROM data" } } });
  expect(events.some((e) => e.t === "result" && e.queryId === "total")).toBe(true);
  expect(composedItems(events).map((i) => i.id)).toEqual(["k_total"]);
});

test("unrepairable query drops its items", async () => {
  const doc = { ...goodDoc, parts: [{ kind: "query", id: "total", sql: "SELECT sum(nope) AS v FROM data" }, goodDoc.parts[1]] };
  const { events } = await run({ doc });
  expect(events.some((e) => e.t === "queryError" && e.queryId === "total")).toBe(true);
  expect(composedItems(events)).toEqual([]);
});

test("drops item with literal number", async () => {
  const doc = { ...goodDoc, parts: [...goodDoc.parts, { kind: "item", item: { id: "bad", span: 12, c: { type: "text", md: "Revenue grew 12%" } } }] };
  const { events } = await run({ doc });
  expect(composedItems(events).map((i) => i.id)).not.toContain("bad");
});

test("item arriving before its query is held then emitted", async () => {
  const doc = { title: "T", parts: [goodDoc.parts[1], goodDoc.parts[0]] };
  const { events } = await run({ doc });
  expect(composedItems(events).map((i) => i.id)).toEqual(["k_total"]);
});

test("compose keeps default view when provider throws", async () => {
  const { events } = await run({ fake: { throwError: "ollama unreachable at http://x" } });
  const t = ts(events);
  expect(t).toContain("default");
  expect(events.find((e) => e.t === "error")).toMatchObject({ message: "ollama unreachable at http://x" });
  expect(t.at(-1)).toBe("done");
});

test("ingest failure emits error and done", async () => {
  const events: RenderEvent[] = [];
  await compose({ renderId: "r", input: "/nope/missing.csv", provider: createFakeProvider(goodDoc), cache: new SpecCache(), emit: (e) => events.push(e) });
  expect(ts(events)).toEqual(["start", "error", "done"]);
});

test("second identical render hits cache", async () => {
  const cache = new SpecCache();
  await run({ cache, intent: "Revenue  BY region" });
  const provider = createFakeProvider(goodDoc);
  const { events, ms } = await run({ cache, provider, intent: "revenue by region" });
  console.log(`cache hit render: ${ms.toFixed(0)} ms`);
  expect(provider.calls).toBe(0);
  const done = events.at(-1) as Extract<RenderEvent, { t: "done" }>;
  expect(done.cached).toBe(true);
  expect(composedItems(events)).toHaveLength(3);
  expect(ts(events)).not.toContain("default");
});

test("truncated stream is not cached", async () => {
  const cache = new SpecCache();
  await run({ cache, fake: { truncateAt: 0.6 } });
  const provider = createFakeProvider(goodDoc);
  await run({ cache, provider });
  expect(provider.calls).toBe(1);
});
