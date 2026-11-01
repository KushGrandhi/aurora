import { getComponent, parsePlaceholders, type Item, type Problem, type View, type ViewItem } from "@genui/spec";
import { checkProse, normalizeProse, validateItem, type ValidateCtx } from "./validate.ts";

export type ViewValidateCtx = { queryRows: Map<string, number>; querySql: Map<string, string>; intent?: string };
export type ViewValidation = { view: View; problems: Problem[]; invalid: Set<string> };

const PLAN1_TYPES = new Set(["kpi", "chart", "table", "text"]);

/**
 * Checks every item against the registry and the data rules. Data-bound items (dataBound() non-empty) get the
 * Plan 1 no-typed-numbers rules; authored items are free except that placeholders must resolve to single-row queries.
 * Invalid items stay in the view (the screen shows a fallback card) and are listed in `invalid`.
 */
export function validateView(view: View, ctx: ViewValidateCtx): ViewValidation {
  const out: View = structuredClone(view);
  const problems: Problem[] = [];
  const invalid = new Set<string>();
  const known = new Set(Object.keys(out.queries ?? {}));
  const limits = new Map<string, number>();
  for (const [id, q] of Object.entries(out.queries ?? {})) {
    const m = q.sql.match(/\blimit\s+(\d+)/i);
    if (m) limits.set(id, Number(m[1]));
  }
  const vctx: ValidateCtx = { knownQueries: known, intent: ctx.intent ?? "", queryLimits: limits, querySql: ctx.querySql, queryRows: ctx.queryRows };

  const placeholderProblem = (text: string): string | null => {
    for (const { queryId } of parsePlaceholders(text)) {
      if (!known.has(queryId)) return `placeholder reads query "${queryId}", which this view doesn't define`;
      const n = ctx.queryRows.get(queryId);
      if (n !== undefined && n !== 1) return `placeholder reads query "${queryId}", which returns ${n} rows; placeholders need a single-row query`;
    }
    return null;
  };

  if (out.summary) {
    const bad = placeholderProblem(out.summary);
    if (bad) problems.push({ severity: "error", message: `summary: ${bad}`, hint: "add the query with addQuery or remove the placeholder" });
    else out.summary = normalizeProse(out.summary, vctx);
  }

  for (const section of out.sections) {
    section.items = section.items.map((item): ViewItem => {
      const fail = (message: string, hint?: string): ViewItem => {
        invalid.add(item.id);
        problems.push({ itemId: item.id, severity: "error", message, ...(hint ? { hint } : {}) });
        return item;
      };
      const def = getComponent(item.c.type);
      if (!def) return fail(`unknown component type "${item.c.type}"`, "use one of the types listed in the genui skill");
      const parsed = def.schema.safeParse(item.c);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return fail(`${item.c.type}: ${issue?.path.join(".") || "(root)"}: ${issue?.message ?? "invalid"}`, `see the "${item.c.type}" example in the genui skill`);
      }
      const c = parsed.data as ViewItem["c"];
      const bound = def.dataBound?.(c) ?? [];
      const missing = bound.find((q) => !known.has(q));
      if (missing) return fail(`reads query "${missing}", which this view doesn't define`, "add it with addQuery (or in the view's queries)");
      for (const text of def.placeholders?.(c) ?? []) {
        const bad = placeholderProblem(text);
        if (bad) return fail(bad, "add the query with addQuery or write the text without the placeholder");
      }

      if (bound.length === 0) {
        // Authored: free text; only normalize placeholder formats.
        if (c.type === "text" && typeof c.md === "string") return { ...item, c: { ...c, md: normalizeProse(c.md, vctx) } };
        return { ...item, c };
      }
      if (item.title) {
        const bad = checkProse(item.title, vctx);
        if (bad) return fail(`title: ${bad}; data-bound items take numbers from queries`, "move the number into a placeholder or a query");
      }
      if (PLAN1_TYPES.has(c.type)) {
        const r = validateItem({ id: item.id, span: item.span ?? 12, c } as Item, vctx);
        if (!r.ok) return fail(r.reason, "numbers in data panels must come from queries; headline numbers need single-row queries");
        return { ...item, c: r.item.c as ViewItem["c"] };
      }
      return { ...item, c };
    });
  }
  return { view: out, problems, invalid };
}
