import { useState } from "react";
import { ControlBar, Panel, PhaseDial, Scene, Stage, Stagger, useClock } from "aurora/kit";
import Engine from "./Engine";
import { FIRING_ORDER, STROKES, cyl, cylAt, lastFired } from "./model";

// A full-bleed 3D stage with three floating panels: what is happening (top left), the cylinder you follow
// (top right) and the controls (bottom). The scene carries the page; the panels stay small and few.
export default function App() {
  const clock = useClock({ speed: 120, period: 720 }); // degrees of crank per second; one cycle is 720°
  const [selected, setSelected] = useState<number | null>(1);
  const fired = lastFired(clock.t);
  const sel = cyl(selected ?? 1);
  const st = cylAt(sel, clock.t);
  const toNext = 90 - (cylAt(fired, clock.t).phase % 90);

  return (
    <Stage scene={<Scene camera={[10, 6.5, -13]} target={[0.6, 0.8, 0]}><Engine clock={clock} selected={selected} /></Scene>}>
      <Panel at="top-left">
        <Stagger>
          <div className="text-xs font-medium uppercase tracking-wider text-accent">V8 · cross-plane crank</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Eight cylinders, one crankshaft</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            <span className="font-semibold text-bad">Cylinder {fired.n}</span> just fired. Another fires every 90° of crank rotation, so the crank is always being pushed.
          </p>
        </Stagger>
      </Panel>

      <Panel at="top-right" className="w-72">
        <div className="flex items-center gap-4">
          <PhaseDial phases={STROKES} value={st.phase / 720} />
          <div>
            <div className="text-xs text-muted">Cylinder {sel.n} · {sel.bank < 0 ? "left" : "right"} bank</div>
            <div className="text-lg font-semibold" style={{ color: `var(${STROKES[st.stroke].color})` }}>{STROKES[st.stroke].name}</div>
            <div className="text-xs tabular-nums text-muted">{Math.round(st.phase)}° of 720°</div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">{STROKES[st.stroke].text}</p>
      </Panel>

      <Panel at="bottom">
        <ControlBar clock={clock} onStep={() => clock.step(toNext)} stepLabel="Next firing">
          <span className="text-xs text-muted">Firing order</span>
          {FIRING_ORDER.map((n) => {
            const heat = cylAt(cyl(n), clock.t).stroke === 0 ? 1 - cylAt(cyl(n), clock.t).f : 0;
            return (
              <button key={n} onClick={() => setSelected(selected === n ? null : n)} aria-label={`Follow cylinder ${n}`}
                className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold tabular-nums ring-1 ${selected === n ? "ring-2 ring-accent" : "ring-hair"}`}
                style={{ background: `color-mix(in oklab, var(--bad) ${Math.round(heat * 85)}%, var(--raised))`, color: heat > 0.5 ? "white" : "var(--ink)" }}>
                {n}
              </button>
            );
          })}
        </ControlBar>
      </Panel>
    </Stage>
  );
}
