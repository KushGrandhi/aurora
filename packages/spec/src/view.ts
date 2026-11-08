import { z } from "zod";
import { IdSchema, QuerySchema } from "./base.ts";
import { ParamSchema } from "./params.ts";
import type { Spec } from "./spec.ts";
import { stageProblem } from "./stage.ts";
import { FontsSchema } from "./fonts.ts";

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
  /**
   * In a `story` section, what this step does to the pinned visual when it scrolls into view: `focus` lights a value up
   * across the view (linked focus), `state` reaches a design as `aurora.story.state` (the kit's `useStory`).
   */
  story: z.object({ focus: z.string().max(200).optional(), state: z.unknown().optional() }).optional(),
});
export type ViewItem = z.infer<typeof ViewItemSchema>;

export const SectionSchema = z.object({
  id: IdSchema,
  title: z.string().optional(),
  // story: the first item stays pinned while the others scroll past as steps that drive it.
  // reel: the section pins and its items are full-screen panels that slide sideways as the reader scrolls down.
  layout: z.enum(["grid", "tabs", "story", "reel"]),
  items: z.array(ViewItemSchema),
  /** The section's own ground, edge to edge, from the view's stage; its text, charts and designs follow it. */
  background: z.enum(["page", "surface", "ink", "accent"]).optional(),
  /** "screen": at least a full window tall, content centred (one huge number, one sentence). Not for story or reel. */
  height: z.enum(["screen"]).optional(),
  /** Story only: the visual "behind" the steps (full screen), "side" by side, or "split" half and half. */
  variant: z.enum(["behind", "side", "split"]).optional(),
  /** Story only: which side the steps are on. */
  steps: z.enum(["left", "right"]).optional(),
}).superRefine((s, ctx) => {
  if (s.layout !== "story") for (const k of ["variant", "steps"] as const) if (s[k] !== undefined) ctx.addIssue({ code: "custom", path: [k], message: `${k} is only for story sections (section "${s.id}" is ${s.layout})` });
  if (s.height && (s.layout === "story" || s.layout === "reel")) ctx.addIssue({ code: "custom", path: ["height"], message: `height "screen" is not for ${s.layout} sections: they already fill the screen` });
});
export type Section = z.infer<typeof SectionSchema>;

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour like #c2410c");
/**
 * A view's own colours, chosen to fit its subject. `page` (and optionally `ink`) set the whole stage: the mode follows
 * the page and aurora derives every other colour from them (see stage.ts). `accent` and `series` work with or without a page.
 */
export const PaletteSchema = z.object({ page: Hex.optional(), ink: Hex.optional(), accent: Hex.optional(), series: z.array(Hex).min(1).max(8).optional() })
  .superRefine((p, ctx) => { const m = stageProblem(p); if (m) ctx.addIssue({ code: "custom", message: m }); });
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
  /** Typefaces by Google Fonts family name; the screen and designs use them. */
  fonts: FontsSchema.optional(),
  /** One designed page instead of an article: edge-to-edge sections, aurora's controls tucked away, a full-screen opening. A hero design implies it. */
  immersive: z.boolean().optional(),
  sections: z.array(SectionSchema),
});
export type View = z.infer<typeof ViewSchema>;

export function fromPlan1(spec: Spec, id: string): View {
  const view: View = { v: 2, id, title: spec.title, queries: { ...spec.queries }, sections: [{ id: "main", layout: "grid", items: spec.layout.items.map((i) => ({ ...i })) }] };
  if (spec.summary !== undefined) view.summary = spec.summary;
  return view;
}
