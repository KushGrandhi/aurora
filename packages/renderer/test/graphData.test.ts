import { expect, test } from "vitest";
import type { Graph, QueryResult } from "@aurora/spec";
import { graphData } from "../src/engines/graph.ts";

const res = (rows: Record<string, unknown>[]): QueryResult => ({ columns: [], rows, truncated: false, ms: 0 });

test("graphData from query rows", () => {
  const c: Graph = { type: "graph", query: { edges: "e", nodes: "n" } };
  const d = graphData(c, {
    e: res([{ source: "a", target: "b", weight: 2 }, { source: "b", target: "c", weight: 1 }]),
    n: res([{ id: "a", label: "Ana", group: "x" }, { id: "b", label: "Ben", group: "y", size: 4 }, { id: "c", label: "Cy", group: "x" }]),
  });
  expect(d.nodes).toEqual([{ id: "a", label: "Ana", group: "x" }, { id: "b", label: "Ben", group: "y", size: 4 }, { id: "c", label: "Cy", group: "x" }]);
  expect(d.edges).toEqual([{ source: "a", target: "b", weight: 2 }, { source: "b", target: "c", weight: 1 }]);
});

test("edge-only nodes are added", () => {
  const d = graphData({ type: "graph", edges: [{ from: "a", to: "b" }], nodes: [{ id: "a", label: "Ana" }] }, {});
  expect(d.nodes).toEqual([{ id: "a", label: "Ana" }, { id: "b", label: "b" }]);
  const q = graphData({ type: "graph", query: { edges: "e" } }, { e: res([{ source: 1, target: 2 }]) });
  expect(q.nodes.map((n) => n.id)).toEqual(["1", "2"]);
});

test("duplicate edges sum weight", () => {
  const d = graphData({ type: "graph", edges: [{ from: "a", to: "b", weight: 2 }, { from: "a", to: "b", weight: 3 }, { from: "b", to: "a" }] }, {});
  expect(d.edges).toEqual([{ source: "a", target: "b", weight: 5 }, { source: "b", target: "a", weight: 1 }]);
});
