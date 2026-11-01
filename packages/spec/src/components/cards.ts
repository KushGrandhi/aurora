import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const CardsSchema = z.object({
  type: z.literal("cards"),
  items: z.array(z.object({ title: z.string(), subtitle: z.string().optional(), image: z.string().optional(), tags: z.array(z.string()).optional(), fields: z.record(z.string(), z.union([z.string(), z.number()])).optional() })).optional(),
  query: z.object({ id: IdSchema, title: z.string(), subtitle: z.string().optional(), image: z.string().optional(), tags: z.string().optional(), fields: z.array(z.string()).optional() }).optional(),
  layout: z.enum(["grid", "list"]).optional(),
});
export type Cards = z.infer<typeof CardsSchema>;

export const cards: ComponentDef<Cards> = {
  type: "cards",
  schema: CardsSchema,
  doc: {
    summary: "A grid or list of cards with an optional image, subtitle, tags and key/value fields — authored or one card per query row.",
    example: {
      type: "cards",
      items: [
        { title: "genui", subtitle: "Generative UI surface", tags: ["typescript", "react"], fields: { status: "active" } },
        { title: "jarvis", subtitle: "Personal AI layer", tags: ["agents"], fields: { status: "active" } },
        { title: "ideaverse", subtitle: "Notes vault", tags: ["markdown"], fields: { status: "daily" } },
      ],
    },
    guidance: "Pick it for collections of things: projects, people, products, files. Images are absolute local paths or URLs. From data use `query: {id, title, subtitle?, image?, tags?, fields?}` naming columns. Prefer a table when readers compare numbers across many rows.",
  },
  dataBound: (c) => (c.query ? [c.query.id] : []),
  media: (c) => (c.items ?? []).flatMap((i) => (i.image ? [i.image] : [])),
};
