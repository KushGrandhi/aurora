import { afterEach, expect, test } from "vitest";
import { openDb, type Db } from "../src/db.ts";
import { ingest } from "../src/ingest.ts";
import { fx } from "./helpers.ts";

let db: Db | undefined;
afterEach(async () => { await db?.close(); db = undefined; });

const count = async (d: Db, t: string) =>
  Number((await d.conn.runAndReadAll(`SELECT count(*) AS n FROM "${t}"`)).getRowObjects()[0].n);

test("ingests csv as data", async () => {
  db = await openDb();
  expect(await ingest(db, fx("sales.csv"))).toEqual(["data"]);
  expect(await count(db, "data")).toBe(240);
});

test("ingests named map", async () => {
  db = await openDb();
  expect(await ingest(db, { orders: fx("sales.csv"), docs: fx("docs") })).toEqual(["orders", "docs"]);
  const rows = (await db.conn.runAndReadAll(`SELECT name, body FROM docs ORDER BY name`)).getRowObjects();
  expect(rows.map((r) => r.name)).toEqual(["a.md", "b.txt"]);
  expect(String(rows[0].body)).toContain("First doc.");
});

test("ingests inline json", async () => {
  db = await openDb();
  await ingest(db, { inline: [{ a: 1, b: "x" }, { a: 2, b: "y" }] });
  expect(await count(db, "data")).toBe(2);
});

test("ingest handles empty and header-only CSV", async () => {
  db = await openDb();
  await ingest(db, { e: fx("empty.csv"), h: fx("header_only.csv") });
  expect(await count(db, "e")).toBe(0);
  expect(await count(db, "h")).toBe(0);
  const cols = (await db.conn.runAndReadAll(`DESCRIBE h`)).getRowObjects().map((r) => r.column_name);
  expect(cols).toEqual(["a", "b", "c"]);
});

test("external access disabled after ingest", async () => {
  db = await openDb();
  await ingest(db, fx("sales.csv"));
  await expect(db.conn.run(`SELECT * FROM read_csv('/etc/hosts')`)).rejects.toThrow();
  await expect(db.conn.run(`SET enable_external_access=true`)).rejects.toThrow();
});

test("rejects bad dataset name", async () => {
  db = await openDb();
  await expect(ingest(db, { "a b": fx("sales.csv") })).rejects.toThrow(/dataset name/);
});
