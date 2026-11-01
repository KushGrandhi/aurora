import { expect, test } from "vitest";
import type { Architecture } from "@aurora/spec";
import { edgeKey, layoutArchitecture } from "../src/engines/elk.ts";

const arch = (direction?: "right" | "down"): Architecture => ({
  type: "architecture",
  direction,
  groups: [{ id: "backend", label: "Backend" }],
  nodes: [
    { id: "web", label: "Web app", kind: "client" },
    { id: "api", label: "API gateway", kind: "gateway", group: "backend" },
    { id: "svc", label: "Orders service", kind: "service", group: "backend", note: "Node" },
    { id: "db", label: "Postgres", kind: "database", group: "backend" },
    { id: "bus", label: "Event bus", kind: "queue" },
  ],
  edges: [
    { from: "web", to: "api" },
    { from: "api", to: "svc" },
    { from: "svc", to: "db" },
    { from: "svc", to: "bus", style: "dashed" },
    { from: "web", to: "bus" },
  ],
});

const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

test("layoutArchitecture gives every node, group and edge a geometry", async () => {
  const c = arch();
  const l = await layoutArchitecture(c);
  expect(Object.keys(l.nodes).sort()).toEqual(["api", "bus", "db", "svc", "web"]);
  expect(Object.keys(l.groups)).toEqual(["backend"]);
  for (const n of c.nodes) if (n.group) expect(inside(l.nodes[n.id], l.groups[n.group]), n.id).toBe(true);
  c.edges.forEach((e, i) => expect(l.edges[edgeKey(e, i)].points.length, edgeKey(e, i)).toBeGreaterThanOrEqual(2));
  expect(l.nodes.svc.h).toBe(72);
  expect(l.nodes.web.h).toBe(60);
  expect(l.nodes.web.w).toBe(140);
  expect(l.width).toBeGreaterThan(0);
  expect(l.height).toBeGreaterThan(0);
});

test("direction down puts the source above the target", async () => {
  const l = await layoutArchitecture(arch("down"));
  expect(l.nodes.web.y + l.nodes.web.h).toBeLessThanOrEqual(l.nodes.api.y);
  const r = await layoutArchitecture(arch("right"));
  expect(r.nodes.web.x + r.nodes.web.w).toBeLessThanOrEqual(r.nodes.api.x);
});

test("layout is deterministic", async () => {
  expect(await layoutArchitecture(arch())).toEqual(await layoutArchitecture(arch()));
});

test("nested groups and long labels", async () => {
  const l = await layoutArchitecture({ type: "architecture", groups: [{ id: "cloud", label: "Cloud" }, { id: "vpc", label: "VPC", parent: "cloud" }],
    nodes: [{ id: "a", label: "A very long service name that keeps going", group: "vpc" }, { id: "b", label: "B", group: "cloud" }], edges: [{ from: "a", to: "b" }] });
  expect(l.nodes.a.w).toBe(280);
  expect(inside(l.groups.vpc, l.groups.cloud)).toBe(true);
  expect(inside(l.nodes.a, l.groups.vpc)).toBe(true);
});
