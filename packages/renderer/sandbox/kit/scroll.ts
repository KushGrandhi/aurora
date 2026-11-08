import { useEffect, useState } from "react";

export type Scroll = { progress: number; position: number; index: number; count: number; reduced: boolean; raw: { progress: number; position: number } };
type Bridge = { scroll?: Scroll; onScroll?(cb: (s: Scroll) => void): () => void };
const bridge = () => (window as unknown as { aurora?: Bridge }).aurora;
const still: Scroll = { progress: 0, position: 0, index: 0, count: 0, reduced: false, raw: { progress: 0, position: 0 } };

/**
 * Scroll as a live value, eased every frame. Read it inside an animation loop, never as React state:
 *   const s = useScroll();
 *   useFrame(() => { cam.position.lerpVectors(a, b, span(s.position, 1, 2)); });
 * `progress` 0..1 through the page; in a story `position` (1.37 = 37% from step 1 to step 2), `index`, `count`.
 * With reduced motion the values snap to steps; pass `{ motion: "always" }` to get continuous values anyway (only
 * for motion that is the point, not decoration).
 */
export function useScroll(opts?: { motion?: "always" }): { progress: number; position: number; index: number; count: number } {
  const s = bridge()?.scroll ?? still;
  return opts?.motion === "always" ? new Proxy(s, { get: (t, k) => (k === "progress" || k === "position" ? t.raw[k] : t[k as keyof Scroll]) }) as Scroll : s;
}

/** The story step being read, as React state (for text and labels; it changes only when the step does). */
export function useScrollStep(): number {
  const [i, setI] = useState(() => bridge()?.scroll?.index ?? 0);
  useEffect(() => bridge()?.onScroll?.((s) => setI((prev) => (prev === s.index ? prev : s.index))), []);
  return i;
}

/** 0..1: how far `x` has gone from `a` to `b`, clamped. `span(s.position, 1, 2)` is 0 at step 1 and 1 at step 2. */
export function span(x: number, a: number, b: number): number {
  return b === a ? (x >= b ? 1 : 0) : Math.max(0, Math.min(1, (x - a) / (b - a)));
}

/**
 * Scrubs a timeline (GSAP's, or anything with `progress(n)`) with scroll: by default the story's position from the
 * first step to the last, or the page progress outside a story. `useScrub(tl, (s) => span(s.position, 2, 3))` plays
 * it between step 2 and step 3.
 */
export function useScrub(timeline: { progress(n: number): unknown } | null | undefined, map?: (s: Scroll) => number): void {
  useEffect(() => {
    if (!timeline) return;
    const apply = (s: Scroll) => { timeline.progress(Math.max(0, Math.min(1, map ? map(s) : s.count > 1 ? s.position / (s.count - 1) : s.progress))); };
    apply(bridge()?.scroll ?? still);
    return bridge()?.onScroll?.(apply);
  }, [timeline, map]);
}
