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
    example: { type: "table", query: "table_orders", title: "Largest orders", columns: ["customer", "amount"] },
    guidance: "Give it a title. Pick the columns worth reading; omit columns to show all. Use span 12.",
    fixture: {
      datasets: { table_order_rows: { inline: [{ customer: "Acme", amount: 980 }, { customer: "Globex", amount: 760 }, { customer: "Initech", amount: 540 }] } },
      queries: { table_orders: { sql: "SELECT customer, amount FROM table_order_rows ORDER BY amount DESC" } },
    },
  },
  dataBound: (c) => [c.query],
};
