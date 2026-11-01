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
    example: { type: "text", md: "**{top.region}** leads with {top.revenue|currency}." },
    guidance: "Authored prose is free text. When a figure comes from an attached dataset, write a placeholder `{query.field|format}` (single-row query) instead of typing the number.",
  },
  dataBound: (c) => ("doc" in c ? [c.doc.query] : []),
  placeholders: (c) => ("md" in c ? [c.md] : []),
};
