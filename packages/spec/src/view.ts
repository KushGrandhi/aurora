import { z } from "zod";
import { IdSchema, QuerySchema } from "./base.ts";
import { ParamSchema } from "./params.ts";
import type { Spec } from "./spec.ts";

export const DataInputJsonSchema = z.union([
  z.string(),
  z.object({ path: z.string(), format: z.string().optional() }),
  z.object({ inline: z.array(z.unknown()) }),
]);
export type DataInputJson = z.infer<typeof DataInputJsonSchema>;

export const ViewItemSchema = z.object({
  id: IdSchema,
  span: z.number().int().min(1).max(12).optional(),
  title: z.string().optional(),
  c: z.looseObject({ type: z.string().min(1) }), // components are checked by the registry
});
export type ViewItem = z.infer<typeof ViewItemSchema>;

export const SectionSchema = z.object({
  id: IdSchema,
  title: z.string().optional(),
  layout: z.enum(["grid", "tabs"]),
  items: z.array(ViewItemSchema),
});
export type Section = z.infer<typeof SectionSchema>;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour like #c2410c");
/** A view's own colours: an accent and up to eight series colours, chosen to fit its subject. Both themes use them. */
export const PaletteSchema = z.object({ accent: Hex.optional(), series: z.array(Hex).min(1).max(8).optional() });
export type Palette = z.infer<typeof PaletteSchema>;

export const ViewSchema = z.object({
  v: z.literal(2),
  id: IdSchema,
  title: z.string(),
  summary: z.string().optional(),
  datasets: z.record(IdSchema, DataInputJsonSchema).optional(),
  queries: z.record(IdSchema, QuerySchema).optional(),
  params: z.record(IdSchema, ParamSchema).optional(),
  palette: PaletteSchema.optional(),
  sections: z.array(SectionSchema),
});
export type View = z.infer<typeof ViewSchema>;

export function fromPlan1(spec: Spec, id: string): View {
  const view: View = { v: 2, id, title: spec.title, queries: { ...spec.queries }, sections: [{ id: "main", layout: "grid", items: spec.layout.items.map((i) => ({ ...i })) }] };
  if (spec.summary !== undefined) view.summary = spec.summary;
  return view;
}
