import { expect, test } from "vitest";
import type { Part } from "@aurora/spec";
import { checkProse, sanitizeVegaLite, validatePart } from "../src/validate.ts";

const ctx = (over: Partial<Parameters<typeof validatePart>[1]> = {}) => ({
  knownQueries: new Set(["t", "top"]), intent: "", queryLimits: new Map<string, number>(), ...over,
});
const text = (md: string): Part => ({ kind: "item", item: { id: "x", span: 12, c: { type: "text", md } } });

test("rejects literal number in text", () => {
  const r = validatePart(text("Revenue grew 12%"), ctx());
  expect(r.ok).toBe(false);
  expect(!r.ok && r.reason).toContain("'12'");
});

test("allows placeholders", () => expect(validatePart(text("Revenue {t.v|currency}"), ctx()).ok).toBe(true));

test("allows numbers from intent", () =>
  expect(validatePart(text("2025 sales"), ctx({ intent: "sales in 2025" })).ok).toBe(true));

test("allows Top N matching LIMIT", () =>
  expect(validatePart(text("Top 10 regions"), ctx({ queryLimits: new Map([["top", 10]]) })).ok).toBe(true));

test("rejects number in kpi label", () => {
  const p: Part = { kind: "item", item: { id: "k", span: 3, c: { type: "kpi", query: "t", field: "v", label: "Revenue 4.2M" } } };
  expect(validatePart(p, ctx()).ok).toBe(false);
});

test("strips vega-lite inline data", () => {
  const out = sanitizeVegaLite({ data: { values: [{ a: 1 }] }, transform: [{ filter: "datum.a > 3" }],
    layer: [{ data: { url: "x" }, mark: "bar", encoding: { y: { datum: 5 } } }], datasets: { d: [] } });
  expect(out.data).toBeUndefined();
  expect(out.datasets).toBeUndefined();
  expect((out.layer as any)[0].data).toBeUndefined();
  expect((out.layer as any)[0].encoding.y.datum).toBeUndefined();
  expect(out.transform).toEqual([{ filter: "datum.a > 3" }]);
  expect(out.width).toBe("container");
});

test("sanitizes chart part", () => {
  const p: Part = { kind: "item", item: { id: "c", span: 6, c: { type: "chart", query: "t", vegaLite: { mark: "bar", data: { values: [1] } } } } };
  const r = validatePart(p, ctx());
  expect(r.ok && r.part.kind === "item" && r.part.item.c.type === "chart" && r.part.item.c.vegaLite.data).toBeUndefined();
});

test("holds item with unknown query", () => {
  const p: Part = { kind: "item", item: { id: "k", span: 3, c: { type: "kpi", query: "later", field: "v", label: "V" } } };
  const r = validatePart(p, ctx());
  expect(!r.ok && r.reason).toBe("pending:later");
});

test("holds text whose placeholder query is unknown", () => {
  const r = validatePart(text("{later.v}"), ctx());
  expect(!r.ok && r.reason).toBe("pending:later");
});

test("checkProse returns null for clean text", () => expect(checkProse("Revenue {t.v}", ctx())).toBeNull());
