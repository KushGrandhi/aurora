import { useEffect, useRef, useState } from "react";
import embed from "vega-embed";
import { changeset } from "vega";
import type { Component, QueryResult } from "@aurora/spec";
import { vegaConfig, type Stage } from "../theme.ts";
import { prepareVegaLite } from "../vegaPrep.ts";
import { useFocus } from "../focus.tsx";

type ChartC = Extract<Component, { type: "chart" }>;
type VegaView = { data(name: string, v?: unknown[]): unknown; change(name: string, cs: unknown): { runAsync(): Promise<unknown> } };

/**
 * Puts new rows into a drawn chart keyed by the field that names each mark: a row whose key was already there updates
 * that data item in place, so Vega keeps its mark (and its SVG path) and the path's shape transitions to the new
 * value. Without a unique key, the rows are replaced and marks are redrawn.
 */
function updateRows(view: VegaView, rows: Record<string, unknown>[], key?: string): Promise<unknown> {
  const replace = () => (view.data("aurora_rows", rows) as { runAsync(): Promise<unknown> }).runAsync();
  if (!key) return replace();
  const keys = rows.map((r) => String(r[key]));
  if (new Set(keys).size !== keys.length) return replace();
  const old = (view.data("aurora_rows") ?? []) as Record<string, unknown>[];
  const byKey = new Map(old.map((t) => [String(t[key]), t]));
  const cs = changeset();
  rows.forEach((row, i) => {
    const t = byKey.get(keys[i]);
    if (!t) cs.insert(row);
    else for (const f of Object.keys(row)) if (t[f] !== row[f]) cs.modify(t, f, row[f]);
  });
  const keep = new Set(keys);
  cs.remove((t: Record<string, unknown>) => !keep.has(String(t[key])));
  return view.change("aurora_rows", cs).runAsync();
}
type Spec = Record<string, unknown> & { encoding?: Record<string, { field?: string; type?: string } | undefined>; params?: unknown[] };

/**
 * Linked focus for a single-view chart: the field that names each mark (its first nominal or ordinal channel). Marks
 * whose value isn't focused dim through a Vega signal, so focusing never redraws the chart.
 */
function focusField(spec: Spec): string | undefined {
  if (!spec.encoding || "layer" in spec || "concat" in spec || "hconcat" in spec || "vconcat" in spec || "facet" in spec || "repeat" in spec || spec.encoding.opacity) return undefined;
  for (const ch of ["y", "x", "color", "theta", "row", "column"]) {
    const e = spec.encoding[ch];
    if (e?.field && (e.type === "nominal" || e.type === "ordinal")) return e.field;
  }
  return undefined;
}
function withFocus(spec: Spec, field: string): Spec {
  const test = `aurora_focus === null || datum[${JSON.stringify(field)}] + '' === aurora_focus`;
  return { ...spec, params: [...(spec.params ?? []), { name: "aurora_focus", value: null }], encoding: { ...spec.encoding, opacity: { condition: { test, value: 1 }, value: 0.22 } as never } };
}

export function Chart({ c, result, stage, font, onDrawn }: { c: ChartC; result: QueryResult; stage: Stage; font?: string; onDrawn?: (ok: boolean, message?: string) => void }) {
  const mode = stage.mode;
  const seriesKey = JSON.stringify(stage) + font;
  const focus = useFocus();
  const setFocus = useRef(focus.set);
  setFocus.current = focus.set;
  const viewRef = useRef<{ signal(n: string, v: unknown): { runAsync(): Promise<unknown> } } | undefined>();
  const focusValue = useRef(focus.value);
  focusValue.current = focus.value;
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const drawn = useRef(false);
  // New rows for the same chart (a filter changed) go into the drawn chart, so its marks move to their new values
  // (a CSS transition on each path's shape) instead of the chart being redrawn. A new spec or new columns redraw.
  const rows = useRef(result.rows);
  rows.current = result.rows;
  const data = useRef<VegaView | undefined>();
  const keyField = useRef<string | undefined>();
  const columnsKey = Object.keys(result.rows[0] ?? {}).join(",");
  useEffect(() => {
    if (!ref.current) return;
    let view: { finalize(): void } | undefined;
    const base = { autosize: { type: "fit-x", contains: "padding" }, height: 260, ...prepareVegaLite(c.vegaLite, rows.current), width: "container", data: { name: "aurora_rows", values: rows.current } } as Spec;
    const field = focusField(base);
    let cancelled = false;
    const spec = field ? withFocus(base, field) : base;
    embed(ref.current, spec as never, { actions: false, renderer: "svg", config: vegaConfig(stage, font) as never, tooltip: { theme: mode } as never })
      .then((r) => {
        if (cancelled) return r.finalize();
        view = r;
        data.current = r.view as unknown as VegaView;
        keyField.current = field;
        if (field) {
          const v = r.view as unknown as { signal(n: string, v: unknown): { runAsync(): Promise<unknown> }; addEventListener(t: string, h: (e: unknown, item?: { datum?: Record<string, unknown> }) => void): void };
          viewRef.current = v;
          v.addEventListener("mouseover", (_e, item) => { const d = item?.datum?.[field]; if (d != null) setFocus.current(String(d)); });
          v.addEventListener("mouseout", () => setFocus.current(null));
          const now = focusValue.current;
          if (now !== null && rows.current.some((row) => Object.values(row).some((x) => x != null && String(x) === now))) void v.signal("aurora_focus", now).runAsync();
        }
        setError(undefined);
        onDrawn?.(true);
        if (!drawn.current) {
          drawn.current = true;
          ref.current?.classList.add("reveal");
        }
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        onDrawn?.(false, `chart: ${String(e?.message ?? e)}`);
      });
    return () => {
      cancelled = true;
      viewRef.current = undefined;
      data.current = undefined;
      view?.finalize();
    };
  }, [c, mode, seriesKey, columnsKey]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!data.current) return;
    void updateRows(data.current, result.rows, keyField.current).then(() => onDrawn?.(true)).catch((e) => onDrawn?.(false, `chart: ${String(e?.message ?? e)}`));
  }, [result]);
  // Dim only when this chart shows the focused value; otherwise it has nothing to point at and stays fully lit.
  const shown = (v: string | null) => v !== null && result.rows.some((r) => Object.values(r).some((x) => x != null && String(x) === v)) ? v : null;
  useEffect(() => { void viewRef.current?.signal("aurora_focus", shown(focus.value)).runAsync().catch(() => {}); }, [focus.value, result]);
  return error ? <div className="note">Couldn't draw this chart: {error}</div> : <div className="chart" ref={ref} />;
}

export default function ChartRenderer({ c, ctx }: { c: ChartC; ctx: import("../registry.tsx").RenderCtx }) {
  return <Chart c={c} result={ctx.results[c.query]} stage={ctx.theme.stage} font={ctx.theme.font} onDrawn={ctx.report} />;
}
