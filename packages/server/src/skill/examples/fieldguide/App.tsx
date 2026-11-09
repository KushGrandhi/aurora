import { useMemo, useState } from "react";
import { fmt, useParamState, useQuery } from "aurora/kit";

type Tea = { id: string; name: string; kind: string; origin: string; caffeine_mg: number; temp_c: number; steep_min: number; no: number };
type Note = { note: string; score: number; family_avg: number };
const KINDS = ["green", "white", "oolong", "black", "pu-erh", "herbal"];

/** A leaf drawn from the tea's family: rounder for white, longer for green, curled for oolong, broad for black. */
function Leaf({ kind, size = 64, color = "var(--accent)" }: { kind: string; size?: number; color?: string }) {
  const shapes: Record<string, string> = {
    green: "M32 4 C46 18 48 40 32 60 C16 40 18 18 32 4 Z",
    white: "M32 8 C52 20 52 44 32 58 C12 44 12 20 32 8 Z",
    oolong: "M18 54 C8 30 26 6 46 10 C58 26 44 50 18 54 Z",
    black: "M32 4 C54 16 56 46 32 60 C8 46 10 16 32 4 Z",
    "pu-erh": "M32 6 A26 26 0 1 1 31.9 6 Z",
    herbal: "M32 6 C40 18 52 20 50 32 C48 46 38 50 32 60 C26 50 16 46 14 32 C12 20 24 18 32 6 Z",
  };
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <path d={shapes[kind] ?? shapes.green} fill="none" stroke={color} strokeWidth={1.4} />
      <path d="M32 8 L32 58" stroke={color} strokeWidth={0.9} strokeOpacity={0.7} />
      {[16, 26, 36, 46].map((yy) => <path key={yy} d={`M32 ${yy} Q${kind === "oolong" ? 24 : 22} ${yy - 4} ${kind === "pu-erh" ? 14 : 18} ${yy - 6} M32 ${yy} Q42 ${yy - 4} 46 ${yy - 6}`} stroke={color} strokeWidth={0.7} strokeOpacity={0.55} fill="none" />)}
    </svg>
  );
}

/** The flavour wheel: this tea in gold over its family's average in pink. */
function Wheel({ notes }: { notes: Note[] }) {
  const n = notes.length || 1, R = 120, cx = 150, cy = 150;
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + (i / n) * 2 * Math.PI; return [cx + Math.cos(a) * R * (v / 5), cy + Math.sin(a) * R * (v / 5)]; };
  const poly = (k: "score" | "family_avg") => notes.map((d, i) => pt(i, d[k]).join(",")).join(" ");
  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-[340px] h-auto" role="img" aria-label="flavour wheel">
      {[1, 2, 3, 4, 5].map((r) => <polygon key={r} points={notes.map((_, i) => pt(i, r).join(",")).join(" ")} fill="none" stroke="var(--ink)" strokeOpacity={0.12} />)}
      {notes.map((d, i) => { const [x, y] = pt(i, 5.9); return <text key={d.note} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="var(--ink)" fillOpacity={0.75} className="font-body italic">{d.note}</text>; })}
      <polygon points={poly("family_avg")} fill="var(--s2)" fillOpacity={0.18} stroke="var(--s2)" strokeDasharray="3 3" />
      <polygon points={poly("score")} fill="var(--accent)" fillOpacity={0.22} stroke="var(--accent)" strokeWidth={1.6} />
    </svg>
  );
}

/** Look things up and compare: the family filter and the picked specimen are params; search narrows the plate here. */
export default function App() {
  const [pick, setPick] = useParamState<string>("pick");
  const [kind, setKind] = useParamState<string | null>("kind");
  const teas = useQuery<Tea>("teas");
  const notes = useQuery<Note>("profile");
  const [q, setQ] = useState("");
  const shown = useMemo(() => teas.filter((t) => !q || `${t.name} ${t.origin}`.toLowerCase().includes(q.toLowerCase())), [teas, q]);
  const cur = teas.find((t) => t.id === pick);

  return (
    <div className="min-h-screen bg-page text-ink">
      <div className="mx-auto max-w-[1240px] px-5 md:px-10 py-10 md:py-14">
        <header className="grid gap-6 md:grid-cols-[1fr_auto] items-end border-b border-[color-mix(in_oklab,var(--accent),transparent_55%)] pb-6">
          <div>
            <p className="font-body text-xs tracking-[0.35em] uppercase" style={{ color: "var(--accent)" }}>Plate II · Camellia sinensis & friends</p>
            <h1 className="font-display italic text-[clamp(44px,7vw,96px)] leading-[0.9] mt-3">A field guide<br />to tea</h1>
          </div>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tea or a place" className="w-full md:w-72 bg-transparent border-b border-[var(--accent)] py-2 font-body text-sm placeholder:text-[color-mix(in_oklab,var(--ink),transparent_50%)] focus:outline-none" />
        </header>

        <nav className="flex flex-wrap gap-2 mt-6" aria-label="families">
          {[null, ...KINDS].map((k) => (
            <button key={k ?? "all"} type="button" onClick={() => setKind(k)} className="font-body text-sm px-3 py-1 rounded-full border transition-colors"
              style={{ borderColor: "var(--accent)", background: (kind ?? null) === k ? "var(--accent)" : "transparent", color: (kind ?? null) === k ? "var(--page)" : "var(--ink)" }}>{k ?? "all families"}</button>
          ))}
        </nav>

        <div className="grid gap-10 mt-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-[color-mix(in_oklab,var(--accent),transparent_70%)] self-start">
            {shown.map((t) => (
              <li key={t.id} className="bg-page">
                <button type="button" onClick={() => setPick(t.id)} className="w-full p-4 text-left flex flex-col items-center gap-2 transition-colors" style={{ background: t.id === pick ? "color-mix(in oklab, var(--accent), transparent 85%)" : undefined }}>
                  <span className="self-start font-body text-[10px] tracking-[0.25em]" style={{ color: "var(--accent)" }}>No. {String(t.no).padStart(2, "0")}</span>
                  <Leaf kind={t.kind} size={58} color={t.id === pick ? "var(--accent)" : "var(--ink)"} />
                  <span className="font-display italic text-lg leading-tight text-center">{t.name}</span>
                  <span className="font-body text-[11px] uppercase tracking-[0.15em] opacity-60">{t.kind}</span>
                </button>
              </li>
            ))}
            {shown.length === 0 && <li className="bg-page p-6 col-span-full font-body text-sm opacity-70">No tea matches “{q}”.</li>}
          </ol>

          {cur && (
            <article className="md:sticky md:top-8 self-start">
              <p className="font-body text-xs tracking-[0.3em] uppercase opacity-70">{cur.kind} · {cur.origin}</p>
              <h2 className="font-display italic text-5xl leading-none mt-2" style={{ color: "var(--accent)" }}>{cur.name}</h2>
              <div className="mt-6 flex flex-col items-center"><Wheel notes={notes} /></div>
              <p className="font-body text-xs text-center opacity-70 -mt-2"><span style={{ color: "var(--accent)" }}>━</span> this tea &nbsp; <span style={{ color: "var(--s2)" }}>┅</span> {cur.kind} average</p>
              <dl className="grid grid-cols-3 gap-4 mt-8 border-t border-[color-mix(in_oklab,var(--accent),transparent_55%)] pt-5 font-body">
                <div><dt className="text-[11px] uppercase tracking-[0.2em] opacity-60">Water</dt><dd className="font-display text-3xl">{fmt(cur.temp_c, "integer")}°</dd></div>
                <div><dt className="text-[11px] uppercase tracking-[0.2em] opacity-60">Steep</dt><dd className="font-display text-3xl">{fmt(cur.steep_min)}′</dd></div>
                <div><dt className="text-[11px] uppercase tracking-[0.2em] opacity-60">Caffeine</dt><dd className="font-display text-3xl">{fmt(cur.caffeine_mg, "integer")}<span className="text-base"> mg</span></dd></div>
              </dl>
            </article>
          )}
        </div>
      </div>
    </div>
  );
}
