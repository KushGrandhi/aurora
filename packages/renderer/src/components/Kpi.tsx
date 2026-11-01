import { useEffect, useRef, useState } from "react";
import type { Component, Format, QueryResult } from "@genui/spec";
import { formatValue } from "../format.ts";

type KpiC = Extract<Component, { type: "kpi" }>;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** Animates a number from its previous value to the new one; non-numbers render directly. */
function useCountUp(target: unknown, ms = 1100): unknown {
  const [shown, setShown] = useState<unknown>(typeof target === "number" ? 0 : target);
  const from = useRef(0);
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

export function Kpi({ c, results, hero }: { c: KpiC; results: Record<string, QueryResult>; hero?: boolean }) {
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
    </div>
  );
}
