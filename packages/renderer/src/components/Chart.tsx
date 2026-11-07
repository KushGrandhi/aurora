import { useEffect, useRef, useState } from "react";
import embed from "vega-embed";
import type { Component, QueryResult } from "@aurora/spec";
import { vegaConfig, type Mode } from "../theme.ts";
import { prepareVegaLite } from "../vegaPrep.ts";

type ChartC = Extract<Component, { type: "chart" }>;

export function Chart({ c, result, mode, series, onDrawn }: { c: ChartC; result: QueryResult; mode: Mode; series?: readonly string[]; onDrawn?: (ok: boolean, message?: string) => void }) {
  const seriesKey = series?.join(",");
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const drawn = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    let view: { finalize(): void } | undefined;
    let cancelled = false;
    const spec = { autosize: { type: "fit-x", contains: "padding" }, height: 260, ...prepareVegaLite(c.vegaLite, result.rows), width: "container", data: { values: result.rows } };
    embed(ref.current, spec as never, { actions: false, renderer: "svg", config: vegaConfig(mode, series) as never, tooltip: { theme: mode } as never })
      .then((r) => {
        if (cancelled) return r.finalize();
        view = r;
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
      view?.finalize();
    };
  }, [c, result, mode, seriesKey]);
  return error ? <div className="note">Couldn't draw this chart: {error}</div> : <div className="chart" ref={ref} />;
}

export default function ChartRenderer({ c, ctx }: { c: ChartC; ctx: import("../registry.tsx").RenderCtx }) {
  return <Chart c={c} result={ctx.results[c.query]} mode={ctx.mode} series={ctx.palette?.series ? ctx.theme.categorical : undefined} onDrawn={ctx.report} />;
}
