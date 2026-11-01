import { itemQueries, parsePlaceholders, PartSchema, PLACEHOLDER_RE, type Part } from "@genui/spec";

export type ValidateCtx = { knownQueries: Set<string>; intent: string; queryLimits: Map<string, number> };
export type ValidateResult = { ok: true; part: Part } | { ok: false; reason: string };

const CONTAINERS = ["layer", "hconcat", "vconcat", "concat"] as const;

function stripSpec(vl: Record<string, unknown>): void {
  delete vl.data;
  delete vl.datasets;
  delete vl.$schema;
  const enc = vl.encoding as Record<string, Record<string, unknown>> | undefined;
  if (enc && typeof enc === "object") {
    for (const ch of Object.values(enc)) {
      if (ch && typeof ch === "object" && typeof ch.datum === "number") delete ch.datum;
    }
  }
  for (const key of CONTAINERS) {
    const sub = vl[key];
    if (Array.isArray(sub)) sub.forEach((s) => s && typeof s === "object" && stripSpec(s as Record<string, unknown>));
  }
  if (vl.spec && typeof vl.spec === "object") stripSpec(vl.spec as Record<string, unknown>);
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
  if (c.type === "chart" && typeof c.vegaLite.title === "string") return [c.vegaLite.title];
  return [];
}

export function validatePart(raw: unknown, ctx: ValidateCtx): ValidateResult {
  const parsed = PartSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: `invalid part: ${parsed.error.issues[0]?.message ?? "schema"}` };
  let part = parsed.data;
  if (part.kind === "query") return { ok: true, part };

  const refs = [...itemQueries(part.item), ...proseOf(part).flatMap((t) => parsePlaceholders(t).map((r) => r.queryId))];
  const missing = refs.find((id) => !ctx.knownQueries.has(id));
  if (missing) return { ok: false, reason: `pending:${missing}` };

  for (const t of proseOf(part)) {
    const bad = checkProse(t, ctx);
    if (bad) return { ok: false, reason: bad };
  }
  if (part.item.c.type === "chart") {
    part = { ...part, item: { ...part.item, c: { ...part.item.c, vegaLite: sanitizeVegaLite(part.item.c.vegaLite) } } };
  }
  return { ok: true, part };
}
