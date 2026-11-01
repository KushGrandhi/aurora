import { expect, test } from "vitest";
import { buildPrompt, buildRepairPrompt } from "../src/prompt.ts";
import type { Profile } from "../src/profile.ts";

const prof = (name: string, sample: Record<string, unknown>[] = [{ a: 1 }]): Profile => ({
  fingerprint: "f",
  datasets: [{ name, rowCount: 10, compressed: false, sample, columns: [{ name: "a", type: "INTEGER", distinct: 3, nulls: 0, min: 1, max: 9 }] }],
});

test("system prompt is stable across profiles", () => {
  expect(buildPrompt(prof("x"), "a").system).toBe(buildPrompt(prof("y"), "b").system);
});

test("user prompt contains profile and intent", () => {
  const { user } = buildPrompt(prof("orders"), "monthly revenue");
  expect(user).toContain('"name":"orders"');
  expect(user).toContain("monthly revenue");
});

test("user prompt defaults intent", () => {
  expect(buildPrompt(prof("x"), undefined).user).toContain("Give the best overview of this data.");
});

test("user prompt keeps at most 5 sample rows", () => {
  const sample = Array.from({ length: 8 }, (_, i) => ({ a: 1000 + i }));
  const { user } = buildPrompt(prof("x", sample), "i");
  expect(user).toContain("1004");
  expect(user).not.toContain("1005");
});

test("system prompt teaches placeholders and query-first ordering", () => {
  const { system } = buildPrompt(prof("x"), "i");
  expect(system).toContain("{queryId.field|format}");
  expect(system).toMatch(/before the items that use/i);
});

test("repair prompt includes reason and part", () => {
  const r = buildRepairPrompt({ kind: "query", id: "q", sql: "SELECT nope" }, "column nope not found", prof("x"));
  expect(r.user).toContain("column nope not found");
  expect(r.user).toContain("SELECT nope");
});
