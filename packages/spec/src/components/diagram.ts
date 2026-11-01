import { z } from "zod";
import type { ComponentDef } from "../registry.ts";

export const DiagramSchema = z.object({ type: z.literal("diagram"), source: z.string().min(1), caption: z.string().optional() });
export type Diagram = z.infer<typeof DiagramSchema>;

export const diagram: ComponentDef<Diagram> = {
  type: "diagram",
  schema: DiagramSchema,
  doc: {
    summary: "A Mermaid diagram: flowcharts, sequence diagrams, state machines, class and ER diagrams, gantt charts.",
    example: { type: "diagram", source: "sequenceDiagram\n  participant U as User\n  participant A as API\n  participant D as Database\n  U->>A: request\n  A->>D: query\n  D-->>A: rows\n  A-->>U: response", caption: "How a request is served" },
    guidance: "Pick it for flows, sequences and states written as Mermaid source. For a polished picture of a system's parts use `architecture` instead; for many nodes from data use `graph`. A Mermaid syntax error comes back as a problem on the item: fix the source and patch it.",
  },
};
