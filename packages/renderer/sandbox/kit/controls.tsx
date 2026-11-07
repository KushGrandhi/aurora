import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
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

  return { t, ref, playing: isPlaying, speed: rate, setPlaying, setSpeed, step };
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
