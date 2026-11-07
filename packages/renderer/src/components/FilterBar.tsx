import { useEffect, useRef, useState } from "react";
import type { Param } from "@aurora/spec";

type Props = {
  params: Record<string, Param>;
  values: Record<string, unknown>;
  options: Record<string, string[]>;
  onChange(name: string, value: unknown): void;
  /** "pill": one compact floating row, used on an immersive hero. */
  variant?: "pill";
};

/** Calls `fn` 250 ms after the last change. */
function useDebounced<T>(fn: (v: T) => void, ms = 250) {
  const t = useRef<number>();
  useEffect(() => () => clearTimeout(t.current), []);
  return (v: T) => {
    clearTimeout(t.current);
    t.current = window.setTimeout(() => fn(v), ms);
  };
}

function Search({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const later = useDebounced(onChange);
  return <input type="search" aria-label={label} placeholder={label} value={text} onChange={(e) => { setText(e.target.value); later(e.target.value); }} />;
}

function Pair({ kind, label, value, min, max, step, onChange }: {
  kind: "number" | "date"; label: string; value: [unknown, unknown]; min?: number; max?: number; step?: number; onChange(v: [unknown, unknown]): void;
}) {
  const [pair, setPair] = useState(value);
  useEffect(() => setPair(value), [JSON.stringify(value)]);
  const later = useDebounced(onChange);
  const set = (i: 0 | 1, raw: string) => {
    const v = kind === "number" ? (raw === "" ? (i === 0 ? min : max) : Number(raw)) : raw || null;
    const next: [unknown, unknown] = i === 0 ? [v, pair[1]] : [pair[0], v];
    setPair(next);
    later(next);
  };
  return (
    <span className="pair">
      <input type={kind} aria-label={`${label} from`} value={String(pair[0] ?? "")} min={min} max={max} step={step} onChange={(e) => set(0, e.target.value)} />
      <span className="dash">–</span>
      <input type={kind} aria-label={`${label} to`} value={String(pair[1] ?? "")} min={min} max={max} step={step} onChange={(e) => set(1, e.target.value)} />
    </span>
  );
}

/** One row of controls above the sections; values come from the server, changes go back as `param` messages. */
export function FilterBar({ params, values, options, onChange, variant }: Props) {
  return (
    <div className={`filterbar${variant ? ` ${variant}` : ""}`} role="group" aria-label="Filters">
      {Object.entries(params).map(([name, p]) => (
        <label key={name} className="filter">
          <span className="flabel">{p.label}</span>
          {p.type === "select" && (
            <select value={values[name] == null ? "" : String(values[name])} onChange={(e) => onChange(name, e.target.value === "" ? null : e.target.value)}>
              <option value="">All</option>
              {(options[name] ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          {p.type === "search" && <Search label={p.label} value={String(values[name] ?? "")} onChange={(v) => onChange(name, v)} />}
          {p.type === "range" && <Pair kind="number" label={p.label} value={(values[name] as [unknown, unknown]) ?? [p.min, p.max]} min={p.min} max={p.max} step={p.step} onChange={(v) => onChange(name, v)} />}
          {p.type === "daterange" && <Pair kind="date" label={p.label} value={(values[name] as [unknown, unknown]) ?? [null, null]} onChange={(v) => onChange(name, v)} />}
        </label>
      ))}
    </div>
  );
}
