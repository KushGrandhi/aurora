import { useMemo, useState, type ReactNode } from "react";

/**
 * Data-bound parts for designs: the pieces an inspector, a tool or an explorer is made of. They use aurora's tokens
 * (so they follow the palette and the theme) and stay plain, so the design's own type, surface and layout carry the
 * look. Each one works on a phone.
 */

type Row = Record<string, unknown>;
type Format = "number" | "integer" | "compact" | "percent" | "currency" | "ms";
const bridge = () => (window as unknown as { aurora?: { setFocus?(v: string | null): void } }).aurora;

/** A number for people: `fmt(0.42, "percent")` → "42%", `fmt(12500, "compact")` → "12.5K". */
export function fmt(v: unknown, format: Format = "number"): string {
  const n = typeof v === "number" ? v : Number(v);
  if (v === null || v === undefined || Number.isNaN(n)) return v == null ? "—" : String(v);
  switch (format) {
    case "integer": return Math.round(n).toLocaleString("en-US");
    case "compact": return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    case "percent": return new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(n);
    case "currency": return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n);
    case "ms": return `${Math.round(n).toLocaleString("en-US")} ms`;
    default: return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
}

export type BarsProps<R extends Row> = {
  rows: R[];
  /** Field (or function) for each bar's name. */
  label: keyof R | ((r: R) => string);
  /** Field for the bar's length. */
  value: keyof R;
  format?: Format;
  /** A line across every bar at this value (a cutoff, a limit), with its own label. */
  threshold?: number;
  thresholdLabel?: string;
  /** Rows drawn in the accent; the rest muted. */
  highlight?: (r: R) => boolean;
  /** The axis maximum (default: the largest value, or the threshold if larger). */
  max?: number;
  onPick?: (r: R) => void;
};

/** Horizontal bars, sorted as given, labelled on the bar, with an optional threshold line. */
export function Bars<R extends Row>({ rows, label, value, format, threshold, thresholdLabel, highlight, max, onPick }: BarsProps<R>) {
  const name = (r: R) => (typeof label === "function" ? label(r) : String(r[label] ?? ""));
  const top = max ?? Math.max(threshold ?? 0, ...rows.map((r) => Number(r[value]) || 0), 1e-9);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / top) * 100))}%`;
  return (
    <div className="relative flex flex-col gap-1.5">
      {rows.map((r, i) => {
        const v = Number(r[value]) || 0, on = highlight ? highlight(r) : true;
        return (
          <button key={i} type="button" onClick={() => onPick?.(r)} onMouseEnter={() => bridge()?.setFocus?.(name(r))} onMouseLeave={() => bridge()?.setFocus?.(null)}
            className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-left ${onPick ? "cursor-pointer" : "cursor-default"}`}>
            <span className="relative h-8 overflow-hidden rounded-md bg-surface ring-1 ring-hair">
              <span className="absolute inset-y-0 left-0 rounded-md transition-[width] duration-300" style={{ width: pct(v), background: on ? "var(--accent)" : "var(--muted)", opacity: on ? 0.28 : 0.16 }} />
              <span className={`absolute inset-y-0 left-3 right-3 flex items-center truncate text-sm ${on ? "text-ink" : "text-muted"}`}>{name(r)}</span>
            </span>
            <span className={`min-w-[4.5rem] text-right text-sm tabular-nums ${on ? "text-ink" : "text-muted"}`}>{fmt(v, format)}</span>
          </button>
        );
      })}
      {threshold !== undefined && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-[calc(4.5rem+0.75rem)] left-0">
          <div className="absolute inset-y-[-6px] border-l-2 border-dashed" style={{ left: pct(threshold), borderColor: "var(--warn)" }}>
            {thresholdLabel && <span className="absolute -top-5 left-1 whitespace-nowrap text-xs font-medium" style={{ color: "var(--warn)" }}>{thresholdLabel}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export type PickerItem = { id: string; label: string; hint?: string; badge?: string };

/** Pick one case from a list: a rail of buttons from md up, a select on a phone. */
export function Picker({ items, value, onChange, label = "Pick one" }: { items: PickerItem[]; value: string | undefined; onChange: (id: string) => void; label?: string }) {
  return (
    <div>
      <label className="md:hidden flex flex-col gap-1 text-sm text-muted">
        {label}
        <select className="rounded-lg bg-surface px-3 py-2 text-ink ring-1 ring-hair" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {items.map((it) => <option key={it.id} value={it.id}>{it.label}</option>)}
        </select>
      </label>
      <div role="listbox" aria-label={label} className="hidden md:flex flex-col gap-1.5">
        {items.map((it) => {
          const on = it.id === value;
          return (
            <button key={it.id} role="option" aria-selected={on} type="button" onClick={() => onChange(it.id)}
              className={`rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${on ? "bg-raised ring-accent" : "bg-surface/60 ring-hair hover:bg-surface"}`}>
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm ${on ? "text-ink font-medium" : "text-ink-2"}`}>{it.label}</span>
                {it.badge && <span className="shrink-0 rounded-full px-2 text-xs ring-1 ring-hair text-muted">{it.badge}</span>}
              </span>
              {it.hint && <span className="mt-0.5 block text-xs text-muted">{it.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type Column<R> = { key: keyof R & string; label?: string; format?: Format; align?: "left" | "right" };

/** A table people can search and sort; clicking a row picks it. Scrolls inside itself past `maxRows`. */
export function SearchTable<R extends Row>({ rows, columns, search, onPick, picked, maxRows = 12, placeholder = "Search" }: {
  rows: R[]; columns: Column<R>[]; search?: (keyof R & string)[]; onPick?: (r: R) => void; picked?: (r: R) => boolean; maxRows?: number; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const shown = useMemo(() => {
    const fields = search ?? columns.map((c) => c.key);
    let out = q ? rows.filter((r) => fields.some((f) => String(r[f] ?? "").toLowerCase().includes(q.toLowerCase()))) : rows;
    if (sort) out = [...out].sort((a, b) => { const x = a[sort.key], y = b[sort.key]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
    return out;
  }, [rows, q, sort, search, columns]);
  return (
    <div className="flex flex-col gap-3">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-full rounded-lg bg-surface px-3 py-2 text-sm text-ink ring-1 ring-hair placeholder:text-muted" />
      <div className="overflow-auto rounded-xl ring-1 ring-hair" style={{ maxHeight: `${2.6 + maxRows * 2.5}rem` }}>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface">
            <tr>{columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 font-medium text-muted ${c.align === "right" || c.format ? "text-right" : "text-left"}`}>
                <button type="button" onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: c.format ? -1 : 1 }))}>
                  {c.label ?? c.key}{sort?.key === c.key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
                </button>
              </th>))}</tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} onClick={() => onPick?.(r)} className={`border-t border-hair ${onPick ? "cursor-pointer hover:bg-surface" : ""} ${picked?.(r) ? "bg-surface" : ""}`}>
                {columns.map((c) => <td key={c.key} className={`px-3 py-2 ${c.align === "right" || c.format ? "text-right tabular-nums" : "text-left"} ${picked?.(r) ? "text-ink" : "text-ink-2"}`}>{c.format ? fmt(r[c.key], c.format) : String(r[c.key] ?? "")}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{q}”.</p>}
      </div>
      <p className="text-xs text-muted">{shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length}`}</p>
    </div>
  );
}

/** Switch between views of the same thing. Scrolls sideways on a phone instead of wrapping. */
export function Tabs({ tabs, value, onChange, children }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-hair">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === value} type="button" onClick={() => onChange(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${t.id === value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink-2"}`}>{t.label}</button>
        ))}
      </div>
      {children}
    </div>
  );
}
