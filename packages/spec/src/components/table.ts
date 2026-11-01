import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const TableSchema = z.object({
  type: z.literal("table"),
  query: IdSchema,
  title: z.string().optional(),
  columns: z.array(z.string()).optional(),
});
export type Table = z.infer<typeof TableSchema>;

export const table: ComponentDef<Table> = {
  type: "table",
  schema: TableSchema,
  doc: {
    summary: "A sortable, virtualized table of a query's rows.",
    example: { type: "table", query: "orders", title: "Largest orders", columns: ["customer", "amount"] },
    guidance: "Give it a title. Pick the columns worth reading; omit columns to show all. Use span 12.",
  },
  dataBound: (c) => [c.query],
};
