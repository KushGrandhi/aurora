import { applyOps, type PatchOp, type Problem, type View } from "@aurora/spec";

const DATA_OPS = new Set(["addQuery", "addDataset", "addParam", "removeParam"]);

export type Variant = { label: string; view: View; problems: Problem[] };

/** Applies each alternative to the view; variants reuse the view's data, so they can't change queries, datasets or params. */
export function buildVariants(view: View, alts: { label: string; ops: PatchOp[] }[], validate: (v: View) => Problem[]): { variants: Variant[] } | { problem: string } {
  if (alts.length < 2 || alts.length > 3) return { problem: `send 2 or 3 variants (got ${alts.length})` };
  const variants: Variant[] = [];
  for (const [n, a] of alts.entries()) {
    if (!a.label || a.label.length > 40) return { problem: `variant ${n + 1}: label must be 1 to 40 characters` };
    const data = a.ops.find((o) => DATA_OPS.has(o.op));
    if (data) return { problem: `variant "${a.label}": ${data.op} isn't allowed in variants (they reuse the view's data); add data with patch first` };
    const r = applyOps(view, a.ops);
    if (!r.ok) return { problem: `variant "${a.label}": ${r.problem.message}` };
    variants.push({ label: a.label, view: r.view, problems: validate(r.view) });
  }
  return { variants };
}
