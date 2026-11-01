import { z } from "zod";
import { FormatSchema, IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const KpiSchema = z.object({
  type: z.literal("kpi"),
  query: IdSchema,
  field: z.string(),
  label: z.string(),
  format: FormatSchema.optional(),
  delta: z.object({ query: IdSchema, field: z.string() }).optional(),
});
export type Kpi = z.infer<typeof KpiSchema>;

export const kpi: ComponentDef<Kpi> = {
  type: "kpi",
  schema: KpiSchema,
  doc: {
    summary: "A headline number tile read from one field of a single-row query, with an optional delta.",
    example: { type: "kpi", query: "total", field: "revenue", label: "Total revenue", format: "currency" },
    guidance: "The query must return exactly one row (aggregate, or ORDER BY … LIMIT 1). Labels name the measure in words; never put digits in them. Use span 3 or 4 in a row of tiles.",
  },
  dataBound: (c) => (c.delta ? [c.query, c.delta.query] : [c.query]),
};
