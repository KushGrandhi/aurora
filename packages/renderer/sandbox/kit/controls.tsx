import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Pause, Play, SkipForward } from "lucide-react";

const wrap = (v: number, period?: number) => (period ? ((v % period) + period) % period : v);

export type Clock = {
  t: number;
  ref: MutableRefObject<number>;
  playing: boolean;
  speed: number;
  setPlaying(b: boolean): void;
  setSpeed(n: number): void;
  step(by: number): void;
  /** Jump to a time (wrapped at `period`). */
  seek(t: number): void;
  /** Where time wraps, if it does (one cycle). */
  period?: number;
};

/**
 * Time for an animation: `t` advances by `speed` units per second while playing and wraps at `period`. React sees `t`
 * at most every 50 ms; inside a 3D `useFrame`, read `clock.ref.current` for the exact value every frame.
 */
export function useClock({ speed = 1, playing = true, period }: { speed?: number; playing?: boolean; period?: number } = {}): Clock {
  const ref = useRef(0);
  const [t, setT] = useState(0);
  const [isPlaying, setPlaying] = useState(playing);
  const [rate, setSpeed] = useState(speed);
  const live = useRef({ isPlaying, rate });
  live.current = { isPlaying, rate };

  useEffect(() => {
    let raf = 0, last = performance.now(), told = 0;
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (live.current.isPlaying) ref.current = wrap(ref.current + dt * live.current.rate, period);
      if (now - told > 50) ((told = now), setT(ref.current));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [period]);

  const step = useCallback((by: number) => {
    ref.current = wrap(ref.current + by, period);
    setT(ref.current);
  }, [period]);

  const seek = useCallback((to: number) => {
    ref.current = wrap(to, period);
    setT(ref.current);
  }, [period]);

  return { t, ref, playing: isPlaying, speed: rate, setPlaying, setSpeed, step, seek, period };
}

/** Play/pause, an optional step button, a speed switch, and room for your own chips. */
export function ControlBar({ clock, speeds, onStep, stepLabel = "Step", children }: {
  clock: Clock;
  speeds?: { label: string; value: number }[];
  onStep?: () => void;
  stepLabel?: string;
  children?: ReactNode;
}) {
  const [base] = useState(clock.speed);
  const options = speeds ?? [{ label: "Slow", value: base / 3 }, { label: "Normal", value: base }, { label: "Fast", value: base * 3 }];
  return (
    <div data-kit-controls className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => clock.setPlaying(!clock.playing)}
          aria-label={clock.playing ? "Pause" : "Play"}
          className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white shadow-card transition hover:opacity-90"
        >
          {clock.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        {onStep && (
          <button onClick={onStep} className="flex h-9 items-center gap-1.5 rounded-xl bg-raised px-3 text-sm font-medium ring-1 ring-hair transition hover:bg-page">
            <SkipForward size={14} /> {stepLabel}
          </button>
        )}
        <div className="flex rounded-xl bg-raised p-1 ring-1 ring-hair" role="group" aria-label="Speed">
          {options.map((o) => (
            <button key={o.label} onClick={() => clock.setSpeed(o.value)} className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${clock.speed === o.value ? "bg-ink text-page" : "text-ink-2"}`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {children && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/**
 * A timeline for a clock with a `period`: drag along it to scrub (the animation pauses while you hold it), click a
 * mark to jump to that moment, or use the arrow keys. Marks name the moments that matter ("ignition", "valve opens").
 */
export function Scrubber({ clock, marks = [], label = "Time" }: { clock: Clock; marks?: { at: number; label: string }[]; label?: string }) {
  const period = clock.period ?? 1;
  const track = useRef<HTMLDivElement>(null);
  const held = useRef<{ wasPlaying: boolean } | undefined>();
  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(0.9999, Math.max(0, (clientX - r.left) / r.width)) * period;
  };
  const frac = (clock.t % period) / period;
  // Labels of moments close together go on separate rows, so none covers another.
  const labelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [rows, setRows] = useState<number[]>([]);
  const marksKey = marks.map((m) => `${m.at}:${m.label}`).join("|");
  useLayoutEffect(() => {
    const place = () => {
      const ends: number[] = []; // per row, the right edge of its last label
      const next = marks.map((_, i) => i).sort((a, b) => marks[a].at - marks[b].at).reduce<number[]>((acc, i) => {
        const r = labelRefs.current[i]?.getBoundingClientRect();
        if (!r) return acc;
        let row = ends.findIndex((end) => r.left > end + 8);
        if (row < 0) row = ends.length;
        ends[row] = r.right;
        acc[i] = row;
        return acc;
      }, []);
      setRows((old) => (old.join() === next.join() ? old : next));
    };
    place();
    const ro = new ResizeObserver(place);
    if (track.current) ro.observe(track.current);
    return () => ro.disconnect();
  }, [marksKey]);
  const rowCount = Math.max(1, ...rows.map((r) => (r ?? 0) + 1));
  return (
    <div data-kit-scrubber className="mb-2 w-full select-none pt-1" style={{ paddingBottom: 14 + rowCount * 22 }}>
      <div ref={track} role="slider" tabIndex={0} aria-label={label} aria-valuemin={0} aria-valuemax={period} aria-valuenow={Math.round(clock.t)}
        className="relative h-6 cursor-pointer touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-full"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); held.current = { wasPlaying: clock.playing }; clock.setPlaying(false); clock.seek(at(e.clientX)); }}
        onPointerMove={(e) => { if (held.current) clock.seek(at(e.clientX)); }}
        onPointerUp={() => { if (held.current?.wasPlaying) clock.setPlaying(true); held.current = undefined; }}
        onKeyDown={(e) => {
          const by = period / 72;
          if (e.key === "ArrowRight") { e.preventDefault(); clock.setPlaying(false); clock.seek(clock.ref.current + by); }
          if (e.key === "ArrowLeft") { e.preventDefault(); clock.setPlaying(false); clock.seek(clock.ref.current - by); }
        }}>
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-ink/10" />
        <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-accent" style={{ width: `${frac * 100}%` }} />
        <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-card ring-4 ring-accent/20" style={{ left: `${frac * 100}%` }} />
      </div>
      <div className="relative h-0">
        {marks.map((m, i) => (
          <button key={m.label} ref={(el) => { labelRefs.current[i] = el; }} onClick={() => { clock.setPlaying(false); clock.seek(m.at); }} aria-label={m.label}
            className="absolute -translate-x-1/2 whitespace-nowrap text-xs leading-4 text-muted transition hover:text-ink" style={{ left: `${(m.at / period) * 100}%`, top: 12 + (rows[i] ?? 0) * 22 }}>
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-0.5 w-px bg-ink/30" style={{ height: 6 + (rows[i] ?? 0) * 22 }} />{m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
