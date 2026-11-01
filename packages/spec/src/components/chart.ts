import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const ChartSchema = z.object({
  type: z.literal("chart"),
  query: IdSchema,
  vegaLite: z.record(z.string(), z.unknown()),
});
export type Chart = z.infer<typeof ChartSchema>;

export const chart: ComponentDef<Chart> = {
  type: "chart",
  schema: ChartSchema,
  doc: {
    summary: "A Vega-Lite chart over a query's rows (data is injected; never inline values).",
    example: { type: "chart", query: "byRegion", vegaLite: { title: "Revenue by region", mark: "bar", encoding: { y: { field: "region", type: "nominal", sort: "-x" }, x: { field: "revenue", type: "quantitative" } } } },
    guidance: "Categories go on the y axis as horizontal bars sorted by value. Time on x as a line. Encode fields by the query's column names. One measure per chart; no dual axes.",
  },
  dataBound: (c) => [c.query],
};
