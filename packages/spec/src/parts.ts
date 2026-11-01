import { z } from "zod";
import { ItemSchema, type Spec } from "./spec.ts";

export const QueryPartSchema = z.object({ kind: z.literal("query"), id: z.string().regex(/^[A-Za-z_]\w*$/), sql: z.string().min(1) });
export const ItemPartSchema = z.object({ kind: z.literal("item"), item: ItemSchema });
export const PartSchema = z.discriminatedUnion("kind", [QueryPartSchema, ItemPartSchema]);
export type Part = z.infer<typeof PartSchema>;

export const LlmDocSchema = z.object({
  title: z.string(),
  summary: z.string().optional(),
  parts: z.array(PartSchema),
});
export type LlmDoc = z.infer<typeof LlmDocSchema>;

export function llmDocJsonSchema(): object {
  return z.toJSONSchema(LlmDocSchema);
}

export function partJsonSchema(): object {
  return z.toJSONSchema(PartSchema);
}

export function assemble(doc: { title: string; summary?: string; parts: Part[] }): Spec {
  const spec: Spec = { v: 1, title: doc.title, queries: {}, layout: { type: "grid", cols: 12, items: [] } };
  if (doc.summary !== undefined) spec.summary = doc.summary;
  for (const p of doc.parts) {
    if (p.kind === "query") spec.queries[p.id] = { sql: p.sql };
    else spec.layout.items.push(p.item);
  }
  return spec;
}
