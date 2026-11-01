const n = (v: number) => String(Math.round(v * 100) / 100);

/** An SVG path through the points, scaled into a w×h box (y up). "" for fewer than two points. */
export function sparklinePath(points: { x: number; y: number }[], w: number, h: number, pad = 2): string {
  if (points.length < 2) return "";
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => (x1 === x0 ? w / 2 : pad + ((x - x0) / (x1 - x0)) * (w - 2 * pad));
  const sy = (y: number) => (y1 === y0 ? h / 2 : h - pad - ((y - y0) / (y1 - y0)) * (h - 2 * pad));
  return points.map((p, i) => `${i ? "L" : "M"}${n(sx(p.x))},${n(sy(p.y))}`).join("");
}

/** Numbers, numeric strings and dates become numbers; anything else is dropped. */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "") {
    const num = Number(v);
    if (!isNaN(num)) return num;
    const t = Date.parse(v);
    return isNaN(t) ? undefined : t;
  }
  if (v instanceof Date) return v.getTime();
  return undefined;
}
