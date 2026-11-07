# aurora/kit

House-style building blocks for a `design`. **Assemble these instead of drawing from scratch:** they already have aurora's light, depth, motion and tokens, so what you build looks finished. Import from `"aurora/kit"`. For 3D you also use `@react-three/fiber` (`useFrame`) and plain three.js elements (`<mesh>`, `<cylinderGeometry>`, `<group>`).

`examples/mechanism.md` uses almost all of them. Start there.

## Layout

| Export | Use |
|---|---|
| `Stage` | `<Stage scene={<Scene>…</Scene>}>panels…</Stage>`: a full-bleed stage. The scene fills it on a soft backdrop; children float on top. Fills the screen in a `hero` or `page`. |
| `Panel` | `<Panel at="top-right">…</Panel>`: text floating on the stage with **no box**: plain type kept readable by a soft halo. `glass` gives a frosted panel; use it only for dense controls (`<Panel at="bottom" glass><ControlBar …/></Panel>`). `at`: `top-left`, `top-right`, `bottom`, `bottom-left`, `bottom-right`. On phones panels stack. Use **at most three**. In a `hero` the screen already shows the view's title and summary on the left: don't repeat a title in the design; panels hold what changes (the part being followed, live numbers, controls). |
| `Stat` | `<Stat label="Revenue" value="$98,491" note="all regions" />`: a headline number as large type, no tile. Put one or two in a `Panel`, never a grid of boxes. |
| `Reveal` | `<Reveal delay={0.1}>…</Reveal>`: fades and lifts content in once. |
| `Stagger` | `<Stagger>{a}{b}{c}</Stagger>`: reveals children one after another. Use it once, for the opening; that is the page's one orchestrated motion moment. |

## 3D

| Export | Use |
|---|---|
| `Scene` | `<Scene camera={[x, y, z]} target={[x, y, z]}>meshes…</Scene>`: a lit, shadowed 3D scene with studio reflections, a soft contact shadow under your objects, drag to turn, scroll to zoom and a slow auto-rotate. It fills its parent. If WebGL is off it shows a tidy notice instead. |
| `Metal` | `<mesh><cylinderGeometry /><Metal tone="steel" /></mesh>`: polished metal. `tone`: `steel`, `dark`, `brass`, `aluminium`; `rough` 0..1. For moving mechanical parts. |
| `Glass` | `<Glass opacity={0.12} />`: clear glass. For walls and casings you need to see through: cylinders, chambers, a heart wall, a pipe. |
| `Glow` | `<Glow color="--bad" intensity={0.8} />`: a glowing, see-through fill. For what is hot, live or flowing: burning gas, blood, current, fluid. `color` is a token name; `intensity` 0..1. |
| `Paint` | `<Paint color="--accent" />`: a glossy painted surface. For the one part that should draw the eye. |
| `Label` | `<Label at={[x, y, z]} side="left">piston</Label>`: a dot, a leader line and plain text pinned to a point, set off so it never sits on a moving part. Label four to six parts, not everything. |
| `useFocus` | `const [focus, setFocus] = useFocus()`: linked focus with the rest of the view. `onPointerOver={() => setFocus("West")}`, `onPointerOut={() => setFocus(null)}` on a mesh, and light the part up when `focus === "West"`. Hovering West in a chart or table below then lights the same part. |
| `useStory` | `const s = useStory()`: in a `story` section, `{ index, state }` of the step being read (`state` is the step's `story.state`), else null. Drive the scene from it: freeze the engine at `state.phase`, light the valve the step talks about. |
| `useParam` | `const rpm = useParam<number>("rpm")`: the current value of a view param, e.g. a number the reader drags in the prose (`{{rpm}}`). |
| `useToken` | `const c = useToken("--s1")`: a three.js Color that follows the theme, for materials you write yourself. |

## Time and controls

| Export | Use |
|---|---|
| `useClock` | `const clock = useClock({ speed: 120, period: 720 })`: time that advances `speed` units per second and wraps at `period`. `clock.t` is React state (20 updates a second): use it for text and colours. Inside `useFrame`, read `clock.ref.current` for smooth motion. Also `clock.playing`, `setPlaying`, `speed`, `setSpeed`, `step(by)`. |
| `ControlBar` | `<ControlBar clock={clock} onStep={…} stepLabel="Next firing">chips…</ControlBar>`: play/pause, a step button, a Slow/Normal/Fast switch and room for your own chips. Put it in `<Panel at="bottom">`. |
| `PhaseDial` | `<PhaseDial phases={[{ name, color: "--s1" }, …]} value={0.4} />`: where something is in a repeating cycle (strokes, heartbeat phases, seasons). `value` 0..1 through the whole cycle. |
| `Legend` | `<Legend items={[{ name, color, active, onClick }]} />`: coloured keys; with `onClick` they become selectors. |

## The pattern

```tsx
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Stage, Scene, Panel, Stat, ControlBar, Metal, Glass, Glow, Label, useClock } from "aurora/kit";

function Piston({ clock }) {
  const ref = useRef(null);
  useFrame(() => { ref.current.position.y = Math.cos(clock.ref.current) * 0.5; }); // smooth motion from clock.ref
  return <group ref={ref}><mesh castShadow><cylinderGeometry args={[0.5, 0.5, 0.4, 48]} /><Metal tone="aluminium" /></mesh></group>;
}

export default function App() {
  const clock = useClock({ speed: 2 });
  return (
    <Stage scene={<Scene><mesh><cylinderGeometry args={[0.55, 0.55, 2, 48, 1, true]} /><Glass /></mesh><Piston clock={clock} /><Label at={[0.6, 1, 0]}>piston</Label></Scene>}>
      <Panel at="top-right"><Stat label="Crank angle" value={`${Math.round(clock.t % 360)}°`} /></Panel>
      <Panel at="bottom" glass><ControlBar clock={clock} /></Panel>
    </Stage>
  );
}
```

Show it with `display: "hero"` (first item of the view, sections below) or `display: "page"` (the only item). A 3D scene in a card comes back as a warning.
