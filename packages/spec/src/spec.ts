import { z } from "zod";
import { IdSchema as Id, QuerySchema } from "./base.ts";
import { KpiSchema } from "./components/kpi.ts";
import { ChartSchema } from "./components/chart.ts";
import { TableSchema } from "./components/table.ts";
import { TextMdSchema, TextDocSchema } from "./components/text.ts";

export { FORMATS, FormatSchema, QuerySchema, type Format, type Query } from "./base.ts";

export const ComponentSchema = z.union([KpiSchema, ChartSchema, TableSchema, TextMdSchema, TextDocSchema]);
export type Component = z.infer<typeof ComponentSchema>;

export const ItemSchema = z.object({
  id: Id,
  span: z.number().int().min(1).max(12),
  c: ComponentSchema,
});
export type Item = z.infer<typeof ItemSchema>;

export const SpecSchema = z.object({
  v: z.literal(1),
  title: z.string(),
  summary: z.string().optional(),
  queries: z.record(z.string(), QuerySchema),
  layout: z.object({ type: z.literal("grid"), cols: z.literal(12), items: z.array(ItemSchema) }),
});
export type Spec = z.infer<typeof SpecSchema>;

/** Query ids an item's component reads from. */
export function itemQueries(item: Item): string[] {
  const c = item.c;
  if ("doc" in c) return [c.doc.query];
  if ("md" in c) return [];
  const ids = [c.query];
  if (c.type === "kpi" && c.delta) ids.push(c.delta.query);
  return ids;
}
