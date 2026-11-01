import { useEffect, useRef, useState } from "react";
import embed from "vega-embed";
import type { Component, QueryResult } from "@genui/spec";

type ChartC = Extract<Component, { type: "chart" }>;
const dark = () => window.matchMedia?.("(prefers-color-scheme: dark)").matches;

export function Chart({ c, result }: { c: ChartC; result: QueryResult }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!ref.current) return;
    let view: { finalize(): void } | undefined;
    let cancelled = false;
    const spec = { width: "container", autosize: { type: "fit", contains: "padding" }, ...c.vegaLite, data: { values: result.rows } };
    embed(ref.current, spec as never, {
      actions: false,
      renderer: "svg",
      theme: dark() ? "dark" : undefined,
      config: { background: null as never, view: { stroke: null as never } },
    })
      .then((r) => { if (cancelled) r.finalize(); else { view = r; setError(undefined); } })
      .catch((e) => setError(String(e?.message ?? e)));
    return () => { cancelled = true; view?.finalize(); };
  }, [c, result]);
  return error ? <div className="note">Chart error: {error}</div> : <div className="chart" ref={ref} />;
}
