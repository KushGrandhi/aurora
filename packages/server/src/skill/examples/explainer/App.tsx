import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Pause, Play, SkipForward } from "lucide-react";
import Engine from "./Engine";
import { CYCLE, STAGES, engineAt } from "./model";

// Layout: the drawing takes the width, a control panel sits beside it (below it on phones).
export default function App() {
  const [deg, setDeg] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(!matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [speed, setSpeed] = useState(150); // degrees per second
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // One animation loop. dt is clamped to 0..50ms: the first frame can be negative and a hidden tab can be huge.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      setT((x) => x + dt);
      if (playing) setDeg((d) => (d + dt * speedRef.current) % CYCLE);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const e = engineAt(deg);
  const stage = STAGES[e.stage];
  const jump = (i: number) => { setDeg(i * 180 + 2); setPlaying(false); };

  return (
    <div className="bg-page p-4 text-ink md:p-6">
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-hair">
          <Engine deg={deg} t={t} />
        </div>

        <aside className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPlaying(!playing)} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              {playing ? <Pause size={16} /> : <Play size={16} />} {playing ? "Pause" : "Play"}
            </button>
            <button onClick={() => jump((e.stage + 1) % 4)} className="inline-flex items-center gap-2 rounded-xl bg-raised px-4 py-2 text-sm font-medium ring-1 ring-hair hover:bg-surface">
              <SkipForward size={16} /> Next step
            </button>
          </div>

          <label className="block text-sm text-ink-2">
            Speed
            <input type="range" min={20} max={1200} value={speed} onChange={(ev) => setSpeed(+ev.target.value)} className="mt-1 w-full" style={{ accentColor: "var(--accent)" }} />
          </label>

          {/* stage switcher doubles as the legend: the same colours as the drawing */}
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-raised p-1 ring-1 ring-hair">
            {STAGES.map((s, i) => (
              <button key={s.name} onClick={() => jump(i)} className={`rounded-lg px-1 py-1.5 text-xs font-medium transition-colors ${i === e.stage ? "text-white" : "text-ink-2 hover:bg-surface"}`} style={i === e.stage ? { background: s.color } : undefined}>
                {s.name}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div key={stage.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-hair">
              <div className="text-xs font-medium uppercase tracking-wider" style={{ color: stage.color }}>Step {e.stage + 1} of 4</div>
              <div className="mt-1 text-xl font-semibold tracking-tight">{stage.name}</div>
              <p className="mt-2 text-sm leading-relaxed text-ink-2">{stage.text}</p>
            </motion.div>
          </AnimatePresence>

          {/* live readouts: what is true right now */}
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {[["Intake valve", e.intakeLift > 0.5 ? "open" : "closed"], ["Exhaust valve", e.exhaustLift > 0.5 ? "open" : "closed"], ["Spark", e.spark ? "firing" : "off"], ["Crank turn", `${e.deg < 360 ? 1 : 2} of 2`]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-raised px-3 py-2 ring-1 ring-hair">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="font-medium tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
