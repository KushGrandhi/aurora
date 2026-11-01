import { TOKENS } from "../theme.ts";

/**
 * aurora's design language as CSS variables inside every design sandbox, so a design matches the screen around it
 * and switches theme without writing `dark:` twice. Tailwind sees them as colors: `bg-surface`, `text-ink-2`,
 * `border-hair`, `fill-s3`; SVG and canvas can read `var(--accent)` directly.
 */
const BASE = {
  light: { page: "#f9f9f7", surface: "#fcfcfb", raised: "#ffffff", ink: "#0b0b0b", "ink-2": "#52514e", muted: "#898781", hair: "rgba(11, 11, 11, 0.08)", line: "#e1e0d9", accent: "#2a78d6", good: "#006300", bad: "#d03b3b", warn: "#b87a00",
    shadow: "0 1px 2px rgba(16, 16, 12, 0.04), 0 8px 24px -12px rgba(16, 16, 12, 0.10)" },
  dark: { page: "#0d0d0d", surface: "#1a1a19", raised: "#1f1f1d", ink: "#f0efec", "ink-2": "#c3c2b7", muted: "#898781", hair: "rgba(255, 255, 255, 0.08)", line: "#2c2c2a", accent: "#3987e5", good: "#0ca30c", bad: "#e66767", warn: "#e0a106",
    shadow: "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px -12px rgba(0, 0, 0, 0.5)" },
} as const;

const COLORS = ["page", "surface", "raised", "ink", "ink-2", "muted", "hair", "line", "accent", "good", "bad", "warn", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

function vars(mode: "light" | "dark"): string {
  const series = TOKENS[mode].series.map((c, i) => `--s${i + 1}: ${c};`);
  return [...Object.entries(BASE[mode]).map(([k, v]) => `--${k}: ${v};`), ...series].join(" ");
}

/** Plain CSS: the variables for light (:root) and dark (.dark on <html>, set by aurora's theme). */
export const TOKEN_CSS = `:root { ${vars("light")} --ease: cubic-bezier(0.22, 1, 0.36, 1); color-scheme: light; }\n.dark { ${vars("dark")} color-scheme: dark; }`;

/** Tailwind theme: each variable becomes a color utility (`bg-*`, `text-*`, `border-*`, `ring-*`, `fill-*`, `stroke-*`). */
export const TOKEN_THEME = `@theme inline { ${COLORS.map((c) => `--color-${c}: var(--${c});`).join(" ")} --shadow-card: var(--shadow); --ease-aurora: var(--ease); }`;
