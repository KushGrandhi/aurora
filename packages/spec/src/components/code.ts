import { z } from "zod";
import type { ComponentDef } from "../registry.ts";

export const CodeSchema = z.object({
  type: z.literal("code"),
  code: z.string(),
  lang: z.string().optional(),
  filename: z.string().optional(),
  highlight: z.array(z.number().int().positive()).optional(),
  diff: z.boolean().optional(),
});
export type Code = z.infer<typeof CodeSchema>;

export const code: ComponentDef<Code> = {
  type: "code",
  schema: CodeSchema,
  doc: {
    summary: "Syntax-highlighted code or a unified diff, with line numbers, highlighted lines and a copy button.",
    example: { type: "code", lang: "ts", filename: "src/sum.ts", highlight: [2], code: "export function sum(xs: number[]) {\n  return xs.reduce((a, b) => a + b, 0);\n}" },
    guidance: "Pick it to show real code: an excerpt that matters, a config, a patch. Keep excerpts short and say why they matter in a nearby text or callout. `highlight` takes 1-based line numbers; `diff: true` when `code` is a unified diff.",
  },
};
