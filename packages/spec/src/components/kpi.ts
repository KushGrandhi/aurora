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
  sparkline: z.object({ query: IdSchema, x: z.string(), y: z.string() }).optional(),
});
export type Kpi = z.infer<typeof KpiSchema>;

export const kpi: ComponentDef<Kpi> = {
  type: "kpi",
  schema: KpiSchema,
  doc: {
    summary: "A headline number tile read from one field of a single-row query, with an optional delta.",
    example: { type: "kpi", query: "kpi_total", field: "revenue", label: "Total revenue", format: "currency", sparkline: { query: "kpi_trend", x: "month", y: "revenue" } },
    guidance: "The query must return exactly one row (aggregate, or ORDER BY … LIMIT 1). Labels name the measure in words; never put digits in them. Use span 3 or 4 in a row of tiles. `sparkline` draws a small trend under the value from another query's x/y columns (one row per point).",
    fixture: {
      datasets: {
        kpi_sales: {
          inline: [
            { month: "2026-01-01", revenue: 1200 },
            { month: "2026-02-01", revenue: 1500 },
            { month: "2026-03-01", revenue: 1350 },
            { month: "2026-04-01", revenue: 1800 },
          ],
        },
      },
      queries: {
        kpi_total: { sql: "SELECT sum(revenue) AS revenue FROM kpi_sales" },
        kpi_trend: { sql: "SELECT month, revenue FROM kpi_sales ORDER BY month" },
      },
    },
  },
  dataBound: (c) => [c.query, ...(c.delta ? [c.delta.query] : []), ...(c.sparkline ? [c.sparkline.query] : [])],
};
