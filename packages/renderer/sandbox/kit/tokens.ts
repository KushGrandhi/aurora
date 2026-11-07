import { useEffect, useMemo, useState } from "react";
import { Color } from "three";

type Bridge = { onTheme?(cb: (mode: "light" | "dark") => void): (() => void) | void };
const bridge = () => (window as unknown as { aurora?: Bridge }).aurora;

/** The current value of one of aurora's CSS variables (`--accent`, `--s3`…), or `fallback` when it is unset. */
export function readToken(name: string, fallback = "gray"): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name.startsWith("--") ? name : `--${name}`).trim();
  return v || fallback;
}

/** Calls `cb` whenever aurora switches theme; returns the unsubscribe. */
export function onTheme(cb: () => void): () => void {
  const off = bridge()?.onTheme?.(cb);
  return typeof off === "function" ? off : () => {};
}

/**
 * A three.js Color for a token that follows the theme. It is a new Color whenever the token or the theme changes:
 * React Three Fiber compares props by reference, so a new instance is what makes a material pick up the new colour
 * (it is copied into the existing material; nothing remounts).
 */
export function useToken(name: string): Color {
  const [theme, setTheme] = useState(0);
  useEffect(() => onTheme(() => setTheme((n) => n + 1)), []);
  return useMemo(() => new Color(readToken(name)), [name, theme]);
}
