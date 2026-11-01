import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const TextMdSchema = z.object({ type: z.literal("text"), md: z.string() });
export const TextDocSchema = z.object({ type: z.literal("text"), doc: z.object({ query: IdSchema, field: z.string() }) });
export const TextSchema = z.union([TextMdSchema, TextDocSchema]);
export type Text = z.infer<typeof TextSchema>;

export const text: ComponentDef<Text> = {
  type: "text",
  schema: TextSchema,
  doc: {
    summary: "Markdown prose (`md`), or a document read from a query field (`doc`).",
    example: { type: "text", md: "**{text_top.region}** leads with {text_top.revenue|currency}." },
    guidance: "Authored prose is free text. When a figure comes from an attached dataset, write a placeholder `{query.field|format}` (single-row query) instead of typing the number.",
    fixture: {
      datasets: { text_sales: { inline: [{ region: "East", revenue: 4200 }, { region: "West", revenue: 3100 }] } },
      queries: { text_top: { sql: "SELECT region, revenue FROM text_sales ORDER BY revenue DESC LIMIT 1" } },
    },
  },
  dataBound: (c) => ("doc" in c ? [c.doc.query] : []),
  placeholders: (c) => ("md" in c ? [c.md] : []),
};
