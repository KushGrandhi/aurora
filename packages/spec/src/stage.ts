import type { Palette } from "./view.ts";

/**
 * The stage: every colour the screen, the charts and the design sandboxes draw with. Without a `page` in the view's
 * palette it is aurora's house theme for the person's light/dark choice. With one, the view sets its own stage: the
 * mode follows the page, and every surface, line and muted tone is derived from page and ink by solving for a
 * contrast target (in OKLab, so hues stay true), so any page the model picks stays legible and coherent.
 * All colours are hex: three.js, d3 and Vega can't read color-mix() or alpha in every place they take a colour.
 */
export type Mode = "light" | "dark";
export type Stage = {
  mode: Mode;
  page: string; surface: string; raised: string;
  ink: string; ink2: string; muted: string;
  hair: string; grid: string; axis: string; line: string;
  accent: string; good: string; bad: string; warn: string; violet: string;
  series: string[]; ramp: string[];
  band: string; side: string; skeletonA: string; skeletonB: string;
  shadow: string; shadowHover: string;
};

export const HOUSE: Record<Mode, Stage> = {
  light: {
    mode: "light", page: "#f9f9f7", surface: "#fcfcfb", raised: "#ffffff", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781",
    hair: "rgba(11, 11, 11, 0.08)", grid: "#e1e0d9", axis: "#c3c2b7", line: "#e1e0d9",
    accent: "#2a78d6", good: "#006300", bad: "#d03b3b", warn: "#b87a00", violet: "#6250d6",
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    ramp: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
    band: "#f2f1ed", side: "rgba(249, 249, 247, 0.72)", skeletonA: "#f0efec", skeletonB: "#f7f6f3",
    shadow: "0 1px 2px rgba(16, 16, 12, 0.04), 0 8px 24px -12px rgba(16, 16, 12, 0.10)",
    shadowHover: "0 2px 4px rgba(16, 16, 12, 0.05), 0 18px 40px -16px rgba(16, 16, 12, 0.18)",
  },
  dark: {
    mode: "dark", page: "#0d0d0d", surface: "#1a1a19", raised: "#1f1f1d", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781",
    hair: "rgba(255, 255, 255, 0.08)", grid: "#2c2c2a", axis: "#383835", line: "#2c2c2a",
    accent: "#3987e5", good: "#0ca30c", bad: "#e66767", warn: "#e0a106", violet: "#9085e9",
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
    ramp: ["#104281", "#184f95", "#1c5cab", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"],
    band: "#141413", side: "rgba(13, 13, 13, 0.7)", skeletonA: "#222220", skeletonB: "#2a2a27",
    shadow: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.5)",
    shadowHover: "0 2px 4px rgba(0, 0, 0, 0.35), 0 18px 40px -16px rgba(0, 0, 0, 0.7)",
  },
};

// ---- colour maths: sRGB, OKLab, WCAG contrast ----

type Rgb = [number, number, number];
const hexRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
const rgbHex = (c: Rgb) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function toLab(h: string): Rgb {
  const [r, g, b] = hexRgb(h).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromLab([L, A, B]: Rgb): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055);
  return rgbHex([enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)]);
}

export function luminance(h: string): number {
  const [r, g, b] = hexRgb(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio of two hex colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** a → b by t, in OKLab. */
export function mix(a: string, b: string, t: number): string {
  const p = toLab(a), q = toLab(b);
  return fromLab([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]);
}
const worst = (c: string, against: string[]) => Math.min(...against.map((g) => contrast(c, g)));

/** The colour nearest `from` on the way to `to` that reaches `target` contrast against every colour in `against`. */
function solve(from: string, to: string, target: number, against: string[]): string {
  if (worst(from, against) >= target) return from;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (worst(mix(from, to, t), against) >= target) hi = t; else lo = t;
  }
  return mix(from, to, hi);
}

/** `c` with its hue and chroma kept and its lightness moved away from the backgrounds until it reaches `target`. */
function fit(c: string, against: string[], target: number, mode: Mode): string {
  if (worst(c, against) >= target) return c;
  const [L, A, B] = toLab(c);
  const end = mode === "dark" ? 1 : 0;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const t = (lo + hi) / 2;
    if (worst(fromLab([L + (end - L) * t, A * (1 - t * 0.3), B * (1 - t * 0.3)]), against) >= target) hi = t; else lo = t;
  }
  return fromLab([L + (end - L) * hi, A * (1 - hi * 0.3), B * (1 - hi * 0.3)]);
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const lower = (h: string) => h.toLowerCase();
const modeOf = (page: string): Mode => (contrast(page, "#ffffff") > contrast(page, "#000000") ? "dark" : "light");
const defaultInk = (page: string) => {
  const mode = modeOf(page), house = HOUSE[mode].ink;
  return contrast(house, page) >= 7 ? house : mode === "dark" ? "#ffffff" : "#000000";
};

/** Why a palette can't be used as a stage, or undefined when it can. */
export function stageProblem(p: Palette): string | undefined {
  if (p.ink && !p.page) return "palette.ink needs a palette.page to be read against; add a page colour or leave ink out";
  if (!p.page) return undefined;
  if (p.ink) {
    const c = contrast(p.ink, p.page);
    if (c < 7) return `palette.ink ${p.ink} on page ${p.page} has contrast ${c.toFixed(1)}:1; text needs at least 7:1. Move the ink toward ${modeOf(p.page) === "dark" ? "white" : "black"}, or leave ink out and aurora picks one`;
    return undefined;
  }
  const c = contrast(defaultInk(p.page), p.page);
  if (c < 7) return `palette.page ${p.page} is too mid-toned for text to read well on it (best ${c.toFixed(1)}:1, text needs 7:1); choose a darker or lighter page`;
  return undefined;
}

/** The stage for a view: the house theme for `mode`, with the palette's colours, or a whole stage derived from its page. */
export function resolveStage(mode: Mode, p?: Palette): Stage {
  const series = (base: string[], fitted: (c: string) => string) => {
    const own = (p?.series ?? []).filter((c) => HEX.test(c)).map(lower);
    return [...own, ...base.slice(own.length).map(fitted)];
  };
  const accent = p?.accent && HEX.test(p.accent) ? lower(p.accent) : undefined;
  if (!p?.page || !HEX.test(p.page) || stageProblem(p)) {
    const h = HOUSE[mode];
    return { ...h, accent: accent ?? h.accent, series: series(h.series, (c) => c) };
  }
  const page = lower(p.page);
  const m = modeOf(page);
  const h = HOUSE[m];
  const ink = p.ink && HEX.test(p.ink) ? lower(p.ink) : defaultInk(page);
  const toward = m === "dark" ? ink : "#ffffff";
  const surface = m === "dark" ? solve(page, ink, 1.15, [page]) : mix(page, toward, 0.45);
  const raised = m === "dark" ? solve(page, ink, 1.22, [page]) : mix(page, toward, 0.8);
  const bgs = [page, surface, raised];
  const tone = (target: number) => solve(page, ink, target, [page]);
  return {
    mode: m, page, surface, raised, ink,
    ink2: solve(page, ink, 7, bgs), muted: solve(page, ink, 3.6, bgs),
    hair: tone(1.15), grid: tone(1.25), axis: tone(1.7), line: tone(1.25),
    accent: accent ?? fit(h.accent, bgs, 3, m),
    good: fit(h.good, bgs, 4.5, m), bad: fit(h.bad, bgs, 4.5, m), warn: fit(h.warn, bgs, 4.5, m), violet: fit(h.violet, bgs, 4.5, m),
    series: series(h.series, (c) => fit(c, bgs, 3, m)), ramp: [...h.ramp],
    band: tone(1.06), side: page, skeletonA: tone(1.1), skeletonB: tone(1.05),
    shadow: h.shadow, shadowHover: h.shadowHover,
  };
}

/** Colours the model chose that are hard to see on the stage (never the defaults). */
export function paletteWarnings(mode: Mode, p?: Palette): string[] {
  if (!p) return [];
  const t = resolveStage(mode, p);
  const bar = p.page ? 3 : Math.min(3, ...HOUSE[t.mode].series.map((c) => contrast(c, t.page)));
  const out: string[] = [];
  const check = (c: string, what: string) => {
    if (!HEX.test(c)) return;
    const r = contrast(c, t.page);
    if (r < bar) out.push(`palette: ${what} ${c} is hard to see on the page ${t.page} (${r.toFixed(1)}:1); it needs about ${bar.toFixed(1)}:1`);
  };
  if (p.accent) check(p.accent, "accent");
  (p.series ?? []).forEach((c, i) => check(c, `series colour ${i + 1}`));
  return out;
}
