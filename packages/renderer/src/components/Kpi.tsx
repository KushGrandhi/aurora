import { useEffect, useRef, useState } from "react";
import type { Component, Format, QueryResult } from "@aurora/spec";
import { formatValue } from "../format.ts";
import { sparklinePath, toNumber } from "../sparkline.ts";
import { useWidth } from "../useWidth.ts";

type KpiC = Extract<Component, { type: "kpi" }>;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Animates a number from its previous value to the new one; non-numbers render directly. */
function useCountUp(target: unknown, ms = 1100): unknown {
  // The first value shows as it is (counting up from zero is decoration); a change glides from the old value.
  const [shown, setShown] = useState<unknown>(target);
  const from = useRef(typeof target === "number" ? target : 0);
  useEffect(() => {
    if (typeof target !== "number" || matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const p = easeOutExpo((now - start) / ms);
      setShown(a + (target - a) * p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return shown;
}

const SPARK_H = 32;

/** A small trend line under the value: x sorted, no axes, the last point marked. */
function Sparkline({ rows, x, y, color, format }: { rows: Record<string, unknown>[]; x: string; y: string; color: string; format?: Format }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const pts = rows.flatMap((r) => {
    const px = toNumber(r[x]);
    const py = toNumber(r[y]);
    return px === undefined || py === undefined ? [] : [{ x: px, y: py }];
  }).sort((a, b) => a.x - b.x);
  const d = w > 0 ? sparklinePath(pts, w, SPARK_H, 4) : "";
  const end = d.match(/([\d.]+),([\d.]+)$/);
  return (
    <div className="spark-wrap" ref={ref}>
      {d && (
        <svg className="spark" width={w} height={SPARK_H} viewBox={`0 0 ${w} ${SPARK_H}`} role="img" aria-label={`trend of ${y}`}>
          <title>{`latest ${formatValue(pts[pts.length - 1].y, format)}`}</title>
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {end && <circle cx={end[1]} cy={end[2]} r={3} fill={color} />}
        </svg>
      )}
    </div>
  );
}

export function Kpi({ c, results, hero, color }: { c: KpiC; results: Record<string, QueryResult>; hero?: boolean; color: string }) {
  const raw = results[c.query]?.rows[0]?.[c.field];
  const target = typeof raw === "string" && raw.trim() !== "" && !isNaN(Number(raw)) ? Number(raw) : raw;
  const shown = useCountUp(target);
  const final = typeof target === "number" && typeof shown === "number" && Math.abs(shown - target) < 1e-9;
  // Integers stay integers while counting; the exact format applies at rest.
  const fmt: Format | undefined = !final && (c.format === "integer" || Number.isInteger(target)) && !c.format?.endsWith("bytes") ? (c.format ?? "integer") : c.format;
  const delta = c.delta ? results[c.delta.query]?.rows[0]?.[c.delta.field] : undefined;
  const d = typeof delta === "number" ? delta : Number(delta);
  return (
    <div className={`kpi${hero ? " hero" : ""}`}>
      <div className="label">{c.label}</div>
      <div className="value">{raw === undefined ? "—" : formatValue(typeof target === "number" ? (final ? target : (Number.isInteger(target) ? Math.round(shown as number) : shown)) : raw, fmt)}</div>
      {delta !== undefined && !isNaN(d) && (
        <div className={`delta ${d > 0 ? "up" : d < 0 ? "down" : ""}`}>{d > 0 ? "▲" : d < 0 ? "▼" : "•"} {formatValue(d, "delta")}</div>
      )}
      {c.sparkline && results[c.sparkline.query] && <Sparkline rows={results[c.sparkline.query].rows} x={c.sparkline.x} y={c.sparkline.y} color={color} format={c.format} />}
    </div>
  );
}
