import { z } from "zod";

export const FORMATS = ["number", "integer", "percent", "currency", "date", "compact", "delta", "bytes", "kilobytes", "megabytes", "gigabytes"] as const;
export const FormatSchema = z.enum(FORMATS);
export type Format = z.infer<typeof FormatSchema>;

const Id = z.string().regex(/^[A-Za-z_]\w*$/);

export const QuerySchema = z.object({ sql: z.string().min(1) });
export type Query = z.infer<typeof QuerySchema>;

export const KpiSchema = z.object({
  type: z.literal("kpi"),
  query: Id,
  field: z.string(),
  label: z.string(),
  format: FormatSchema.optional(),
  delta: z.object({ query: Id, field: z.string() }).optional(),
});
export const ChartSchema = z.object({
  type: z.literal("chart"),
  query: Id,
  vegaLite: z.record(z.string(), z.unknown()),
});
export const TableSchema = z.object({
  type: z.literal("table"),
  query: Id,
  title: z.string().optional(),
  columns: z.array(z.string()).optional(),
});
export const TextMdSchema = z.object({ type: z.literal("text"), md: z.string() });
export const TextDocSchema = z.object({ type: z.literal("text"), doc: z.object({ query: Id, field: z.string() }) });

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
