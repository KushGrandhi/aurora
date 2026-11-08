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

// Loose: unknown fields survive parsing so intake can name them (unknownFields) before storing the view (stripUnknown).
export const ViewItemSchema = z.looseObject({
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

export const SectionSchema = z.looseObject({
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
  /** "compact": dense and glanceable, for a monitor or an explorer (grid or tabs only). */
  density: z.enum(["compact"]).optional(),
}).superRefine((s, ctx) => {
  if (s.density && s.layout !== "grid" && s.layout !== "tabs") ctx.addIssue({ code: "custom", path: ["density"], message: `density "compact" is for grid and tabs sections (section "${s.id}" is ${s.layout})` });
  if (s.density && s.height) ctx.addIssue({ code: "custom", path: ["density"], message: `section "${s.id}" can't be both compact and a full screen` });
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

export const ViewSchema = z.looseObject({
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

/**
 * Fields the view, a section or an item doesn't have (a typo, or a field in the wrong place), with the closest real
 * one: the schema drops unknown keys silently, so they come back as problems instead.
 */
export function unknownFields(raw: unknown): string[] {
  const out: string[] = [];
  const near = (k: string, known: string[]) => {
    const d = (a: string, b: string) => { const m = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let p = m[0]; m[0] = i; for (let j = 1; j <= b.length; j++) { const t = m[j]; m[j] = Math.min(m[j] + 1, m[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; } } return m[b.length]; };
    const best = known.map((x) => [x, d(k.toLowerCase(), x.toLowerCase())] as const).sort((a, b) => a[1] - b[1])[0];
    return best && best[1] <= Math.max(2, Math.floor(k.length / 3)) ? best[0] : undefined;
  };
  const check = (o: unknown, known: string[], where: string, other?: Record<string, string>) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    for (const k of Object.keys(o)) {
      if (known.includes(k)) continue;
      const elsewhere = other?.[k];
      const guess = near(k, known);
      out.push(`${where} has no field "${k}"${elsewhere ? `; ${k} belongs on ${elsewhere}` : guess ? `; did you mean "${guess}"?` : ""}`);
    }
  };
  const viewKeys = Object.keys(ViewSchema.shape), sectionKeys = Object.keys((SectionSchema as unknown as { shape: object }).shape), itemKeys = Object.keys(ViewItemSchema.shape);
  const onSection = Object.fromEntries(sectionKeys.map((k) => [k, "a section"])), onView = Object.fromEntries(viewKeys.map((k) => [k, "the view"]));
  const v = raw as { sections?: unknown[] };
  check(raw, viewKeys, "the view", onSection);
  for (const s of Array.isArray(v?.sections) ? v.sections : []) {
    const sec = s as { id?: string; items?: unknown[] };
    check(sec, sectionKeys, `section "${sec?.id ?? "?"}"`, onView);
    for (const it of Array.isArray(sec?.items) ? sec.items : []) check(it, itemKeys, `item "${(it as { id?: string })?.id ?? "?"}"`, { ...onSection, ...onView });
  }
  return out;
}

/** The view with every field it doesn't have removed (after unknownFields has named them). */
export function stripUnknown(view: View): View {
  const pick = <T extends object>(o: T, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k))) as T;
  const viewKeys = Object.keys(ViewSchema.shape), sectionKeys = Object.keys((SectionSchema as unknown as { shape: object }).shape), itemKeys = Object.keys(ViewItemSchema.shape);
  return { ...pick(view, viewKeys), sections: view.sections.map((s) => ({ ...pick(s, sectionKeys), items: s.items.map((i) => pick(i, itemKeys)) })) };
}

export function fromPlan1(spec: Spec, id: string): View {
  const view: View = { v: 2, id, title: spec.title, queries: { ...spec.queries }, sections: [{ id: "main", layout: "grid", items: spec.layout.items.map((i) => ({ ...i })) }] };
  if (spec.summary !== undefined) view.summary = spec.summary;
  return view;
}
