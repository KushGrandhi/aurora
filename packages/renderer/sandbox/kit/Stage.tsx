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

// In a hero the screen sets the view's title over the left of the stage: left panels start past it.
const AT = {
  "top-left": "left-8 top-8 [[data-display=hero]_&]:left-[24%]",
  "top-right": "right-8 top-8",
  bottom: "inset-x-8 bottom-8 [[data-display=hero]_&]:left-[24%]",
  "bottom-left": "left-8 bottom-8 [[data-display=hero]_&]:left-[24%]",
  "bottom-right": "right-8 bottom-8",
} as const;

/**
 * Text floating over a Stage, with no box: type sits straight on the scene, kept readable by a soft halo of the
 * page colour behind it. `glass` gives it a frosted panel instead, for dense controls. On narrow screens panels
 * stack in the flow instead of floating.
 */
export function Panel({ children, at, glass = false, className = "" }: { children: ReactNode; at: keyof typeof AT; glass?: boolean; className?: string }) {
  const look = glass
    ? "rounded-2xl bg-surface/75 p-4 shadow-card ring-1 ring-hair backdrop-blur-xl"
    : "p-1 [text-shadow:0_1px_14px_var(--page),0_0_2px_var(--page)]";
  return (
    <div
      data-kit-panel
      className={`absolute z-10 max-w-[min(26rem,calc(100%-4rem))] text-ink ${look} ${at === "bottom" ? "max-w-none" : ""} ${AT[at]} max-sm:relative max-sm:inset-auto max-sm:m-4 max-sm:max-w-none ${className}`}
    >
      {children}
    </div>
  );
}

/** A headline number as large type, with a quiet label above and an optional note below. No tile. */
export function Stat({ label, value, note, size = "lg" }: { label: ReactNode; value: ReactNode; note?: ReactNode; size?: "md" | "lg" }) {
  return (
    <div data-kit-stat>
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 font-semibold leading-none tracking-[-0.03em] tabular-nums ${size === "lg" ? "text-[52px]" : "text-[34px]"}`}>{value}</div>
      {note && <div className="mt-2 text-sm text-ink-2">{note}</div>}
    </div>
  );
}
