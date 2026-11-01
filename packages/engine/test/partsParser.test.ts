import { expect, test } from "vitest";
import { createPartsParser } from "../src/partsParser.ts";

const doc = {
  title: "Sales",
  parts: [
    { kind: "query", id: "q1", sql: "SELECT '{' AS b, \"x\" FROM data" },
    { kind: "item", item: { id: "k", span: 3, c: { type: "kpi", query: "q1", field: "b", label: "say \"hi\" }" } } },
    { kind: "query", id: "q2", sql: "SELECT 2" },
  ],
  summary: "Done {q1.b}",
};

function collect() {
  const events: string[] = [];
  const parts: unknown[] = [];
  const metas: unknown[] = [];
  const p = createPartsParser({
    onMeta: (m) => { metas.push(m); events.push("meta"); },
    onPart: (x) => { parts.push(x); events.push("part"); },
  });
  return { p, events, parts, metas };
}

test("emits parts as they close", () => {
  const { p, parts, events } = collect();
  const s = JSON.stringify(doc, null, 1);
  let firstPartAt = -1;
  for (let i = 0; i < s.length; i++) {
    p.push(s[i]);
    if (firstPartAt < 0 && parts.length) firstPartAt = i;
  }
  expect(p.end().complete).toBe(true);
  expect(parts).toEqual(doc.parts);
  expect(firstPartAt).toBeGreaterThan(0);
  expect(firstPartAt).toBeLessThan(s.length / 2);
  expect(events[0]).toBe("meta");
});

test("handles braces and escaped quotes in strings", () => {
  const { p, parts } = collect();
  p.push(JSON.stringify(doc));
  p.end();
  expect((parts[1] as any).item.c.label).toBe('say "hi" }');
  expect((parts[0] as any).sql).toContain("'{'");
});

test("reports truncated stream", () => {
  const { p, parts } = collect();
  const s = JSON.stringify(doc);
  p.push(s.slice(0, s.indexOf('"q2"') + 3));
  expect(p.end().complete).toBe(false);
  expect(parts).toHaveLength(2);
});

test("meta before and after parts", () => {
  const { p, metas } = collect();
  p.push(JSON.stringify(doc));
  p.end();
  expect(metas[0]).toEqual({ title: "Sales" });
  expect(metas.at(-1)).toEqual({ title: "Sales", summary: "Done {q1.b}" });
});

test("ignores anything after the document closes", () => {
  const { p, parts } = collect();
  p.push(JSON.stringify({ title: "T", parts: [{ kind: "query", id: "q", sql: "SELECT 1" }] }) + '\n\nNote: {"parts":[{"kind":"query","id":"x","sql":"SELECT 2"}]}');
  expect(p.end().complete).toBe(true);
  expect(parts).toHaveLength(1);
});

test("recovers from a stray closing brace between parts (seen from Claude)", () => {
  const { p, parts } = collect();
  p.push('{"title":"T","parts":[\n{"kind":"query","id":"a","sql":"SELECT 1"}},\n{"kind":"query","id":"b","sql":"SELECT 2"}\n],"summary":"S"}');
  expect(p.end().complete).toBe(true);
  expect(parts.map((x: any) => x.id)).toEqual(["a", "b"]);
});

test("recovers from a missing closing brace inside a part (seen from Claude)", () => {
  const { p, parts } = collect();
  const doc = '{"title":"T","parts":[\n' +
    '{"kind":"item","item":{"id":"c1","span":12,"c":{"type":"chart","query":"q","vegaLite":{"mark":"circle","encoding":{"color":{"field":"s","scale":{"domain":["A"]}}}}}},\n' +
    '{"kind":"item","item":{"id":"t1","span":12,"c":{"type":"table","query":"q"}}}\n],"summary":"S"}';
  for (const ch of doc) p.push(ch); // streamed one char at a time
  expect(p.end().complete).toBe(true);
  expect(parts.map((x: any) => x.item.id)).toEqual(["c1", "t1"]);
  expect((parts[0] as any).item.c.vegaLite.encoding.color.scale.domain).toEqual(["A"]);
});
