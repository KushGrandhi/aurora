import { expect, test } from "vitest";
import { assemble, SpecSchema, llmDocJsonSchema } from "../src/index.ts";

test("assemble builds spec from parts in order", () => {
  const spec = assemble({ title: "T", parts: [
    { kind: "query", id: "q1", sql: "SELECT 1 AS v" },
    { kind: "item", item: { id: "k1", span: 3, c: { type: "kpi", query: "q1", field: "v", label: "V" } } },
  ]});
  expect(spec).toEqual({ v: 1, title: "T", queries: { q1: { sql: "SELECT 1 AS v" } },
    layout: { type: "grid", cols: 12, items: [{ id: "k1", span: 3, c: { type: "kpi", query: "q1", field: "v", label: "V" } }] } });
});

test("SpecSchema rejects unknown component type", () => {
  const bad = { v: 1, title: "T", queries: {}, layout: { type: "grid", cols: 12,
    items: [{ id: "x", span: 3, c: { type: "pie3d", query: "q" } }] } };
  expect(SpecSchema.safeParse(bad).success).toBe(false);
});

test("llmDocJsonSchema is a JSON schema object with parts array", () => {
  const s = llmDocJsonSchema() as any;
  expect(s.properties.parts.type).toBe("array");
});
