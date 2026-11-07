import { useRef, type ReactNode } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { Clock } from "./controls.tsx";

/**
 * Makes a part something the reader can take hold of: drag it sideways (or up and down with `axis="y"`) and time
 * moves with it, so turning the crank by hand turns the whole engine. `rate` is clock units per pixel. While held,
 * the scene stops orbiting and the animation pauses; letting go resumes it.
 */
export function Grab({ clock, rate = 1, axis = "x", children }: { clock: Clock; rate?: number; axis?: "x" | "y"; children: ReactNode }) {
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const held = useRef<{ from: number; start: number; wasPlaying: boolean } | undefined>();
  const pos = (e: { clientX: number; clientY: number }) => (axis === "x" ? e.clientX : -e.clientY);
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    held.current = { from: pos(e), start: clock.ref.current, wasPlaying: clock.playing };
    clock.setPlaying(false);
    if (controls) controls.enabled = false;
    document.body.style.cursor = "grabbing";
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    if (!held.current) return;
    e.stopPropagation();
    clock.seek(held.current.start + (pos(e) - held.current.from) * rate);
  };
  const up = () => {
    if (!held.current) return;
    if (held.current.wasPlaying) clock.setPlaying(true);
    held.current = undefined;
    if (controls) controls.enabled = true;
    document.body.style.cursor = "";
  };
  return (
    <group onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      onPointerOver={() => { if (!held.current) document.body.style.cursor = "grab"; }} onPointerOut={() => { if (!held.current) document.body.style.cursor = ""; }}>
      {children}
    </group>
  );
}
