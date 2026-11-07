import { useEffect, useState } from "react";
import { ControlBar, Panel, PhaseDial, Scene, Scrubber, Stage, Stagger, useClock, useStory } from "aurora/kit";
import Engine from "./Engine";
import { FIRING_ORDER, STROKES, cyl, cylAt, lastFired } from "./model";

// The pinned visual of a story: a full-bleed 3D stage. Each step of the story (scrolling past on the left) sends a
// `state`: which cylinder to follow, which stroke to freeze on, or `play` to run the whole engine. The steps carry the
// words, so the stage shows only what changes (the followed cylinder's stroke) and the controls for exploring freely.
type Step = { cylinder?: number; stroke?: number; play?: boolean };

export default function App() {
  const clock = useClock({ speed: 120, period: 720 }); // degrees of crank per second; one cycle is 720°
  const [selected, setSelected] = useState<number | null>(1);
  const story = useStory();
  useEffect(() => {
    const s = story?.state as Step | undefined;
    if (!s) return;
    const c = cyl(s.cylinder ?? selected ?? 1);
    if (s.cylinder) setSelected(s.cylinder);
    if (s.stroke !== undefined) clock.seek(c.fire + 180 * s.stroke + 100); // just past the start of that stroke
    clock.setPlaying(!!s.play);
  }, [story?.index]);
  const fired = lastFired(clock.t);
  const sel = cyl(selected ?? 1);
  const st = cylAt(sel, clock.t);
  const toNext = 90 - (cylAt(fired, clock.t).phase % 90);

  return (
    <Stage scene={<Scene camera={[10, 6.5, -13]} target={[0.6, 0.8, 0]}><Engine clock={clock} selected={selected} /></Scene>}>
      <Panel at="top-right" className="w-80">
        {!story && (
          <Stagger>
            <p className="mb-5 text-[15px] leading-relaxed text-ink-2">
              <span className="font-semibold text-bad">Cylinder {fired.n}</span> just fired. Another fires every 90° of crank rotation, so the crank is always being pushed.
            </p>
          </Stagger>
        )}
        <div className="flex items-center gap-4">
          <PhaseDial phases={STROKES} value={st.phase / 720} />
          <div>
            <div className="text-xs text-muted">Cylinder {sel.n} · {sel.bank < 0 ? "left" : "right"} bank</div>
            <div className="text-lg font-semibold" style={{ color: `var(${STROKES[st.stroke].color})` }}>{STROKES[st.stroke].name}</div>
            <div className="text-xs tabular-nums text-muted">{Math.round(st.phase)}° of 720°</div>
          </div>
        </div>
        {!story && <p className="mt-3 text-sm leading-relaxed text-ink-2">{STROKES[st.stroke].text}</p>}
      </Panel>

      <Panel at="bottom" glass>
        {/* The timeline of one cycle, with the moments the followed cylinder changes stroke marked on it. */}
        <Scrubber clock={clock} label="Crank angle" marks={STROKES.map((s, k) => ({ at: (sel.fire + 180 * k) % 720, label: `${s.name} ${sel.n}` }))} />
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
