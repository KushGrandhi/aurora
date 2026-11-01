import type { Item } from "@genui/spec";

const GRID = 12;

/** Normalize the model's spans: runs of KPIs share a row evenly, and every row fills the full width. */
export function packRows(items: Item[]): Item[] {
  const out = items.map((i) => ({ ...i }));
  // KPI runs: up to 4 per row, equal widths.
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && out[j].c.type === "kpi") j++;
    const n = j - i;
    if (n > 0) {
      const perRow = Math.min(n, 4);
      for (let k = i; k < j; k++) out[k].span = GRID / perRow === Math.floor(GRID / perRow) ? GRID / perRow : 3;
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
