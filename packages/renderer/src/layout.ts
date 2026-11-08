import type { Item } from "@aurora/spec";

const GRID = 12;

/** How a run of n KPIs splits into rows of at most `max`: as even as possible, and only sizes that divide 12. */
export function kpiRows(n: number, max = 4): number[] {
  const rows = Math.ceil(n / max);
  const base = Math.floor(n / rows), extra = n % rows;
  const counts = Array.from({ length: rows }, (_, r) => base + (r < extra ? 1 : 0));
  return counts.flatMap((c) => (c === 5 ? [3, 2] : [c]));
}

/** Normalize the model's spans: runs of KPIs share rows evenly (up to 4 a row, or 6 when compact), and every row fills the full width. */
export function packRows(items: Item[], maxKpis = 4): Item[] {
  const out = items.map((i) => ({ ...i }));
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && out[j].c.type === "kpi") j++;
    const n = j - i;
    if (n > 1) {
      let k = i;
      for (const c of kpiRows(n, maxKpis)) for (let m = 0; m < c; m++) out[k++].span = GRID / c;
    }
    i = Math.max(j, i + 1);
  }
  // Stretch the last item of any row that leaves a gap.
  let used = 0;
  for (let i = 0; i < out.length; i++) {
    const span = Math.min(out[i].span, GRID);
    if (used + span > GRID) {
      out[i - 1].span += GRID - used;
      used = 0;
    }
    used += span;
    out[i].span = span;
    if (used === GRID) used = 0;
  }
  if (used > 0 && out.length) out[out.length - 1].span += GRID - used;
  return out;
}
