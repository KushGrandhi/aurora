import { expect, test } from "vitest";
import type { Part } from "@aurora/spec";
import { validatePart } from "../src/validate.ts";

const kpi = (field: string, label: string, format?: string): Part =>
  ({ kind: "item", item: { id: "k", span: 3, c: { type: "kpi", query: "q", field, label, ...(format ? { format } : {}) } } }) as Part;
const ctx = (sql: string) => ({ knownQueries: new Set(["q"]), intent: "", queryLimits: new Map<string, number>(), querySql: new Map([["q", sql]]) });
const fmt = (r: ReturnType<typeof validatePart>) => (r.ok && r.part.kind === "item" && r.part.item.c.type === "kpi" ? r.part.item.c.format : "rejected");

test("currency on a size column becomes the size unit, inferred through the SQL alias", () => {
  expect(fmt(validatePart(kpi("v", "Total source size", "currency"), ctx("SELECT sum(source_mb) AS v FROM data")))).toBe("megabytes");
});
test("currency without any money signal becomes number", () => {
  expect(fmt(validatePart(kpi("n", "Projects", "currency"), ctx("SELECT count(*) AS n FROM data")))).toBe("integer");
});
test("currency on money stays", () => {
  expect(fmt(validatePart(kpi("v", "Revenue", "currency"), ctx("SELECT sum(revenue) AS v FROM data")))).toBe("currency");
});
test("missing format gets inferred", () => {
  expect(fmt(validatePart(kpi("total_deps_mb", "Dependencies"), ctx("SELECT sum(deps_mb) AS total_deps_mb FROM data")))).toBe("megabytes");
});
test("placeholder formats in prose are corrected too", () => {
  const p = { kind: "item", item: { id: "t", span: 12, c: { type: "text", md: "Total {q.v|currency}" } } } as Part;
  const r = validatePart(p, ctx("SELECT sum(source_mb) AS v FROM data"));
  expect(r.ok && r.part.kind === "item" && "md" in r.part.item.c && r.part.item.c.md).toBe("Total {q.v|megabytes}");
});
