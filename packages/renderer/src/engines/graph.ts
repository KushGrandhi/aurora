// Adapter for network graphs. Only this file knows the engine (Cytoscape); the Graph chunk loads it lazily.
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { forceCenter, forceLink, forceManyBody, forceSimulation, type SimulationNodeDatum } from "d3-force";
import type { Graph, QueryResult } from "@genui/spec";
import type { Theme } from "../registry.tsx";

export type GNode = { id: string; label: string; group?: string; size?: number };
export type GEdge = { source: string; target: string; weight?: number };
export type GraphData = { nodes: GNode[]; edges: GEdge[] };

const str = (v: unknown) => (v === null || v === undefined ? undefined : String(v));
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : undefined);

/** Nodes and edges from authored data or query rows. Nodes named only by edges are added; repeated edges merge, weights summed. */
export function graphData(c: Graph, results: Record<string, QueryResult>): GraphData {
  const rawNodes: GNode[] = c.query
    ? (c.query.nodes ? results[c.query.nodes]?.rows ?? [] : []).flatMap((r) => {
        const id = str(r.id);
        if (id === undefined) return [];
        const n: GNode = { id, label: str(r.label) ?? id };
        const group = str(r.group);
        const size = num(r.size);
        if (group !== undefined) n.group = group;
        if (size !== undefined) n.size = size;
        return [n];
      })
    : (c.nodes ?? []).map((n) => ({ ...n, label: n.label ?? n.id }));
  const rawEdges: { source?: string; target?: string; weight?: number }[] = c.query
    ? (results[c.query.edges]?.rows ?? []).map((r) => ({ source: str(r.source), target: str(r.target), weight: num(r.weight) }))
    : (c.edges ?? []).map((e) => ({ source: e.from, target: e.to, weight: e.weight }));

  const nodes = new Map<string, GNode>();
  for (const n of rawNodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
  const edges = new Map<string, GEdge>();
  for (const e of rawEdges) {
    if (e.source === undefined || e.target === undefined) continue;
    for (const id of [e.source, e.target]) if (!nodes.has(id)) nodes.set(id, { id, label: id });
    const k = `${e.source}\u0000${e.target}`;
    const prev = edges.get(k);
    edges.set(k, { source: e.source, target: e.target, weight: (prev?.weight ?? 0) + (e.weight ?? 1) });
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

export type GraphOpts = { layout: "force" | "circle" | "grid"; theme: Theme; reduced: boolean; onReady(): void; onPositions(p: Record<string, { x: number; y: number }>): void };
export type GraphEngine = { mount(el: HTMLElement, data: GraphData, opts: GraphOpts): { update(data: GraphData): void; destroy(): void } };

const MAX_GROUPS = 8;
const COSE_UNTIL = 300; // above this, cose is too slow on the main thread: positions come from a Barnes–Hut force simulation

/** Force-directed positions for large graphs (d3-force, Barnes–Hut), fixed seed so the same data lays out the same. */
function forcePositions(data: GraphData): Record<string, { x: number; y: number }> {
  let seed = 1;
  const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const nodes: (SimulationNodeDatum & { id: string })[] = data.nodes.map((n) => ({ id: n.id }));
  const sim = forceSimulation(nodes)
    .randomSource(random)
    .force("charge", forceManyBody().strength(-30).theta(0.9))
    .force("link", forceLink(data.edges.map((e) => ({ source: e.source, target: e.target }))).id((n) => (n as { id: string }).id).distance(30).strength(0.6))
    .force("center", forceCenter(0, 0))
    .stop();
  sim.tick(Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay())));
  return Object.fromEntries(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}
const LABELS_UNTIL = 80; // above this many nodes, labels show on hover only

function elements(data: GraphData, theme: Theme): ElementDefinition[] {
  const groups = [...new Set(data.nodes.map((n) => n.group).filter((g): g is string => g !== undefined))];
  const sizes = data.nodes.map((n) => n.size).filter((s): s is number => s !== undefined);
  const [s0, s1] = [Math.min(...sizes), Math.max(...sizes)];
  const weights = data.edges.map((e) => e.weight ?? 1);
  const [w0, w1] = [Math.min(...weights), Math.max(...weights)];
  const scale = (v: number, a: number, b: number, lo: number, hi: number) => (b > a ? lo + ((v - a) / (b - a)) * (hi - lo) : (lo + hi) / 2);
  const color = (g?: string) => {
    const i = g === undefined ? -1 : groups.indexOf(g);
    return i >= 0 && i < MAX_GROUPS ? theme.categorical[i] : theme.muted;
  };
  return [
    ...data.nodes.map((n) => ({ group: "nodes" as const, data: { id: n.id, label: n.label, color: color(n.group), size: n.size === undefined ? 14 : scale(n.size, s0, s1, 8, 28) } })),
    ...data.edges.map((e) => ({ group: "edges" as const, data: { id: `${e.source}\u0000${e.target}`, source: e.source, target: e.target, width: scale(e.weight ?? 1, w0, w1, 1, 4) } })),
  ];
}

/** Category order matches `elements`: first appearance, "Other" after eight. */
export function groupLegend(data: GraphData, theme: Theme): { label: string; color: string }[] {
  const groups = [...new Set(data.nodes.map((n) => n.group).filter((g): g is string => g !== undefined))];
  const shown = groups.slice(0, MAX_GROUPS).map((g, i) => ({ label: g, color: theme.categorical[i] }));
  return groups.length > MAX_GROUPS ? [...shown, { label: "Other", color: theme.muted }] : shown;
}

export const cytoscapeEngine: GraphEngine = {
  mount(el, data, opts) {
    const { theme } = opts;
    const many = data.nodes.length > LABELS_UNTIL;
    const cy: Core = cytoscape({
      container: el,
      elements: elements(data, theme),
      minZoom: 0.1,
      maxZoom: 4,
      wheelSensitivity: 0.25,
      style: [
        { selector: "node", style: { "background-color": "data(color)", width: "data(size)", height: "data(size)", "border-width": 2, "border-color": theme.surface, label: many ? "" : "data(label)", color: theme.ink2, "font-size": 10, "font-family": "Inter, system-ui, sans-serif", "text-valign": "bottom", "text-margin-y": 4, "min-zoomed-font-size": 7 } },
        { selector: "edge", style: { width: "data(width)", "line-color": theme.axis, "curve-style": "haystack", opacity: 0.8 } },
        { selector: ".faded", style: { opacity: 0.12 } },
        { selector: "node.focus", style: { label: "data(label)", color: theme.ink, "z-index": 10 } },
      ],
      layout: { name: "preset" },
    });
    const positions = () => {
      const p: Record<string, { x: number; y: number }> = {};
      cy.nodes().forEach((n) => { p[n.id()] = { ...n.position() }; });
      opts.onPositions(p);
    };
    const small = data.nodes.length <= COSE_UNTIL;
    const animate = small && !opts.reduced;
    const name = opts.layout === "circle" ? "circle" : opts.layout === "grid" ? "grid" : small ? "cose" : "preset";
    const extra = name === "cose"
      ? { randomize: true, nodeRepulsion: () => 6000, idealEdgeLength: () => 48 }
      : name === "preset" ? { positions: forcePositions(data) } : {};
    const layout = cy.layout({ name, animate, animationDuration: 600, fit: true, padding: 24, ...extra } as cytoscape.LayoutOptions);
    layout.one("layoutstop", () => { positions(); opts.onReady(); });
    layout.run();

    cy.on("mouseover", "node", (e) => {
      const hood = e.target.closedNeighborhood();
      cy.elements().not(hood).addClass("faded");
      hood.nodes().addClass("focus");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("faded focus"));

    return {
      update(next) {
        const want = elements(next, theme);
        const ids = new Set(want.map((w) => w.data.id!));
        cy.elements().filter((e) => !ids.has(e.id())).remove();
        const added = want.filter((w) => cy.getElementById(w.data.id!).empty());
        for (const w of want) {
          const cur = cy.getElementById(w.data.id!);
          if (cur.nonempty()) cur.data(w.data);
        }
        // New nodes start beside a neighbour that already has a place; nothing else moves.
        const placed = added.filter((w) => w.group === "nodes").map((w) => {
          const nb = next.edges.find((e) => e.source === w.data.id || e.target === w.data.id);
          const other = nb ? cy.getElementById(nb.source === w.data.id ? nb.target : nb.source) : undefined;
          const at = other?.nonempty() ? other.position() : { x: cy.width() / 2, y: cy.height() / 2 };
          return { ...w, position: { x: at.x + 30 + Math.random() * 20, y: at.y + 30 + Math.random() * 20 } };
        });
        cy.add([...placed, ...added.filter((w) => w.group === "edges")]);
        positions();
      },
      destroy() {
        cy.destroy();
      },
    };
  },
};
