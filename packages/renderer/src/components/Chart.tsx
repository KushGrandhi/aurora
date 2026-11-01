import { useEffect, useRef, useState } from "react";
import embed from "vega-embed";
import type { Component, QueryResult } from "@genui/spec";
import { vegaConfig, type Mode } from "../theme.ts";
import { prepareVegaLite } from "../vegaPrep.ts";

type ChartC = Extract<Component, { type: "chart" }>;

export function Chart({ c, result, mode, onDrawn }: { c: ChartC; result: QueryResult; mode: Mode; onDrawn?: (ok: boolean, message?: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  const drawn = useRef(false);
  useEffect(() => {
    if (!ref.current) return;
    let view: { finalize(): void } | undefined;
    let cancelled = false;
    const spec = { autosize: { type: "fit-x", contains: "padding" }, height: 260, ...prepareVegaLite(c.vegaLite, result.rows), width: "container", data: { values: result.rows } };
    embed(ref.current, spec as never, { actions: false, renderer: "svg", config: vegaConfig(mode) as never, tooltip: { theme: mode } as never })
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
  }, [c, result, mode]);
  return error ? <div className="note">Couldn't draw this chart: {error}</div> : <div className="chart" ref={ref} />;
}
