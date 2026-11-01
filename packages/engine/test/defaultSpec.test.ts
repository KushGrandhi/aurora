import { expect, test } from "vitest";
import { SpecSchema, type Spec } from "@genui/spec";
import { openDb } from "../src/db.ts";
import { ingest, type DataInput } from "../src/ingest.ts";
import { profileDatasets, type Profile } from "../src/profile.ts";
import { defaultSpec } from "../src/defaultSpec.ts";
import { runQuery } from "../src/sql.ts";
import { fx } from "./helpers.ts";

async function profileFixture(input: DataInput | Record<string, DataInput>): Promise<Profile> {
  const db = await openDb();
  try { return await profileDatasets(db, await ingest(db, input)); } finally { await db.close(); }
}
const types = (s: Spec) => s.layout.items.map((i) => i.c.type);
const marks = (s: Spec) => s.layout.items.flatMap((i) => (i.c.type === "chart" ? [JSON.stringify(i.c.vegaLite.mark)] : []));

test("default spec for time series", async () => {
  const s = defaultSpec(await profileFixture(fx("sales.csv")));
  expect(types(s)).toContain("kpi");
  expect(marks(s).some((m) => m.includes("line"))).toBe(true);
  expect(types(s)).toContain("table");
  expect(s.layout.items.every((i) => i.id.startsWith("d_"))).toBe(true);
  expect(s.title).toBe("Overview of data");
});

test("default spec for categorical", async () => {
  const s = defaultSpec(await profileFixture({ inline: [{ k: "a", n: 1 }, { k: "b", n: 2 }, { k: "a", n: 3 }] }));
  expect(marks(s).some((m) => m.includes("bar"))).toBe(true);
});

test("default spec for empty dataset", async () => {
  const s = defaultSpec(await profileFixture(fx("header_only.csv")));
  expect(s.layout.items).toHaveLength(1);
  expect(s.layout.items[0].c).toMatchObject({ type: "text" });
  expect((s.layout.items[0].c as { md: string }).md).toContain("No rows");
});

test("default spec quotes identifiers", async () => {
  const s = defaultSpec(await profileFixture(fx("awkward.csv")));
  expect(Object.values(s.queries).some((q) => q.sql.includes('"Order Date"'))).toBe(true);
});

test("default spec for docs dataset", async () => {
  const s = defaultSpec(await profileFixture({ docs: fx("docs") }));
  const docs = s.layout.items.filter((i) => i.c.type === "text" && "doc" in i.c);
  expect(docs).toHaveLength(2);
});

test("default spec validates and its queries run", async () => {
  for (const input of [fx("sales.csv"), fx("awkward.csv"), fx("nested.json"), { orders: fx("sales.csv"), docs: fx("docs") }] as const) {
    const db = await openDb();
    const p = await profileDatasets(db, await ingest(db, input as DataInput));
    const s = defaultSpec(p);
    expect(SpecSchema.safeParse(s).success).toBe(true);
    for (const q of Object.values(s.queries)) await runQuery(db, q.sql);
    await db.close();
  }
});
