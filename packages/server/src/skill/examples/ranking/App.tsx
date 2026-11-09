import { useParamState, useQuery, fmt } from "aurora/kit";

type City = { city: string; country: string; rent_usd: number; sun_hours: number; transit: number; safety: number; s_cost: number; s_sun: number; s_transit: number; s_safety: number; score: number };
const CRITERIA = [
  { key: "w_cost", part: "s_cost", label: "Low rent", tone: "#111111" },
  { key: "w_sun", part: "s_sun", label: "Sunshine", tone: "#5c5c5c" },
  { key: "w_transit", part: "s_transit", label: "Transit", tone: "#9a9a9a" },
  { key: "w_safety", part: "s_safety", label: "Safety", tone: "#c9c9c9" },
] as const;

function Weight({ name, label, tone }: { name: string; label: string; tone: string }) {
  const [w, setW] = useParamState<number>(name);
  return (
    <label className="grid grid-cols-[14px_1fr_2ch] items-center gap-3 py-3 border-t border-[#111]">
      <span className="h-3.5 w-3.5" style={{ background: tone }} />
      <span className="flex flex-col gap-2">
        <span className="text-sm uppercase tracking-[0.12em]">{label}</span>
        <input type="range" min={0} max={10} step={1} value={w ?? 5} onChange={(e) => setW(Number(e.target.value))} className="swiss-range w-full" />
      </span>
      <span className="font-display text-2xl tabular-nums text-right">{w ?? 5}</span>
    </label>
  );
}

/** Rank options by what matters to you: each weight is a param, the score is computed in SQL, the order re-sorts live. */
export default function App() {
  const rows = useQuery<City>("ranked");
  const top = Math.max(1e-9, ...rows.map((r) => r.score));
  return (
    <div className="min-h-screen bg-page text-ink">
      <style>{`.swiss-range{appearance:none;height:2px;background:#111}.swiss-range::-webkit-slider-thumb{appearance:none;width:14px;height:14px;background:var(--accent);border:0;border-radius:0;cursor:pointer}.swiss-range::-moz-range-thumb{width:14px;height:14px;background:var(--accent);border:0;border-radius:0}`}</style>
      <div className="mx-auto max-w-[1280px] px-5 md:px-10 py-8 md:py-12">
        <div className="grid grid-cols-12 gap-x-5 border-b-[6px] border-[#111] pb-6">
          <p className="col-span-12 md:col-span-3 text-sm uppercase tracking-[0.18em]">Relocation index<br />Eight cities</p>
          <h1 className="col-span-12 md:col-span-9 font-display text-[clamp(44px,8vw,120px)] leading-[0.88] font-bold tracking-[-0.04em]">Where should<br />you move<span style={{ color: "var(--accent)" }}>?</span></h1>
        </div>
        <div className="grid grid-cols-12 gap-x-5 gap-y-10 pt-8">
          <aside className="col-span-12 md:col-span-3 md:sticky md:top-6 self-start">
            <p className="text-sm leading-snug mb-4">Weigh what matters to you. Every city is scored 0–1 on each measure, then the weights decide the order.</p>
            {CRITERIA.map((c) => <Weight key={c.key} name={c.key} label={c.label} tone={c.tone} />)}
            <p className="border-t border-[#111] pt-3 text-xs uppercase tracking-[0.12em]">Bar length: weighted score</p>
          </aside>
          <ol className="col-span-12 md:col-span-9">
            {rows.map((r, i) => (
              <li key={r.city} className="grid grid-cols-[3.4rem_1fr] md:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1.4fr)] gap-x-5 gap-y-2 items-end border-t border-[#111] py-4 transition-all duration-500">
                <span className="font-display text-[clamp(28px,4vw,56px)] leading-none font-bold tabular-nums" style={{ color: i === 0 ? "var(--accent)" : undefined }}>{String(i + 1).padStart(2, "0")}</span>
                <span className="min-w-0">
                  <span className="block font-display text-[clamp(22px,3vw,40px)] leading-none font-bold tracking-[-0.02em] truncate">{r.city}</span>
                  <span className="block mt-1 text-xs uppercase tracking-[0.14em] text-muted">{r.country} · {fmt(r.rent_usd, "currency")}/mo · {fmt(r.sun_hours, "integer")} h sun</span>
                </span>
                <span className="col-span-2 md:col-span-1 flex h-7 items-stretch" title={`score ${fmt(r.score)}`}>
                  {CRITERIA.map((c) => <span key={c.key} className="transition-all duration-500" style={{ width: `${((r[c.part] as number) / top) * 100}%`, background: c.tone }} />)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
