/**
 * Scroll as a continuous value, for designs to scrub animation with. One scheduler for the whole screen: on any
 * scroll (the window, the variants overlay, a page stage: listened for in the capture phase), resize or layout
 * change, it measures every registered element once per animation frame and hands each its value, exact and only
 * when it changed. Elements off screen are skipped (their frames aren't animating anyway).
 *
 * - `progress` 0..1: the element's journey through the window, from where it starts on the page (an element already
 *   in the first screen starts at 0) until its bottom leaves the top.
 * - In a story: `position`, a float where k means step k sits on the reading line (1.37 = 37% of the way from step 1
 *   to step 2), `index` = round(position), `count` steps; `progress` is the story section's journey.
 * - `reduced`: the person prefers reduced motion. Then `position` and `progress` snap (to steps, and to quarters), so
 *   nothing travels with scroll; `raw` keeps the continuous values for a design that opts in.
 */
export type ScrollValue = { progress: number; position: number; index: number; count: number; reduced: boolean; raw: { progress: number; position: number } };
export type Measure = () => { progress: number; position: number; count: number };

/** Where the reader's eye is: the middle of the window, or lower on a phone where the visual sits on top (in step with look). */
export const readingLine = () => (window.innerWidth < 860 ? 0.73 : 0.5) * window.innerHeight;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const reducedMq = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : undefined;

/** progress of an element through the window, starting from wherever it begins on the page. */
export function elementProgress(el: Element): number {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight, y = window.scrollY;
  const docTop = r.top + y;
  const raw = (sy: number) => (sy + vh - docTop) / (vh + r.height);
  const p0 = clamp01(raw(0));
  return p0 >= 1 ? 1 : clamp01((raw(y) - p0) / (1 - p0));
}

/** position of the reading line among step centres: k + the fraction of the way to step k + 1. */
export function storyPosition(steps: Element[]): number {
  if (!steps.length) return 0;
  const line = readingLine();
  const c = steps.map((s) => { const r = s.getBoundingClientRect(); return r.top + r.height / 2; });
  if (line <= c[0]) return 0;
  for (let k = 0; k < c.length - 1; k++) if (line < c[k + 1]) return k + (line - c[k]) / (c[k + 1] - c[k]);
  return c.length - 1;
}

export function toValue(m: { progress: number; position: number; count: number }): ScrollValue {
  const reduced = !!reducedMq?.matches;
  const pos = Math.max(0, Math.min(Math.max(0, m.count - 1), m.position));
  const raw = { progress: clamp01(m.progress), position: pos };
  return reduced
    ? { progress: Math.round(raw.progress * 4) / 4, position: Math.round(pos), index: Math.round(pos), count: m.count, reduced, raw }
    : { progress: raw.progress, position: pos, index: Math.round(pos), count: m.count, reduced, raw };
}

type Entry = { el: Element; measure: Measure; on(v: ScrollValue): void; last?: string; visible: boolean };
const entries = new Set<Entry>();
let frame = 0;
let io: IntersectionObserver | undefined;
let ro: ResizeObserver | undefined;

function tick() {
  frame = 0;
  for (const e of entries) {
    if (!e.visible) continue;
    const v = toValue(e.measure());
    const key = `${v.progress}|${v.position}|${v.count}|${v.reduced}`;
    if (key === e.last) continue;
    e.last = key;
    e.on(v);
  }
}
const schedule = () => { if (!frame && entries.size) frame = requestAnimationFrame(tick); };

function start() {
  document.addEventListener("scroll", schedule, { capture: true, passive: true });
  addEventListener("resize", schedule, { passive: true });
  reducedMq?.addEventListener("change", schedule);
  io = new IntersectionObserver((list) => {
    for (const it of list) for (const e of entries) if (e.el === it.target) e.visible = it.isIntersecting;
    schedule();
  }, { rootMargin: "50% 0px 50% 0px" });
  ro = new ResizeObserver(schedule); // a new version, fonts loading, a step growing: values change without a scroll
  ro.observe(document.documentElement);
}
function stop() {
  document.removeEventListener("scroll", schedule, { capture: true });
  removeEventListener("resize", schedule);
  reducedMq?.removeEventListener("change", schedule);
  io?.disconnect(); ro?.disconnect();
  io = ro = undefined;
}

/** Calls `on` with `el`'s scroll value (measured by `measure`, default: its journey through the window) whenever it changes. */
export function watchScroll(el: Element, on: (v: ScrollValue) => void, measure?: Measure): () => void {
  if (!entries.size) start();
  const e: Entry = { el, on, measure: measure ?? (() => ({ progress: elementProgress(el), position: 0, count: 0 })), visible: true };
  entries.add(e);
  io?.observe(el);
  ro?.observe(el);
  schedule();
  return () => {
    entries.delete(e);
    io?.unobserve(el);
    ro?.unobserve(el);
    if (!entries.size) stop();
  };
}
