import { afterEach, beforeEach, expect, test } from "vitest";
import { openDb, type Db } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import { explainQuery, guardSql, quoteIdent, runQuery } from "../src/sql.ts";
import { fx } from "./helpers.ts";

let db: Db;
beforeEach(async () => { db = await openDb(); await ingest(db, fx("sales.csv")); });
afterEach(async () => { await db.close(); });

test("guard allows select and with", () => {
  expect(guardSql("SELECT 1;").ok).toBe(true);
  expect(guardSql("with x as (select 1) select * from x").ok).toBe(true);
});

test.each([
  "COPY data TO 'x'",
  "SELECT 1; DROP TABLE data",
  "ATTACH 'x'",
  "SELECT * FROM read_csv('/etc/passwd')",
  "INSTALL httpfs",
  "SELECT * FROM glob('*')",
])("guard rejects %s", (sql) => {
  expect(guardSql(sql).ok).toBe(false);
});

test("guard ignores keywords inside string literals", () => {
  expect(guardSql("SELECT 'copy that; drop' AS s").ok).toBe(true);
});

test("quoteIdent doubles quotes", () => expect(quoteIdent('a"b')).toBe('"a""b"'));

test("runQuery truncates at limit", async () => {
  const r = await runQuery(db, "SELECT * FROM data", {}, 5);
  expect(r.rows).toHaveLength(5);
  expect(r.truncated).toBe(true);
  expect(r.columns.map((c) => c.name)).toContain("revenue");
});

test("runQuery binds params", async () => {
  const r = await runQuery(db, "SELECT count(*) AS n FROM data WHERE region = $region", { region: "APAC" });
  expect(r.rows[0].n).toBe(48);
  expect(r.truncated).toBe(false);
});

test("runQuery rejects guarded sql", async () => {
  await expect(runQuery(db, "DROP TABLE data")).rejects.toThrow(/not allowed|only SELECT/);
});

test("serializes duckdb types", async () => {
  const r = await runQuery(db, `SELECT 9007199254740993::HUGEINT a, 3::BIGINT b, 1.5::DECIMAL(4,2) c,
    DATE '2026-01-02' d, TIMESTAMP '2026-01-02 03:04:05' e, [1,2] f, {'k': 1} g`);
  expect(r.rows[0]).toEqual({ a: "9007199254740993", b: 3, c: 1.5, d: "2026-01-02",
    e: "2026-01-02T03:04:05.000Z", f: [1, 2], g: { k: 1 } });
  expect(() => JSON.stringify(r)).not.toThrow();
});

test("explainQuery reports bad column", async () => {
  const bad = await explainQuery(db, "SELECT nope FROM data");
  expect(bad.ok).toBe(false);
  expect(await explainQuery(db, "SELECT region FROM data")).toEqual({ ok: true });
});

test("explainQuery binds params", async () => {
  expect(await explainQuery(db, "SELECT sum(revenue) AS v FROM data WHERE region = $region", { region: "East", unused: 1 })).toEqual({ ok: true });
});
