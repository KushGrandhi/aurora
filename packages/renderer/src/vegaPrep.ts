import { humanizeField, inferFormat, type Format } from "@genui/spec";

type Enc = Record<string, unknown> & { field?: string; type?: string; title?: unknown; axis?: Record<string, unknown> | null; sort?: unknown };
type Spec = Record<string, unknown> & { mark?: unknown; encoding?: Record<string, Enc>; layer?: Spec[] };

const SIZE_FACTOR: Partial<Record<Format, number>> = { bytes: 1, kilobytes: 1e3, megabytes: 1e6, gigabytes: 1e9 };

function axisFor(field: string): Record<string, unknown> | undefined {
  const f = inferFormat(field);
  const factor = f ? SIZE_FACTOR[f] : undefined;
  if (factor) return { labelExpr: `format(datum.value * ${factor}, '.3~s') + 'B'` };
  if (f === "currency") return { format: "$~s" };
  if (f === "percent") return { format: ".0%" };
  return undefined;
}

const markType = (m: unknown) => (typeof m === "string" ? m : (m as { type?: string } | undefined)?.type);

function prepEncoding(enc: Record<string, Enc>, horizontalBars: boolean): void {
  for (const ch of ["x", "y"] as const) {
    const e = enc[ch];
    if (!e) continue;
    // Counts are whole numbers: no 0.2 ticks.
    if (e.type === "quantitative" && e.axis !== null && (e.aggregate === "count" || (e.field && inferFormat(e.field) === "integer"))) {
      e.axis = { tickMinStep: 1, format: "~s", ...(e.axis ?? {}) };
      if (e.aggregate === "count" && e.title === undefined) e.title = "Count";
    }
    if (!e.field) continue;
    // Category labels on a horizontal bar chart speak for themselves.
    if (horizontalBars && ch === "y" && e.title === undefined) e.title = null;
    if (e.title === undefined) e.title = humanizeField(e.field);
    if (e.type === "quantitative" && e.axis !== null) {
      const extra = axisFor(e.field);
      if (extra) e.axis = { ...extra, ...(e.axis ?? {}) };
    }
  }
  for (const ch of ["color", "size", "theta"] as const) {
    const e = enc[ch];
    if (e?.field && e.title === undefined) e.title = humanizeField(e.field);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+Z?)?$/;

/** Correct encoding types the data contradicts (dates or text declared quantitative). */
function fixTypes(enc: Record<string, Enc>, rows: Record<string, unknown>[]): void {
  for (const e of Object.values(enc)) {
    if (!e?.field || e.type !== "quantitative" || e.aggregate || e.bin) continue;
    const v = rows.find((r) => r[e.field!] != null)?.[e.field];
    if (typeof v !== "string" || (v.trim() !== "" && !isNaN(Number(v)))) continue;
    e.type = ISO_DATE.test(v) ? "temporal" : "nominal";
  }
}

/** Make a model-written Vega-Lite spec read well: horizontal category bars, unit-aware axes, human titles, tooltips. */
export function prepareVegaLite(input: Record<string, unknown>, rows: Record<string, unknown>[] = []): Record<string, unknown> {
  const spec = structuredClone(input) as Spec;
  const apply = (s: Spec) => {
    if (s.encoding && rows.length) fixTypes(s.encoding, rows);
    // A bar's length must be a quantity; a date "length" reads better as a dot plot.
    if (markType(s.mark) === "bar" && s.encoding && (["x", "y"] as const).some((ch) => s.encoding![ch]?.type === "temporal") &&
        (["x", "y"] as const).some((ch) => ["nominal", "ordinal"].includes(String(s.encoding![ch]?.type)))) {
      s.mark = typeof s.mark === "string" ? "point" : { ...(s.mark as object), type: "point" };
      const enc = s.encoding;
      if (enc.y?.type === "temporal") [enc.x, enc.y] = [enc.y, enc.x];
      enc.y = { ...enc.y!, sort: enc.y!.sort ?? "-x" };
      enc.x = { ...enc.x!, scale: { zero: false, nice: true, ...((enc.x!.scale as object) ?? {}) } };
    }
    const type = markType(s.mark);
    if (type) s.mark = typeof s.mark === "string" ? { type, tooltip: true } : { tooltip: true, ...(s.mark as object) };
    const enc = s.encoding;
    if (enc) {
      const { x, y } = enc;
      const discrete = (e?: Enc) => e?.type === "nominal" || e?.type === "ordinal";
      if (type === "bar" && discrete(x) && y?.type === "quantitative" && !enc.xOffset) {
        enc.x = y;
        enc.y = { ...x, sort: x!.sort ?? "-x" };
      }
      prepEncoding(enc, type === "bar" && discrete(enc.y) && enc.x?.type === "quantitative");
    }
    s.layer?.forEach(apply);
  };
  apply(spec);
  return spec;
}
