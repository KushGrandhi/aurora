import { fmt, useParamState, useQuery } from "aurora/kit";

type Use = { activity: string; label: string; litres: number; color: string; ord: number };
type Sum = { total: number; average: number; bathtubs: number };

const HABITS = [
  { name: "shower_min", label: "Minutes in the shower", emoji: "🚿", step: 1, max: 30 },
  { name: "flushes", label: "Toilet flushes", emoji: "🚽", step: 1, max: 15 },
  { name: "dish_loads", label: "Sinks of washing-up", emoji: "🍽️", step: 1, max: 6 },
  { name: "laundry_week", label: "Laundry loads a week", emoji: "🧺", step: 1, max: 12 },
  { name: "garden_min", label: "Minutes watering plants", emoji: "🌱", step: 5, max: 60 },
];

function Stepper({ name, label, emoji, step, max }: (typeof HABITS)[number]) {
  const [v, setV] = useParamState<number>(name);
  const n = v ?? 0;
  return (
    <div className="flex items-center gap-3 rounded-[28px] bg-white/70 px-4 py-3 shadow-[0_4px_0_rgba(27,42,107,0.18)]">
      <span className="text-3xl" aria-hidden>{emoji}</span>
      <span className="flex-1 font-body font-bold text-[15px] leading-tight">{label}</span>
      <button type="button" aria-label={`less ${label}`} onClick={() => setV(Math.max(0, n - step))} className="h-11 w-11 rounded-full bg-[var(--ink)] text-white font-display text-2xl leading-none active:translate-y-0.5">–</button>
      <span className="w-10 text-center font-display text-3xl tabular-nums">{n}</span>
      <button type="button" aria-label={`more ${label}`} onClick={() => setV(Math.min(max, n + step))} className="h-11 w-11 rounded-full bg-[var(--accent)] text-white font-display text-2xl leading-none active:translate-y-0.5">+</button>
    </div>
  );
}

/** A personal what-if with a picture: each habit is a param, the litres are computed in SQL, the tank fills as you change them. */
export default function App() {
  const uses = useQuery<Use>("uses");
  const sum = useQuery<Sum>("total")[0];
  const cap = Math.max(300, (sum?.total ?? 0) * 1.15, (sum?.average ?? 0) * 1.3);
  const TOP = 40, BOTTOM = 440, HGT = BOTTOM - TOP;
  const yOf = (l: number) => BOTTOM - (l / cap) * HGT;
  let acc = 0;

  return (
    <div className="min-h-screen bg-page text-ink overflow-hidden">
      <style>{`@keyframes slosh{0%,100%{transform:translateX(0)}50%{transform:translateX(-40px)}} .wave{animation:slosh 4s ease-in-out infinite} @media (prefers-reduced-motion: reduce){.wave{animation:none}}`}</style>
      <div className="mx-auto max-w-[1180px] px-5 md:px-10 py-10">
        <h1 className="font-display text-[clamp(44px,7vw,92px)] leading-[0.95] font-semibold">How much water<br />is <span className="inline-block -rotate-2 rounded-2xl bg-[var(--accent)] px-3 text-white">your day?</span></h1>
        <p className="mt-4 max-w-xl font-body text-lg font-semibold opacity-80">Tap the buttons to match your habits. The tank fills with every litre.</p>

        <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center">
          <div className="flex flex-col gap-3">{HABITS.map((h) => <Stepper key={h.name} {...h} />)}</div>

          <figure className="relative mx-auto w-full max-w-[420px]">
            <p className="text-center"><span className="font-display text-[72px] leading-none font-semibold">{fmt(sum?.total ?? 0, "integer")}</span> <span className="font-body font-extrabold text-xl">litres a day</span></p>
            <svg viewBox="0 0 360 480" className="w-full h-auto" role="img" aria-label={`${fmt(sum?.total ?? 0, "integer")} litres a day`}>
              <defs><clipPath id="tank"><rect x={40} y={TOP} width={280} height={HGT} rx={48} /></clipPath></defs>
              <rect x={40} y={TOP} width={280} height={HGT} rx={48} fill="#ffffff" fillOpacity={0.55} />
              <g clipPath="url(#tank)">
                {uses.map((u) => {
                  const y0 = yOf(acc), y1 = yOf((acc += u.litres));
                  return <rect key={u.activity} x={40} y={y1} width={280} height={Math.max(0, y0 - y1)} fill={u.color} style={{ transition: "y .5s, height .5s" }} />;
                })}
                <path className="wave" d={`M0 ${yOf(acc) + 2} q 30 -14 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 V ${yOf(acc) + 18} H 0 Z`} fill="#ffffff" fillOpacity={0.45} style={{ transition: "d .5s" }} />
              </g>
              <rect x={40} y={TOP} width={280} height={HGT} rx={48} fill="none" stroke="var(--ink)" strokeWidth={6} />
              {sum && <g>
                <line x1={24} x2={336} y1={yOf(sum.average)} y2={yOf(sum.average)} stroke="var(--ink)" strokeWidth={3} strokeDasharray="10 8" />
                <text x={336} y={yOf(sum.average) - 8} textAnchor="end" fontSize={15} fontWeight={800} fill="var(--ink)" className="font-body">average person</text>
              </g>}
            </svg>
            {sum && <p className="mt-2 text-center font-body font-bold">That's about {fmt(sum.bathtubs)} bathtubs a week. {sum.total > sum.average ? "A bit above the average person." : "Less than the average person. Nice!"}</p>}
          </figure>
        </div>

        <ul className="mt-10 flex flex-wrap gap-3 font-body font-bold text-sm">
          {uses.map((u) => <li key={u.activity} className="flex items-center gap-2 rounded-full bg-white/70 px-3 py-1"><span className="h-3 w-3 rounded-full" style={{ background: u.color }} />{u.label} · {fmt(u.litres, "integer")} L</li>)}
        </ul>
      </div>
    </div>
  );
}
