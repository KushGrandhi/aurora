import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { surfaceStyle, scrimStyle, type SurfaceKind } from "../../../spec/src/surfaces.ts";
import type { Stage } from "../../../spec/src/stage.ts";
import { onTheme, readToken } from "./tokens.ts";

/** The colours a surface needs, read from aurora's tokens (they follow the view's palette and the theme). */
function useStage(): Stage {
  const [n, setN] = useState(0);
  useEffect(() => onTheme(() => setN((x) => x + 1)), []);
  return useMemo(() => {
    const dark = document.documentElement.classList.contains("dark");
    const series = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => readToken(`--s${i}`, "#888888"));
    return { mode: dark ? "dark" : "light", page: readToken("--page", dark ? "#0d0d0d" : "#f9f9f7"), ink: readToken("--ink", dark ? "#f0efec" : "#0b0b0b"), accent: readToken("--accent", "#2a78d6"), series } as unknown as Stage;
  }, [n]);
}

export type SurfaceProps = {
  /** grain, paper, blueprint, dots, contour, halftone, thermal, clouds, iridescent */
  kind: SurfaceKind;
  seed?: number;
  scale?: number;
  strength?: number;
  /** Keeps text legible: the page colour behind where the text sits. Use it whenever text sits on the surface. */
  scrim?: "all" | "left" | "bottom" | "center";
  className?: string;
  style?: CSSProperties;
  /** With children, Surface is a container (the surface behind them); without, a layer that fills its parent. */
  children?: ReactNode;
};

/**
 * A procedural background (grain, paper, blueprint grid, contour lines…) in the view's colours. Static, so it costs
 * nothing per frame and looks the same in screenshots. Put it behind content; add `scrim` when text sits on it.
 */
export function Surface({ kind, seed, scale, strength, scrim, className, style, children }: SurfaceProps) {
  const stage = useStage();
  const css = useMemo(() => surfaceStyle(kind, stage, { seed, scale, strength }), [kind, stage, seed, scale, strength]);
  const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none", ...(css as CSSProperties), WebkitMaskImage: css.maskImage };
  const veil = scrim ? <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: scrimStyle(stage, scrim) }} /> : null;
  if (children === undefined)
    return (
      <div aria-hidden data-surface={kind} data-scrim={scrim ?? undefined} className={className} style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, ...style }}>
        <div style={layer} />
        {veil}
      </div>
    );
  return (
    <div data-surface={kind} data-scrim={scrim ?? undefined} className={className} style={{ position: "relative", isolation: "isolate", overflow: "hidden", ...style }}>
      <div aria-hidden style={{ ...layer, zIndex: -1 }} />
      {veil && <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: -1, pointerEvents: "none", backgroundImage: scrimStyle(stage, scrim!) }} />}
      {children}
    </div>
  );
}
