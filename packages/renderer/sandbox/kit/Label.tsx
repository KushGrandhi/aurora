import type { ReactNode } from "react";
import { Html } from "@react-three/drei";

/**
 * A label pinned to a point in the 3D scene: a dot, a leader line and plain text (no pill), set off to one side so it
 * never sits on a moving part.
 * It follows the point as the scene turns and never catches drags.
 */
export function Label({ at, children, side = "right" }: { at: [number, number, number]; children: ReactNode; side?: "left" | "right" }) {
  const left = side === "left";
  return (
    <Html position={at} zIndexRange={[9, 0]} style={{ pointerEvents: "none" }}>
      <div data-kit-label className={`flex items-center ${left ? "flex-row-reverse" : ""}`} style={{ transform: `translate(${left ? "-100%" : "0"}, -50%)` }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />
        <span className="h-px w-6 shrink-0 bg-ink/40" />
        <span className="whitespace-nowrap px-1.5 text-[13px] font-medium tracking-tight text-ink [text-shadow:0_1px_12px_var(--page),0_0_2px_var(--page)]">{children}</span>
      </div>
    </Html>
  );
}
