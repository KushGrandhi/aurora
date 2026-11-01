import { z } from "zod";
import type { ComponentDef } from "../registry.ts";

export const CalloutSchema = z.object({ type: z.literal("callout"), tone: z.enum(["note", "tip", "warning", "decision"]), title: z.string().optional(), md: z.string() });
export type Callout = z.infer<typeof CalloutSchema>;

export const callout: ComponentDef<Callout> = {
  type: "callout",
  schema: CalloutSchema,
  doc: {
    summary: "A highlighted note, tip, warning or decision with markdown body.",
    example: { type: "callout", tone: "decision", title: "Why DuckDB", md: "Queries run **in process** over the user's files, so nothing is uploaded and large CSVs stay fast." },
    guidance: "Pick it for the one thing a reader must not miss: a decision and its reason, a risk, a tip. One or two per view. `tone`: `decision` for a choice and its reason, `tip` for advice or a helpful insight, `warning` for a risk or a gotcha, `note` for anything else worth flagging. Figures from data use `{query.field|format}` placeholders.",
  },
  placeholders: (c) => [c.md],
};
