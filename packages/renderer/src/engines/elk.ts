// Adapter for architecture layout. Only this file knows the engine (ELK); the Architecture chunk loads it lazily.
import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Architecture } from "@aurora/spec";

export type Box = { x: number; y: number; w: number; h: number };
export type ArchLayout = {
  width: number;
  height: number;
  nodes: Record<string, Box>;
  groups: Record<string, Box>;
  edges: Record<string, { points: [number, number][]; label?: [number, number] }>;
};

export const edgeKey = (e: { from: string; to: string }, i: number) => `${e.from}->${e.to}#${i}`;
export const nodeSize = (n: { label: string; note?: string }) => ({
  w: Math.round(Math.min(280, Math.max(140, 72 + 7.4 * n.label.length))),
  h: n.note ? 72 : 60,
});

const elk = new ELK();
const ROOT_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.layered.spacing.nodeNodeBetweenLayers": "72",
  "elk.spacing.nodeNode": "32",
  "elk.spacing.edgeLabel": "6",
  "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.json.shapeCoords": "ROOT", // every box and edge point in root coordinates
  "elk.json.edgeCoords": "ROOT",
  "elk.padding": "[top=12,left=12,bottom=12,right=12]",
};

export async function layoutArchitecture(c: Architecture): Promise<ArchLayout> {
  const direction = c.direction === "down" ? "DOWN" : "RIGHT";
  const groups = new Map((c.groups ?? []).map((g) => [g.id, { id: g.id, children: [] as ElkNode[], layoutOptions: { "elk.padding": "[top=36,left=16,bottom=16,right=16]", "elk.direction": direction } } satisfies ElkNode]));
  const root: ElkNode = { id: "__root", layoutOptions: { ...ROOT_OPTIONS, "elk.direction": direction }, children: [], edges: [] };
  const parentOf = (group?: string) => (group && groups.has(group) ? groups.get(group)!.children! : root.children!);
  for (const g of c.groups ?? []) parentOf(g.parent).push(groups.get(g.id)!);
  for (const n of c.nodes) {
    const { w, h } = nodeSize(n);
    parentOf(n.group).push({ id: n.id, width: w, height: h });
  }
  root.edges = c.edges.map((e, i): ElkExtendedEdge => ({
    id: edgeKey(e, i),
    sources: [e.from],
    targets: [e.to],
    ...(e.label ? { labels: [{ text: e.label, width: 12 + e.label.length * 6.4, height: 20 }] } : {}),
  }));

  const out = await elk.layout(root);
  const layout: ArchLayout = { width: out.width ?? 0, height: out.height ?? 0, nodes: {}, groups: {}, edges: {} };
  const visit = (n: ElkNode) => {
    for (const ch of n.children ?? []) {
      const box = { x: ch.x ?? 0, y: ch.y ?? 0, w: ch.width ?? 0, h: ch.height ?? 0 };
      if (groups.has(ch.id)) layout.groups[ch.id] = box;
      else layout.nodes[ch.id] = box;
      visit(ch);
    }
    for (const e of (n.edges ?? []) as ElkExtendedEdge[]) {
      const s = e.sections?.[0];
      if (!s) continue;
      const points: [number, number][] = [[s.startPoint.x, s.startPoint.y], ...(s.bendPoints ?? []).map((p): [number, number] => [p.x, p.y]), [s.endPoint.x, s.endPoint.y]];
      const l = e.labels?.[0];
      layout.edges[e.id] = { points, ...(l ? { label: [(l.x ?? 0) + (l.width ?? 0) / 2, (l.y ?? 0) + (l.height ?? 0) / 2] as [number, number] } : {}) };
    }
  };
  visit(out);
  return layout;
}
