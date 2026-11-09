import { useEffect, useRef, useState } from "react";
import { fmt, useParamState, useQuery } from "aurora/kit";

type Quake = { id: number; day: number; lat: number; lon: number; mag: number; depth_km: number; region: string; age: number };
type Day = { day: number; energy: number; n: number }; // energy: the day's largest magnitude
type Stat = { n: number; biggest: number; region: string; deep: number };

const W = 1000, H = 500;
const x = (lon: number) => ((lon + 180) / 360) * W;
const y = (lat: number) => ((90 - lat) / 180) * H;
const date = (d: number) => new Date(Date.UTC(2025, 0, d)).toISOString().slice(0, 10);

/** Scrub through time and space: the day is a param (play it, or drag the seismograph), the magnitude floor another. */
export default function App() {
  const [day, setDay] = useParamState<number>("day");
  const [minmag, setMinmag] = useParamState<number>("minmag");
  const quakes = useQuery<Quake>("window");
  const days = useQuery<Day>("daily");
  const history = useQuery<{ lat: number; lon: number }>("history");
  const stat = useQuery<Stat>("stats")[0];
  const [playing, setPlaying] = useState(false);
  const strip = useRef<SVGSVGElement>(null);
  const d = day ?? 365;

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setDay(d >= 365 ? 30 : Math.min(365, d + 3)), 140);
    return () => clearInterval(t);
  }, [playing, d]);

  const top = Math.max(4.5, ...days.map((r) => r.energy));
  const amp = (m: number) => Math.max(0.06, (m - 4.3) / (top - 4.3)) * 28;
  const scrub = (e: React.PointerEvent) => {
    const r = strip.current!.getBoundingClientRect();
    setDay(Math.max(1, Math.min(365, Math.round(((e.clientX - r.left) / r.width) * 364) + 1)));
  };

  return (
    <div className="relative min-h-screen bg-page text-ink font-body overflow-hidden">
      <style>{`
        .scan{background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px);mix-blend-mode:multiply}
        @keyframes ping{from{r:4;opacity:.9}to{r:22;opacity:0}}
        .ping{animation:ping 1.6s ease-out infinite}
        @media (prefers-reduced-motion: reduce){.ping{animation:none;opacity:0}}
        .glow{filter:drop-shadow(0 0 4px var(--accent))}
      `}</style>
      <div className="pointer-events-none absolute inset-0 scan z-10" />
      <div className="relative mx-auto max-w-[1280px] px-4 md:px-8 py-6 md:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[color-mix(in_oklab,var(--accent),transparent_70%)] pb-4">
          <div>
            <p className="text-xs tracking-[0.3em] text-muted">SEISMIC NETWORK // GLOBAL // M{fmt(minmag)}+</p>
            <h1 className="font-display text-[clamp(30px,5vw,64px)] leading-none mt-2 glow" style={{ color: "var(--accent)" }}>THE PLANET, SHAKING</h1>
          </div>
          <div className="grid grid-cols-3 gap-6 text-right">
            <div><div className="text-xs text-muted">DATE</div><div className="font-display text-2xl">{date(d)}</div></div>
            <div><div className="text-xs text-muted">LAST 30 DAYS</div><div className="font-display text-2xl">{fmt(stat?.n ?? 0, "integer")}</div></div>
            <div><div className="text-xs text-muted">LARGEST</div><div className="font-display text-2xl" style={{ color: "var(--warn)" }}>M{fmt(stat?.biggest ?? 0)}</div></div>
          </div>
        </header>

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto mt-4" role="img" aria-label="earthquakes on a world grid">
          {[-60, -30, 0, 30, 60].map((lat) => <line key={lat} x1={0} x2={W} y1={y(lat)} y2={y(lat)} stroke="var(--accent)" strokeOpacity={lat === 0 ? 0.35 : 0.12} strokeDasharray="2 6" />)}
          {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map((lon) => <line key={lon} y1={0} y2={H} x1={x(lon)} x2={x(lon)} stroke="var(--accent)" strokeOpacity={0.1} strokeDasharray="2 6" />)}
          {history.map((q, i) => <circle key={`h${i}`} cx={x(q.lon)} cy={y(q.lat)} r={1.5} fill="var(--accent)" fillOpacity={0.3} />)}
          {quakes.map((q) => {
            const r = 1.2 + (q.mag - 4) ** 1.8;
            const fresh = q.age <= 3;
            return (
              <g key={q.id} transform={`translate(${x(q.lon)},${y(q.lat)})`}>
                {fresh && <circle className="ping" r={4} fill="none" stroke="var(--accent)" strokeWidth={1.2} />}
                <circle r={r} fill={q.mag >= 7 ? "var(--warn)" : "var(--accent)"} fillOpacity={Math.max(0.15, 1 - q.age / 30)} className={fresh ? "glow" : undefined}>
                  <title>{`M${q.mag} · ${q.region} · ${q.depth_km} km deep · ${date(q.day)}`}</title>
                </circle>
              </g>
            );
          })}
          {stat && <text x={8} y={H - 10} fontSize={13} fill="var(--accent)" fillOpacity={0.7} fontFamily="var(--font-body)">{`largest: ${stat.region} · ${fmt(stat.deep, "integer")} km deep`}</text>}
        </svg>

        <div className="mt-4 grid gap-4 md:grid-cols-[auto_minmax(0,1fr)_220px] items-center">
          <button type="button" onClick={() => setPlaying((p) => !p)} className="px-4 py-2 border text-sm tracking-[0.2em]" style={{ borderColor: "var(--accent)", color: "var(--accent)" }}>{playing ? "■ STOP" : "▶ PLAY YEAR"}</button>
          <svg ref={strip} viewBox="0 0 365 60" preserveAspectRatio="none" className="w-full h-16 cursor-ew-resize touch-none" onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); scrub(e); }} onPointerMove={(e) => e.buttons && scrub(e)} role="slider" aria-label="day of the year" aria-valuemin={1} aria-valuemax={365} aria-valuenow={d}>
            {days.map((r) => <line key={r.day} x1={r.day - 0.5} x2={r.day - 0.5} y1={30 - amp(r.energy)} y2={30 + amp(r.energy)} stroke="var(--accent)" strokeOpacity={r.day <= d ? 0.9 : 0.35} strokeWidth={0.8} />)}
            <rect x={d - 30} y={0} width={30} height={60} fill="var(--accent)" fillOpacity={0.08} />
            <line x1={d} x2={d} y1={0} y2={60} stroke="var(--warn)" strokeWidth={1.5} />
          </svg>
          <label className="text-xs tracking-[0.2em] text-muted flex flex-col gap-2">MIN MAGNITUDE <b className="font-display text-xl text-ink">M{fmt(minmag)}</b>
            <input type="range" min={4.5} max={7} step={0.1} value={minmag ?? 5} onChange={(e) => setMinmag(Number(e.target.value))} style={{ accentColor: "var(--accent)" }} />
          </label>
        </div>
      </div>
    </div>
  );
}
