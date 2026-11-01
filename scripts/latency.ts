// Runs compose() with the real model on a few fixtures and prints timings. Usage: npx tsx scripts/latency.ts [model]
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { compose, createOllamaProvider, SpecCache, type DataInput } from "@aurora/engine";
import type { RenderEvent } from "@aurora/spec";

const model = process.argv[2] ?? process.env.AURORA_MODEL ?? "qwen3:8b";
const fx = (n: string) => path.resolve("packages/engine/test/fixtures", n);

async function bigParquet(): Promise<string> {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "aurora-lat-")), "events.parquet");
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  await c.run(`COPY (SELECT TIMESTAMP '2025-01-01' + INTERVAL (range % 525600) MINUTE AS ts,
    ['web','ios','android','api'][1 + range % 4] AS channel, ['US','IN','DE','BR','JP','GB'][1 + (range * 7) % 6] AS country,
    round(random() * 120, 2) AS amount, (random() < 0.03) AS failed FROM range(1000000)) TO '${file}' (FORMAT parquet)`);
  c.closeSync();
  return file;
}

const cases: { name: string; input: DataInput | Record<string, DataInput>; intent?: string }[] = [
  { name: "sales.csv", input: fx("sales.csv"), intent: "monthly revenue by region" },
  { name: "1M events.parquet", input: await bigParquet(), intent: "payment volume and failure rate by channel and country" },
  { name: "docs dir", input: { docs: fx("docs") } },
];

const provider = createOllamaProvider({ url: process.env.AURORA_OLLAMA_URL ?? "http://127.0.0.1:11434", model });
const cache = new SpecCache();
console.log(`model ${model}`);
for (const pass of [1, 2]) {
  for (const c of cases) {
    const events: RenderEvent[] = [];
    await compose({ renderId: c.name, input: c.input, intent: c.intent, provider, cache, emit: (e) => events.push(e) });
    const done = events.find((e) => e.t === "done") as Extract<RenderEvent, { t: "done" }>;
    const items = events.filter((e) => e.t === "item" && !e.item.id.startsWith("d_")).length;
    const errors = events.flatMap((e) => (e.t === "error" || e.t === "queryError" ? [`${e.t}: ${"queryId" in e ? e.queryId + " " : ""}${e.message.slice(0, 120)}`] : []));
    const t = done.timings;
    console.log(`pass ${pass} | ${c.name.padEnd(18)} | items ${items} | cached ${done.cached} | profile ${t.profile} | default ${t.default ?? "-"} | first ${t.firstComponent ?? "-"} | total ${t.total} ms`);
    for (const e of errors) console.log(`    ${e}`);
  }
}
