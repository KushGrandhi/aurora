import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const ARCH_KINDS = ["service", "database", "queue", "cache", "client", "user", "storage", "function", "gateway", "external", "model"] as const;

export const ArchitectureSchema = z.object({
  type: z.literal("architecture"),
  nodes: z.array(z.object({ id: IdSchema, label: z.string(), kind: z.enum(ARCH_KINDS).optional(), group: IdSchema.optional(), note: z.string().optional() })).min(1).max(200),
  edges: z.array(z.object({ from: IdSchema, to: IdSchema, label: z.string().optional(), style: z.enum(["solid", "dashed", "dotted"]).optional(), flow: z.boolean().optional() })),
  groups: z.array(z.object({ id: IdSchema, label: z.string(), parent: IdSchema.optional() })).optional(),
  direction: z.enum(["right", "down"]).optional(),
});
export type Architecture = z.infer<typeof ArchitectureSchema>;

function checkArchitecture(c: Architecture): string | null {
  const nodes = new Set<string>();
  for (const n of c.nodes) {
    if (nodes.has(n.id)) return `duplicate node id "${n.id}"`;
    nodes.add(n.id);
  }
  const groups = new Map<string, string | undefined>();
  for (const g of c.groups ?? []) {
    if (groups.has(g.id) || nodes.has(g.id)) return `duplicate group id "${g.id}"`;
    groups.set(g.id, g.parent);
  }
  for (const [id, parent] of groups) if (parent !== undefined && !groups.has(parent)) return `group "${id}" has unknown parent "${parent}"`;
  for (const id of groups.keys()) {
    const seen = new Set<string>();
    for (let g: string | undefined = id; g !== undefined; g = groups.get(g)) {
      if (seen.has(g)) return `group parents form a cycle through "${id}"`;
      seen.add(g);
    }
  }
  for (const n of c.nodes) if (n.group !== undefined && !groups.has(n.group)) return `node "${n.id}" is in unknown group "${n.group}"`;
  for (const e of c.edges) {
    if (!nodes.has(e.from)) return `edge from unknown node "${e.from}"`;
    if (!nodes.has(e.to)) return `edge to unknown node "${e.to}"`;
  }
  return null;
}

export const architecture: ComponentDef<Architecture> = {
  type: "architecture",
  schema: ArchitectureSchema,
  doc: {
    summary: "A polished system diagram: services, stores and clients as icon cards in optional groups, with routed, labelled, optionally animated edges.",
    example: {
      type: "architecture",
      direction: "right",
      groups: [{ id: "backend", label: "Backend" }],
      nodes: [
        { id: "web", label: "Web app", kind: "client" },
        { id: "api", label: "API gateway", kind: "gateway", group: "backend" },
        { id: "orders", label: "Orders service", kind: "service", group: "backend", note: "Node + Fastify" },
        { id: "db", label: "Postgres", kind: "database", group: "backend" },
        { id: "events", label: "Event bus", kind: "queue" },
      ],
      edges: [
        { from: "web", to: "api", label: "HTTPS", flow: true },
        { from: "api", to: "orders" },
        { from: "orders", to: "db", label: "SQL" },
        { from: "orders", to: "events", style: "dashed", label: "publish" },
      ],
    },
    guidance: "Pick it when explaining how a system is built: the parts, where they live and what talks to what. Layout is automatic; never give coordinates. Keep labels short, put detail in `note`, use `kind` for the icon and `group` for boundaries (nested via `parent`). `flow: true` animates the main request path. For sequences of calls use a Mermaid `diagram`; for hundreds of nodes from data use `graph`.",
  },
  check: checkArchitecture,
};
