import { expect, test } from "vitest";
import { allComponents, getComponent } from "../src/index.ts";

const NEW = ["diagram", "architecture", "graph", "map", "timeline", "cards", "media", "code", "callout", "steps"];

test("registry has every 2b component", () => {
  const types = allComponents().map((d) => d.type);
  for (const t of NEW) expect(types).toContain(t);
});

test("every example validates and data-bound examples carry fixtures", () => {
  const datasetNames = new Set<string>();
  const queryNames = new Set<string>();
  for (const def of allComponents()) {
    const ex = def.doc.example;
    const r = def.schema.safeParse(ex);
    expect(r.success, `${def.type}: ${r.error?.message}`).toBe(true);
    expect(def.check?.(ex) ?? null, def.type).toBeNull();
    const bound = def.dataBound?.(ex) ?? [];
    if (bound.length) {
      expect(def.doc.fixture, `${def.type} needs a fixture`).toBeDefined();
      for (const q of bound) expect(Object.keys(def.doc.fixture!.queries), def.type).toContain(q);
    }
    const fx = def.doc.fixture;
    if (!fx) continue;
    for (const n of Object.keys(fx.datasets)) {
      expect(n.startsWith(`${def.type}_`), n).toBe(true);
      expect(datasetNames.has(n), `duplicate dataset ${n}`).toBe(false);
      datasetNames.add(n);
    }
    for (const n of Object.keys(fx.queries)) {
      expect(n.startsWith(`${def.type}_`), n).toBe(true);
      expect(queryNames.has(n), `duplicate query ${n}`).toBe(false);
      queryNames.add(n);
    }
  }
});

test("architecture check names missing ids", () => {
  const check = getComponent("architecture")!.check!;
  const base = { type: "architecture", nodes: [{ id: "a", label: "A" }, { id: "b", label: "B" }], edges: [] as unknown[] };
  expect(check({ ...base, edges: [{ from: "a", to: "ghost" }] })).toContain("ghost");
  expect(check({ ...base, nodes: [{ id: "a", label: "A", group: "nogroup" }] })).toContain("nogroup");
  expect(check({ ...base, groups: [{ id: "g1", label: "G1", parent: "g2" }, { id: "g2", label: "G2", parent: "g1" }] })).toContain("cycle");
  expect(check({ ...base, nodes: [{ id: "x", label: "X" }, { id: "x", label: "X again" }] })).toContain("x");
  expect(check({ ...base, edges: [{ from: "a", to: "b" }] })).toBeNull();
});

test("media refs", () => {
  expect(getComponent("media")!.media!({ type: "media", items: [{ src: "/a.png" }, { src: "https://x/y.mp4" }] })).toEqual(["/a.png", "https://x/y.mp4"]);
  expect(getComponent("cards")!.media!({ type: "cards", items: [{ title: "A", image: "/c.png" }, { title: "B" }] })).toEqual(["/c.png"]);
});

test("kpi sparkline is data-bound", () => {
  expect(getComponent("kpi")!.dataBound!({ type: "kpi", query: "q", field: "v", label: "L", sparkline: { query: "s", x: "d", y: "v" } })).toEqual(["q", "s"]);
});

test("graph and timeline need data", () => {
  expect(getComponent("graph")!.check!({ type: "graph" })).not.toBeNull();
  expect(getComponent("timeline")!.check!({ type: "timeline", events: [{ date: "soon", title: "Launch" }] })).toContain("soon");
});

test("query.id is documented as the query's name, not a column", () => {
  for (const t of ["timeline", "cards"]) {
    const g = getComponent(t)!.doc.guidance;
    expect(g, t).toContain("`query.id` is the name of a query in the view");
    expect(g, t).toMatch(/"query":\s*\{\s*"id":/);
  }
});

test("a callout's title can carry placeholders too", () => {
  const def = getComponent("callout")!;
  expect(def.placeholders!({ type: "callout", tone: "warning", title: "{worst.room} is over", md: "It reads {worst.t}." } as never)).toEqual(["{worst.room} is over", "It reads {worst.t}."]);
});
