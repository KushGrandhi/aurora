import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const GraphSchema = z.object({
  type: z.literal("graph"),
  nodes: z.array(z.object({ id: z.string(), label: z.string().optional(), group: z.string().optional(), size: z.number().optional() })).optional(),
  edges: z.array(z.object({ from: z.string(), to: z.string(), weight: z.number().optional() })).optional(),
  query: z.object({ edges: IdSchema, nodes: IdSchema.optional() }).optional(),
  layout: z.enum(["force", "circle", "grid"]).optional(),
});
export type Graph = z.infer<typeof GraphSchema>;

export const graph: ComponentDef<Graph> = {
  type: "graph",
  schema: GraphSchema,
  doc: {
    summary: "An interactive network graph (zoom, pan, hover neighbourhoods) from authored nodes and edges or from queries.",
    example: { type: "graph", query: { edges: "graph_links", nodes: "graph_people" }, layout: "force" },
    guidance: "Pick it for relationships with many nodes, especially from data: dependencies, call graphs, social links. The edges query returns `source, target[, weight]`; the optional nodes query returns `id[, label, group, size]`. Nodes named only in edges are added automatically. For a handful of hand-placed parts use `architecture`.",
    fixture: {
      datasets: {
        graph_edge_rows: { inline: [{ source: "ana", target: "ben", weight: 3 }, { source: "ana", target: "cy", weight: 1 }, { source: "ben", target: "dee", weight: 2 }, { source: "cy", target: "dee", weight: 1 }, { source: "dee", target: "eli", weight: 4 }] },
        graph_node_rows: { inline: [{ id: "ana", label: "Ana", group: "design" }, { id: "ben", label: "Ben", group: "design" }, { id: "cy", label: "Cy", group: "eng" }, { id: "dee", label: "Dee", group: "eng" }, { id: "eli", label: "Eli", group: "ops" }] },
      },
      queries: {
        graph_links: { sql: "SELECT source, target, weight FROM graph_edge_rows" },
        graph_people: { sql: "SELECT id, label, \"group\" FROM graph_node_rows" },
      },
    },
  },
  dataBound: (c) => (c.query ? [c.query.edges, ...(c.query.nodes ? [c.query.nodes] : [])] : []),
  check: (c) => (c.edges || c.query ? null : "graph needs `edges` or `query`"),
};
