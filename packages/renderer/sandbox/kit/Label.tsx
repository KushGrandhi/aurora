import type { ReactNode } from "react";
import { Html } from "@react-three/drei";

/**
 * A label pinned to a point in the 3D scene, set off to one side with a leader line so it never sits on a moving part.
 * It follows the point as the scene turns and never catches drags.
 */
export function Label({ at, children, side = "right" }: { at: [number, number, number]; children: ReactNode; side?: "left" | "right" }) {
  const left = side === "left";
  return (
    <Html position={at} zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
      <div data-kit-label className={`flex items-center ${left ? "flex-row-reverse" : ""}`} style={{ transform: `translate(${left ? "-100%" : "0"}, -50%)` }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink-2" />
        <span className="h-px w-7 shrink-0 bg-ink-2/40" />
        <span className="whitespace-nowrap rounded-md bg-surface/85 px-2 py-1 text-xs font-medium text-ink-2 ring-1 ring-hair backdrop-blur">{children}</span>
      </div>
    </Html>
  );
}
