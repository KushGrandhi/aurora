import { useEffect, useState } from "react";
import { Legend, Panel, Scene, Stage, Stagger, useClock } from "aurora/kit";
import Bars, { type Row } from "./Bars";

type Bridge = { data?: Record<string, unknown[]>; onData?(cb: (d: Record<string, unknown[]>) => void): (() => void) | void; send?(name: string, payload: unknown): void };
const bridge = () => (window as unknown as { aurora?: Bridge }).aurora;

/** The rows of one of the view's queries, updated live when the person changes a filter. */
function useRows(name: string): Row[] {
  const [rows, setRows] = useState<Row[]>(() => (bridge()?.data?.[name] ?? []) as Row[]);
  useEffect(() => {
    const off = bridge()?.onData?.((d) => setRows((d[name] ?? []) as Row[]));
    return () => void (typeof off === "function" && off());
  }, [name]);
  return rows;
}

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function App() {
  const rows = useRows("by_region");
  const clock = useClock();
  const [selected, setSelected] = useState<string | null>(null);
  const pick = (region: string) => {
    const next = selected === region ? null : region;
    setSelected(next);
    bridge()?.send?.("region", { region: next }); // the caller hears the click through aurora's events
  };
  const total = rows.reduce((n, r) => n + r.revenue, 0);
  const sel = rows.find((r) => r.region === selected);

  return (
    <Stage scene={<Scene camera={[7, 4.2, 10.5]} target={[0, 0.4, 0]}><Bars rows={rows} selected={selected} onPick={pick} clock={clock} /></Scene>}>
      <Panel at="top-left">
        <Stagger>
          <div className="text-xs font-medium uppercase tracking-wider text-accent">aurora · showcase</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Show anything, live</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            This scene is a 3D design reading a query. Change the filters above and the columns reshape. Drag to turn it, and click a column.
          </p>
        </Stagger>
      </Panel>

      <Panel at="top-right" className="w-64">
        <div className="text-xs text-muted">{sel ? sel.region : "All regions"}</div>
        <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{money(sel ? sel.revenue : total)}</div>
        <div className="mt-1 text-xs text-muted">{sel ? `${Math.round((sel.revenue / Math.max(1, total)) * 100)}% of revenue · ${sel.units} units` : `${rows.length} regions in the current filter`}</div>
      </Panel>

      <Panel at="bottom">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted">Regions</span>
          <Legend items={rows.map((r, i) => ({ name: r.region, color: `--s${(i % 6) + 1}`, active: selected === r.region, onClick: () => pick(r.region) }))} />
        </div>
      </Panel>
    </Stage>
  );
}
