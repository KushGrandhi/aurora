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
  let row = 0; // columns used in the current row, as the model laid them out
  for (let i = 0; i < out.length; ) {
    let j = i;
    while (j < out.length && out[j].c.type === "kpi") j++;
    const n = j - i;
    const given = out.slice(i, j).reduce((a, k) => a + Math.min(k.span, GRID), 0);
    const next = j < out.length ? Math.min(out[j].span, GRID) : 0;
    const run = out.slice(i, j).map((k) => k.span);
    const even = run.every((sp) => sp === run[0] && sp >= GRID / maxKpis); // equal tiles, none too narrow
    const before = even && n > 1 && row > 0 && row + given === GRID; // they finish a row after other items (a sentence, then its results)
    const after = even && n > 1 && row + given < GRID && row + given + next <= GRID && next > 0; // they share a row with what follows (numbers beside a table)
    if (before || after) {
      // keep them where the model put them
      row = (row + given) % GRID; i = j; continue;
    }
    if (n > 1) {
      if (row > 0) { out[i - 1].span += GRID - row; row = 0; } // the run starts its own rows
      let k = i;
      for (const c of kpiRows(n, maxKpis)) for (let m = 0; m < c; m++) out[k++].span = GRID / c;
      i = j; continue;
    }
    const span = Math.min(out[i].span, GRID);
    row = row + span > GRID ? span : row + span;
    if (row === GRID) row = 0;
    i++;
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
