import { useEffect, useState } from "react";
import { Legend, Panel, Scene, Stage, Stat, useClock } from "aurora/kit";
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
      {/* In a hero the screen shows the view's title and summary on the left: the design adds only what changes. */}
      <Panel at="top-right">
        <Stat label={sel ? sel.region : "All regions"} value={money(sel ? sel.revenue : total)}
          note={sel ? `${Math.round((sel.revenue / Math.max(1, total)) * 100)}% of revenue · ${sel.units} units` : `${rows.length} regions in the current filter. Click a column.`} />
      </Panel>

      <Panel at="bottom-left">
        <Legend items={rows.map((r, i) => ({ name: r.region, color: `--s${(i % 6) + 1}`, active: selected === r.region, onClick: () => pick(r.region) }))} />
      </Panel>
    </Stage>
  );
}
