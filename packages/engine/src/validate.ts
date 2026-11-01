import { itemQueries, parsePlaceholders, PartSchema, PLACEHOLDER_RE, type Part } from "@genui/spec";

export type ValidateCtx = { knownQueries: Set<string>; intent: string; queryLimits: Map<string, number> };
export type ValidateResult = { ok: true; part: Part } | { ok: false; reason: string };

const RESERVED_PREFIX = "d_"; // ids of the deterministic default view

/** Remove inline data and numeric datum constants at any depth. */
function stripSpec(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(stripSpec);
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  delete o.data;
  delete o.datasets;
  delete o.$schema;
  if (typeof o.datum === "number") delete o.datum;
  for (const v of Object.values(o)) stripSpec(v);
}

const PROSE_KEYS = new Set(["title", "subtitle", "text"]);
const EXPR_KEYS = new Set(["calculate", "labelExpr", "expr"]);

/** Strings in a Vega-Lite spec that reach the screen as text or computed values. Filters are skipped (literals allowed). */
function vegaStrings(node: unknown, out: { prose: string[]; exprs: string[]; numericValue: boolean }): void {
  if (Array.isArray(node)) return node.forEach((n) => vegaStrings(n, out));
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === "filter" || k === "domain") continue;
    if (PROSE_KEYS.has(k) && typeof v === "string") out.prose.push(v);
    else if (PROSE_KEYS.has(k) && Array.isArray(v) && v.every((x) => typeof x === "string")) out.prose.push(...(v as string[]));
    else if (EXPR_KEYS.has(k) && typeof v === "string") out.exprs.push(v.replace(/datum(\.\w+|\[[^\]]*\])/g, "datum"));
    else if (k === "value" && typeof v === "number") out.numericValue = true;
    else if (k === "value" && typeof v === "string") out.prose.push(v);
    else vegaStrings(v, out);
  }
}

export function sanitizeVegaLite(vl: Record<string, unknown>): Record<string, unknown> {
  const out = structuredClone(vl);
  stripSpec(out);
  if (out.width === undefined && !["hconcat", "vconcat", "concat"].some((k) => k in out)) out.width = "container";
  return out;
}

/** Returns a rejection reason, or null when every number in the text comes from a placeholder or is allowed. */
export function checkProse(text: string, ctx: ValidateCtx): string | null {
  const bare = text.replace(PLACEHOLDER_RE, " ");
  const allowedLimits = new Set([...ctx.queryLimits.values()].map(String));
  for (const m of bare.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = m[0];
    if (ctx.intent.includes(n) || allowedLimits.has(n)) continue;
    return `literal number '${n}' in prose`;
  }
  return null;
}

function proseOf(part: Part): string[] {
  if (part.kind !== "item") return [];
  const c = part.item.c;
  if (c.type === "kpi") return [c.label];
  if (c.type === "text" && "md" in c) return [c.md];
  if (c.type === "chart") {
    const out = { prose: [] as string[], exprs: [] as string[], numericValue: false };
    vegaStrings(c.vegaLite, out);
    return out.prose;
  }
  return [];
}

export function validatePart(raw: unknown, ctx: ValidateCtx): ValidateResult {
  const parsed = PartSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `invalid part: ${parsed.error.issues[0]?.message ?? "schema"}` };
  let part = parsed.data;
  const id = part.kind === "query" ? part.id : part.item.id;
  if (id.startsWith(RESERVED_PREFIX)) return { ok: false, reason: `id '${id}' uses the reserved prefix ${RESERVED_PREFIX}` };
  if (part.kind === "query") return { ok: true, part };
  if (part.item.c.type === "chart") {
    part = { ...part, item: { ...part.item, c: { ...part.item.c, vegaLite: sanitizeVegaLite(part.item.c.vegaLite) } } };
  }
  const c = part.item.c;
  if (c.type === "text" && "md" in c && /!\[|<img\b/i.test(c.md)) return { ok: false, reason: "images are not allowed in text" };

  const refs = [...itemQueries(part.item), ...proseOf(part).flatMap((t) => parsePlaceholders(t).map((r) => r.queryId))];
  const missing = refs.find((id) => !ctx.knownQueries.has(id));
  if (missing) return { ok: false, reason: `pending:${missing}` };

  for (const t of proseOf(part)) {
    const bad = checkProse(t, ctx);
    if (bad) return { ok: false, reason: bad };
  }
  if (c.type === "chart") {
    const out = { prose: [] as string[], exprs: [] as string[], numericValue: false };
    vegaStrings(c.vegaLite, out);
    if (out.numericValue) return { ok: false, reason: "numeric constant 'value' in chart" };
    for (const e of out.exprs) {
      const bad = checkProse(e, ctx);
      if (bad) return { ok: false, reason: `${bad} (chart expression)` };
    }
  }
  return { ok: true, part };
}
