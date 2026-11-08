import { Stage, Scene, Panel, useScrollStep } from "aurora/kit";
import Sky from "./Sky";
import { STEPS } from "./model";

// Pinned behind a story's steps: the stage fills the screen, and the kit keeps the scene and panels clear of the
// steps' side. The readout changes with the step (React state); the motion follows the scroll (inside Sky).
export default function App() {
  const step = useScrollStep();
  return (
    <Stage scene={<Scene camera={[-1.2, 4.5, 23]} target={[-1.2, 0, 0]} autoRotate={false}><Sky /></Scene>}>
      <Panel at="top-right">
        <div className="text-sm text-muted">Step {step + 1} of {STEPS.length}</div>
        <div className="font-display text-3xl tracking-tight">{STEPS[step]}</div>
      </Panel>
    </Stage>
  );
}
