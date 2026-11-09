import { useRef } from "react";
import { fmt, useParamState, useQuery } from "aurora/kit";

type Hour = { hour: number; solar: number; wind: number; hydro: number; gas: number; imports: number; total: number };
type Now = Hour & { clean_share: number; peak_hour: number; peak_mw: number };
const SOURCES = [
  { key: "solar", label: "SOLAR", color: "var(--accent)" },
  { key: "wind", label: "WIND", color: "#f4ffb0" },
  { key: "hydro", label: "HYDRO", color: "#9fb4ff" },
  { key: "gas", label: "GAS", color: "#7a7a7a" },
  { key: "imports", label: "IMPORTS", color: "#3d3d3d" },
] as const;

const C = 300, R0 = 92, R1 = 270;
const polar = (h: number, r: number) => { const a = (h / 24) * 2 * Math.PI - Math.PI / 2; return [C + Math.cos(a) * r, C + Math.sin(a) * r]; };
function wedge(h: number, r0: number, r1: number) {
  const [a, b] = [h - 0.44, h + 0.44].map((t) => t);
  const [x0, y0] = polar(a, r0), [x1, y1] = polar(a, r1), [x2, y2] = polar(b, r1), [x3, y3] = polar(b, r0);
  return `M${x0},${y0} L${x1},${y1} A${r1},${r1} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0} Z`;
}

/** Explore a cycle: drag the hand around the day (the hour is a param), switch the season, read the mix at that hour. */
export default function App() {
  const [hour, setHour] = useParamState<number>("hour");
  const [season, setSeason] = useParamState<string>("season");
  const day = useQuery<Hour>("day");
  const now = useQuery<Now>("at_hour")[0];
  const svg = useRef<SVGSVGElement>(null);
  const h = hour ?? 18;
  const max = Math.max(1, ...day.map((d) => d.total));
  const scale = (mw: number) => (mw / max) * (R1 - R0);

  const drag = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) + Math.PI / 2;
    setHour(((Math.round((a / (2 * Math.PI)) * 24) % 24) + 24) % 24);
  };

  return (
    <div className="min-h-screen bg-page text-ink font-body">
      <div className="mx-auto max-w-[1300px] px-5 md:px-10 py-8">
        <header className="flex flex-wrap items-end justify-between gap-6 border-b-[10px] border-[var(--accent)] pb-4">
          <h1 className="font-display uppercase leading-[0.82] text-[clamp(56px,11vw,168px)] tracking-[-0.01em]">A day of<br /><span style={{ color: "var(--accent)" }}>power</span></h1>
          <div className="flex gap-0" role="group" aria-label="season">
            {["summer", "winter"].map((s) => (
              <button key={s} type="button" onClick={() => setSeason(s)} className="font-display uppercase text-3xl px-6 py-3 border-[3px] border-[var(--accent)] -ml-[3px]"
                style={{ background: season === s ? "var(--accent)" : "transparent", color: season === s ? "var(--page)" : "var(--accent)" }}>{s}</button>
            ))}
          </div>
        </header>

        <div className="grid gap-10 mt-8 lg:grid-cols-[minmax(0,620px)_minmax(0,1fr)] items-center">
          <svg ref={svg} viewBox="0 0 600 600" className="w-full h-auto touch-none cursor-grab select-none" onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag(e); }} onPointerMove={(e) => e.buttons && drag(e)}
            role="slider" aria-label="hour of the day" aria-valuemin={0} aria-valuemax={23} aria-valuenow={h} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowRight") setHour((h + 1) % 24); if (e.key === "ArrowLeft") setHour((h + 23) % 24); }}>
            {day.map((d) => {
              let r = R0;
              return (
                <g key={d.hour} opacity={d.hour === h ? 1 : 0.55}>
                  {SOURCES.map((s) => { const r0 = r; r += scale(d[s.key]); return <path key={s.key} d={wedge(d.hour, r0, r)} fill={s.color} />; })}
                </g>
              );
            })}
            {[0, 6, 12, 18].map((t) => { const [x, y] = polar(t, R1 + 20); return <text key={t} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={18} fill="var(--ink)" className="font-display">{String(t).padStart(2, "0")}</text>; })}
            {(() => { const [x, y] = polar(h, R1 + 4); return <line x1={C} y1={C} x2={x} y2={y} stroke="var(--ink)" strokeWidth={3} />; })()}
            <circle cx={C} cy={C} r={R0 - 6} fill="var(--page)" stroke="var(--accent)" strokeWidth={3} />
            <text x={C} y={C - 10} textAnchor="middle" fontSize={64} className="font-display" fill="var(--ink)">{String(h).padStart(2, "0")}:00</text>
            <text x={C} y={C + 30} textAnchor="middle" fontSize={16} fill="var(--accent)" className="font-body">{now ? `${fmt(now.total, "integer")} MW` : ""}</text>
          </svg>

          <div>
            {now && (
              <>
                <p className="uppercase tracking-[0.2em] text-sm">At {String(h).padStart(2, "0")}:00 on a {season} day</p>
                <p className="font-display uppercase leading-none text-[clamp(64px,9vw,140px)]" style={{ color: "var(--accent)" }}>{fmt(now.clean_share, "percent")}</p>
                <p className="uppercase tracking-[0.2em] text-sm -mt-1">from clean sources</p>
                <ul className="mt-8 border-t-[3px] border-[var(--ink)]">
                  {SOURCES.map((s) => (
                    <li key={s.key} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b-[3px] border-[var(--ink)] py-2">
                      <span className="flex items-center gap-3"><span className="inline-block h-5 w-5" style={{ background: s.color }} /><span className="font-display text-3xl uppercase">{s.label}</span></span>
                      <span className="font-display text-3xl tabular-nums">{fmt(now[s.key], "integer")}<span className="text-base ml-1">MW</span></span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-sm uppercase tracking-[0.15em] opacity-70">Peak at {String(now.peak_hour).padStart(2, "0")}:00 · {fmt(now.peak_mw, "integer")} MW · drag the hand or use ← →</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
