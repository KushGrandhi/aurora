import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const JsonSchema = z.object({ type: z.literal("json"), value: z.unknown().optional(), query: IdSchema.optional() });
export type Json = z.infer<typeof JsonSchema>;

export const json: ComponentDef<Json> = {
  type: "json",
  schema: JsonSchema,
  doc: {
    summary: "A collapsible JSON tree, of an authored value or of a query's rows.",
    example: { type: "json", value: { service: "auth", replicas: 3, regions: ["eu", "us"] } },
    guidance: "Use for configs, API responses and nested records. Give `value` for authored JSON or `query` to show rows.",
  },
  dataBound: (c) => (c.query ? [c.query] : []),
};
