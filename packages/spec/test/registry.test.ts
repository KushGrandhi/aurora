import { expect, test } from "vitest";
import { z } from "zod";
import { allComponents, getComponent, registerComponent } from "../src/index.ts";

test("registry has the migrated components and json", () => {
  const types = allComponents().map((d) => d.type);
  for (const t of ["kpi", "chart", "table", "text", "json"]) expect(types).toContain(t);
});

test("registering a duplicate type throws", () => {
  expect(() => registerComponent({ type: "kpi", schema: z.object({ type: z.literal("kpi") }), doc: { summary: "", example: { type: "kpi" }, guidance: "" } })).toThrow(/kpi/);
});

test("dataBound reports queries", () => {
  const kpi = getComponent("kpi")!;
  expect(kpi.dataBound!({ type: "kpi", query: "q", field: "v", label: "L", delta: { query: "q2", field: "d" } })).toEqual(["q", "q2"]);
  expect(getComponent("text")!.dataBound!({ type: "text", md: "hi" })).toEqual([]);
  expect(getComponent("text")!.dataBound!({ type: "text", doc: { query: "q", field: "md" } })).toEqual(["q"]);
  expect(getComponent("json")!.dataBound!({ type: "json", query: "q" })).toEqual(["q"]);
  expect(getComponent("json")!.dataBound!({ type: "json", value: { a: 1 } })).toEqual([]);
});

test("text exposes prose for placeholder checks", () => {
  expect(getComponent("text")!.placeholders!({ type: "text", md: "a {q.v}" })).toEqual(["a {q.v}"]);
});

test("every component's doc example validates against its own schema", () => {
  for (const def of allComponents()) {
    const r = def.schema.safeParse(def.doc.example);
    expect(r.success, `${def.type}: ${r.error?.message}`).toBe(true);
    expect(def.doc.summary.length).toBeGreaterThan(10);
  }
});
