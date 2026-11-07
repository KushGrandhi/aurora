import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

// Apple-like springs: short (≈150–450 ms to settle), interruptible, no overshoot you'd notice.
export const SPRING = { type: "spring", stiffness: 380, damping: 32, mass: 0.9 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 220, damping: 28 } as const;
export const STAGGER_S = 0.04;
/** The opening reveal: header first, then items across sections, 60 ms apart, all in within about 0.7 s. */
export const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
export const ENTER_STEP_S = 0.06;
export const ENTER_MAX_STEPS = 10;
export const enterDelay = (section: number, index: number) => Math.min(section * 2 + index, ENTER_MAX_STEPS) * ENTER_STEP_S;

/** What components that animate internally may use, without importing the motion library themselves. */
export type MotionApi = { spring: typeof SPRING; reduced: boolean };

/** An item glows when the version on screen is the one that changed it. */
export function shouldGlow(changed: Record<string, number>, id: string, version: number): boolean {
  return changed[id] === version;
}

/** Reduced-motion users get fades instead of movement (Motion drops transform animations under "user"). */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user" transition={SPRING}>{children}</MotionConfig>;
}
