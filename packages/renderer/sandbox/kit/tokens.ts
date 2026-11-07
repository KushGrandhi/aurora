import { useEffect, useRef, useState } from "react";
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
 * A three.js Color that tracks a token. The same Color instance is updated in place when the theme changes, so a
 * material holding it recolors on the next frame without remounting anything.
 */
export function useToken(name: string): Color {
  const color = useRef<Color>();
  if (!color.current) color.current = new Color(readToken(name));
  const [, rerender] = useState(0);
  useEffect(() => {
    color.current!.set(readToken(name));
    return onTheme(() => {
      color.current!.set(readToken(name));
      rerender((n) => n + 1);
    });
  }, [name]);
  return color.current;
}
