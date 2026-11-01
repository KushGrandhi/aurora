import { afterEach, expect, test } from "vitest";
import { openDb, type Db } from "../src/db.ts";
import { ingest, lockDb } from "../src/ingest.ts";
import { fingerprint, profileDatasets } from "../src/profile.ts";
import { fx } from "./helpers.ts";

let db: Db | undefined;
afterEach(async () => { await db?.close(); db = undefined; });

test("profiles sales csv", async () => {
  db = await openDb();
  const names = await ingest(db, fx("sales.csv"));
  const p = await profileDatasets(db, names);
  const ds = p.datasets[0];
  expect(ds.name).toBe("data");
  expect(ds.rowCount).toBe(240);
  expect(ds.sample).toHaveLength(5);
  const rev = ds.columns.find((c) => c.name === "revenue")!;
  expect(typeof rev.min).toBe("number");
  expect(rev.max as number).toBeGreaterThan(rev.min as number);
  const region = ds.columns.find((c) => c.name === "region")!;
  expect(region.distinct).toBe(5);
  expect(region.top).toHaveLength(5);
  expect(region.top![0].count).toBe(48);
  expect(ds.columns.find((c) => c.name === "date")!.type).toBe("DATE");
});

test("compresses wide data", async () => {
  db = await openDb();
  const row = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`c${i}`, "x".repeat(100)]));
  await ingest(db, { inline: [row, row] });
  const ds = (await profileDatasets(db, ["data"])).datasets[0];
  expect(ds.compressed).toBe(true);
  expect(ds.columns[0].min).toBeUndefined();
  expect(ds.columns[0].top).toBeUndefined();
  expect(String(ds.sample[0].c0).length).toBeLessThanOrEqual(41);
});

test("profiles awkward column names", async () => {
  db = await openDb();
  await ingest(db, fx("awkward.csv"));
  const ds = (await profileDatasets(db, ["data"])).datasets[0];
  expect(ds.columns.map((c) => c.name)).toEqual(["Order Date", "select", "ünïcode", "amount"]);
  expect(ds.columns.find((c) => c.name === "select")!.top).toBeDefined();
});

test("profiles empty dataset", async () => {
  db = await openDb();
  await ingest(db, fx("header_only.csv"));
  const ds = (await profileDatasets(db, ["data"])).datasets[0];
  expect(ds.rowCount).toBe(0);
  expect(ds.sample).toEqual([]);
});

test("fingerprint ignores values", () => {
  const cols = (t: string) => [{ name: "a", type: t, distinct: 1, nulls: 0 }];
  expect(fingerprint([{ name: "d", columns: cols("INTEGER") }])).toBe(fingerprint([{ name: "d", columns: [{ ...cols("INTEGER")[0], distinct: 99 }] }]));
  expect(fingerprint([{ name: "d", columns: cols("INTEGER") }])).not.toBe(fingerprint([{ name: "d", columns: cols("VARCHAR") }]));
});

test("profiles 1M rows quickly", async () => {
  db = await openDb();
  await db.conn.run(`CREATE TABLE big AS SELECT range i, random() x, (range % 7)::VARCHAR c FROM range(1000000)`);
  await lockDb(db);
  const t0 = performance.now();
  const p = await profileDatasets(db, ["big"]);
  const ms = performance.now() - t0;
  console.log(`profile 1M rows: ${ms.toFixed(0)} ms`);
  expect(p.datasets[0].rowCount).toBe(1_000_000);
  expect(ms).toBeLessThan(2000);
});
