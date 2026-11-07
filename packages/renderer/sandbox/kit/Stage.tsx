import type { ReactNode } from "react";

/**
 * A full-bleed stage: the `scene` fills it edge to edge on a soft radial backdrop, and `children` (usually Panels)
 * float on top. Fills the screen in a page or hero; inside a fixed-height card it fills the card.
 */
export function Stage({ children, scene, className = "" }: { children?: ReactNode; scene: ReactNode; className?: string }) {
  return (
    <div
      data-kit-stage
      className={`relative h-screen min-h-[420px] w-full overflow-hidden text-ink max-sm:h-auto max-sm:overflow-visible max-sm:pb-3 ${className}`}
      style={{ background: "radial-gradient(ellipse at 50% 38%, var(--raised), var(--page) 72%)" }}
    >
      <div className="absolute inset-0 isolate max-sm:relative max-sm:h-[60vh]">{scene}</div>
      {children}
    </div>
  );
}

const AT = {
  "top-left": "left-6 top-6",
  "top-right": "right-6 top-6",
  bottom: "inset-x-6 bottom-6",
  "bottom-left": "left-6 bottom-6",
  "bottom-right": "right-6 bottom-6",
} as const;

/** A frosted glass panel floating over a Stage. On narrow screens panels stack in the flow instead of floating. */
export function Panel({ children, at, className = "" }: { children: ReactNode; at: keyof typeof AT; className?: string }) {
  return (
    <div
      data-kit-panel
      className={`absolute z-10 max-w-[min(26rem,calc(100%-3rem))] rounded-2xl bg-surface/75 p-4 text-ink shadow-card ring-1 ring-hair backdrop-blur-xl ${at === "bottom" ? "max-w-none" : ""} ${AT[at]} max-sm:relative max-sm:inset-auto max-sm:m-3 max-sm:max-w-none ${className}`}
    >
      {children}
    </div>
  );
}
