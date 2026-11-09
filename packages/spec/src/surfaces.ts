/**
 * Surfaces: procedural backgrounds that make a design less flat (grain, paper, blueprint grids, contour lines…).
 * Pure functions, no DOM and no dependencies: each turns a kind and the view's stage into CSS for one layer, so the
 * screen (a section's background) and designs (kit `<Surface>`) draw the same thing. Colours come from the stage
 * (ink on page), so a surface follows the palette and stays visible in dark mode. Everything is static: nothing to
 * animate, so screenshots are stable and reduced motion needs nothing. Generated at draw time, never stored in a view.
 */
import type { Stage } from "./stage.ts";

export const SURFACES = ["grain", "paper", "blueprint", "dots", "contour", "halftone", "thermal", "clouds", "iridescent"] as const;
export type SurfaceKind = (typeof SURFACES)[number];

export type SurfaceOptions = {
  /** Varies the random pattern (contour, paper, clouds). */
  seed?: number;
  /** Pattern size: 1 is the default, 2 twice as large. */
  scale?: number;
  /** How strong it reads: 1 is the default (quiet enough to sit under text), up to 2. */
  strength?: number;
};

/** CSS for the surface's own layer (an absolutely positioned element behind the content). */
export type SurfaceStyle = {
  backgroundColor?: string;
  backgroundImage: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  maskImage?: string;
  filter?: string;
  mixBlendMode?: string;
};

/** What each surface suits, for the skill and for problems that list the kinds. */
export const SURFACE_NOTES: Record<SurfaceKind, string> = {
  grain: "film grain over the ground: warmth, removes the flat digital look; goes with anything",
  paper: "lit paper fibre: editorial, personal, archival",
  blueprint: "a fine and a coarse grid: engineering, systems, how things are built",
  dots: "a square dot grid: tools, notebooks, technical but calm",
  contour: "topographic isolines: maps, terrain, data with depth, exploration",
  halftone: "a halftone dot field fading across: print, editorial, retro",
  thermal: "soft blooms of the palette's colours: energy, heat, launches, hero moments",
  clouds: "soft drifting noise over a sky of the accent: open, calm, aspirational",
  iridescent: "blurred shimmering colour from the series: futuristic, product, premium",
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const svgUrl = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/** "#rgb", "#rrggbb", "#rrggbbaa" or "rgb(a)(…)" → [r, g, b] in 0..255 (unknown → mid grey). */
export function rgbOf(c: string): [number, number, number] {
  const h = c.trim().match(/^#([0-9a-f]{3,8})$/i)?.[1];
  if (h) {
    const x = h.length <= 4 ? h.slice(0, 3).split("").map((d) => d + d).join("") : h.slice(0, 6);
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)) as [number, number, number];
  }
  const m = c.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b] = m[1].split(/[,\s/]+/).map(Number);
    return [r, g, b];
  }
  return [128, 128, 128];
}
const rgba = (c: string, a: number) => {
  const [r, g, b] = rgbOf(c);
  return `rgba(${r}, ${g}, ${b}, ${+clamp(a, 0, 1).toFixed(3)})`;
};

/** Noise in one colour: fractal turbulence whose alpha is the pattern, tinted `color`. */
function noise(color: string, alpha: number, freq: number, octaves: number, seed: number, size: number): string {
  const [r, g, b] = rgbOf(color).map((v) => (v / 255).toFixed(3));
  return svgUrl(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n' x='0' y='0'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>` +
      `<feColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 ${(alpha * 1.6).toFixed(3)} -${(alpha * 0.25).toFixed(3)}'/>` +
      `</filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  );
}

/** Seeded smooth value noise in 0..1. */
function valueNoise(seed: number) {
  let s = (Math.floor(seed) % 2147483646) + 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const grid = Array.from({ length: 256 }, rnd);
  const at = (x: number, y: number) => grid[(((x * 73856093) ^ (y * 19349663)) >>> 0) % 256];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** Isolines of a noise field (marching squares), as one SVG path of segments in a W×H box. */
export function contourPath(seed: number, W = 96, H = 64, levels = 12, cell = 12.5): string {
  const n = valueNoise(seed);
  const f = (x: number, y: number) => n(x / 16, y / 16) * 0.65 + n(x / 6 + 31, y / 6 + 17) * 0.35;
  const v: number[][] = [];
  for (let y = 0; y <= H; y++) { const row: number[] = []; for (let x = 0; x <= W; x++) row.push(f(x, y)); v.push(row); }
  const p = (x: number, y: number) => `${Math.round(x * cell)} ${Math.round(y * cell)}`;
  const out: string[] = [];
  for (let k = 1; k <= levels; k++) {
    const t = 0.15 + (0.7 * k) / (levels + 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = v[y][x], b = v[y][x + 1], c = v[y + 1][x + 1], d = v[y + 1][x];
      const idx = (a > t ? 8 : 0) | (b > t ? 4 : 0) | (c > t ? 2 : 0) | (d > t ? 1 : 0);
      if (idx === 0 || idx === 15) continue;
      const lerp = (p0: number, p1: number) => (t - p0) / (p1 - p0);
      const top = () => p(x + lerp(a, b), y), right = () => p(x + 1, y + lerp(b, c));
      const bottom = () => p(x + lerp(d, c), y + 1), left = () => p(x, y + lerp(a, d));
      const seg = (s: () => string, e: () => string) => out.push(`M${s()}L${e()}`);
      switch (idx) {
        case 1: case 14: seg(left, bottom); break;
        case 2: case 13: seg(bottom, right); break;
        case 3: case 12: seg(left, right); break;
        case 4: case 11: seg(top, right); break;
        case 6: case 9: seg(top, bottom); break;
        case 7: case 8: seg(left, top); break;
        case 5: seg(left, top); seg(bottom, right); break;
        case 10: seg(top, right); seg(left, bottom); break;
      }
    }
  }
  return out.join("");
}

/** The CSS for one surface layer, coloured from the stage. */
export function surfaceStyle(kind: SurfaceKind, stage: Stage, o: SurfaceOptions = {}): SurfaceStyle {
  const seed = Math.round(o.seed ?? 7), scale = clamp(o.scale ?? 1, 0.25, 4), k = clamp(o.strength ?? 1, 0.2, 2);
  const dark = stage.mode === "dark";
  const ink = stage.ink, page = stage.page;
  const s = (px: number) => `${Math.round(px * scale)}px`;
  switch (kind) {
    case "grain":
      return { backgroundImage: noise(ink, (dark ? 0.16 : 0.12) * k, 0.9, 3, seed, 220), backgroundSize: s(220) };
    case "paper": {
      const fibre = noise(ink, (dark ? 0.1 : 0.07) * k, 0.035, 5, seed, 480);
      const tooth = noise(ink, (dark ? 0.08 : 0.05) * k, 0.8, 2, seed + 1, 200);
      return { backgroundImage: `${tooth}, ${fibre}`, backgroundSize: `${s(200)}, ${s(480)}` };
    }
    case "blueprint": {
      const fine = rgba(ink, (dark ? 0.07 : 0.06) * k), coarse = rgba(ink, (dark ? 0.16 : 0.12) * k);
      return {
        backgroundImage: [
          `linear-gradient(${coarse} 1px, transparent 1px)`, `linear-gradient(90deg, ${coarse} 1px, transparent 1px)`,
          `linear-gradient(${fine} 1px, transparent 1px)`, `linear-gradient(90deg, ${fine} 1px, transparent 1px)`,
        ].join(", "),
        backgroundSize: `${s(96)} ${s(96)}, ${s(96)} ${s(96)}, ${s(16)} ${s(16)}, ${s(16)} ${s(16)}`,
        backgroundPosition: "-1px -1px",
      };
    }
    case "dots":
      return { backgroundImage: `radial-gradient(${rgba(ink, (dark ? 0.26 : 0.2) * k)} 1.1px, transparent 1.6px)`, backgroundSize: `${s(22)} ${s(22)}` };
    case "contour": {
      const stroke = rgba(ink, (dark ? 0.2 : 0.16) * k);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'><path d='${contourPath(seed)}' fill='none' stroke='${stroke}' stroke-width='${(1.2 * scale).toFixed(2)}' stroke-linecap='round'/></svg>`;
      return { backgroundImage: svgUrl(svg), backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" };
    }
    case "halftone":
      return {
        backgroundImage: `radial-gradient(circle, ${rgba(ink, (dark ? 0.34 : 0.26) * k)} 0 ${(2.2 * scale).toFixed(1)}px, transparent ${(2.8 * scale).toFixed(1)}px)`,
        backgroundSize: `${s(10)} ${s(10)}`,
        maskImage: "linear-gradient(115deg, black 0%, rgba(0,0,0,0.55) 35%, transparent 75%)",
      };
    case "thermal": {
      const [a, b, c] = [stage.accent, stage.series[1] ?? stage.accent, stage.series[2] ?? stage.accent];
      const glow = (col: string, x: number, y: number, r: number, al: number) => `radial-gradient(${r}% ${r * 1.2}% at ${x}% ${y}%, ${rgba(col, al * k)} 0%, transparent 70%)`;
      return {
        backgroundImage: [noise(ink, 0.06 * k, 0.9, 2, seed, 220), glow(a, 18, 28, 55, 0.55), glow(b, 82, 22, 50, 0.42), glow(c, 60, 92, 60, 0.38)].join(", "),
        backgroundSize: `${s(220)}, cover, cover, cover`,
        backgroundRepeat: "repeat, no-repeat, no-repeat, no-repeat",
      };
    }
    case "clouds": {
      // a sky of the accent with soft puffs: white puffs on a light page, faint ink puffs on a dark one
      const sky = `linear-gradient(180deg, ${rgba(stage.accent, (dark ? 0.2 : 0.34) * k)} 0%, ${rgba(stage.accent, (dark ? 0.06 : 0.12) * k)} 55%, ${rgba(page, 0)} 95%)`;
      const puff = noise(dark ? ink : "#ffffff", (dark ? 0.1 : 0.9) * k, 0.005 / scale, 5, seed, 900);
      return { backgroundImage: `${puff}, ${sky}`, backgroundSize: `${s(900)}, cover`, backgroundRepeat: "repeat, no-repeat" };
    }
    case "iridescent": {
      const cols = [...stage.series.slice(0, 4), stage.accent].map((c) => rgba(c, 0.5 * k));
      return {
        backgroundImage: `conic-gradient(from 210deg at 62% 38%, ${cols.join(", ")}, ${cols[0]}), radial-gradient(60% 60% at 30% 70%, ${rgba(stage.series[1] ?? stage.accent, 0.4 * k)}, transparent)`,
        filter: `blur(${Math.round(48 * scale)}px) saturate(1.15)`,
      };
    }
  }
}

/** A scrim to keep text legible on a surface: the page colour, more opaque toward where text sits. */
export function scrimStyle(stage: Stage, where: "all" | "left" | "bottom" | "center" = "all", amount = 0.6): string {
  const c = (a: number) => rgba(stage.page, a * amount);
  switch (where) {
    case "left": return `linear-gradient(90deg, ${c(1)} 0%, ${c(0.85)} 35%, ${c(0)} 70%)`;
    case "bottom": return `linear-gradient(0deg, ${c(1)} 0%, ${c(0.8)} 40%, ${c(0)} 80%)`;
    case "center": return `radial-gradient(60% 55% at 50% 50%, ${c(1)} 0%, ${c(0.7)} 55%, ${c(0)} 100%)`;
    default: return `linear-gradient(${c(0.7)}, ${c(0.7)})`;
  }
}
