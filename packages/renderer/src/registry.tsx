import { lazy, type FC } from "react";
import type { Component, QueryResult, Palette, Param } from "@aurora/spec";
import type { MotionApi } from "./motion.tsx";
import { resolveStage, type Fonts, type Stage } from "@aurora/spec";
import { fontVars } from "./fonts.ts";
import type { Measure } from "./scroll.ts";
import type { Mode } from "./theme.ts";
import { Json } from "./components/Json.tsx";
import { Kpi } from "./components/Kpi.tsx";
import { Text } from "./components/Text.tsx";

export type Theme = { categorical: readonly string[]; sequential: readonly string[]; ink: string; ink2: string; muted: string; surface: string; hair: string; axis: string; stage: Stage; /** the body font stack */ font: string };

/**
 * The screen's colours: the house theme for the person's mode with the palette's accent and series, or, when the
 * palette has a `page`, the view's whole stage (its mode then follows the page: read `theme.stage.mode`).
 */
export function themeFor(mode: Mode, palette?: Palette, fonts?: Fonts): Theme {
  const t = resolveStage(mode, palette);
  return { categorical: t.series, sequential: t.ramp, ink: t.ink, ink2: t.ink2, muted: t.muted, surface: t.surface, hair: t.grid, axis: t.axis, stage: t, font: fontVars(fonts)["--aurora-body"] };
}

export type Viewport = "desktop" | "tablet" | "phone";

export type RenderCtx = {
  /** The view's param values by name, its param definitions and resolved select options, and a way to set one. */
  params?: Record<string, unknown>;
  paramDefs?: Record<string, Param>;
  paramOptions?: Record<string, string[]>;
  setParam?(name: string, value: unknown): void;
  /** For the pinned visual of a story section: the step in view and its state. */
  story?: { index: number; state: unknown } | null;
  /** In a compact (dense) section: draw smaller (charts shorter). */
  compact?: boolean;
  /** A story visual behind its steps: the side the steps are on, which the design keeps clear. */
  clear?: "left" | "right";
  /** For the pinned visual of a story section: how to measure its scroll value (the section and its steps). */
  scrollMeasure?: Measure;
  /** The view's own colours, if it chose any. */
  palette?: Palette;
  /** The view's typefaces, if it chose any. */
  fonts?: Fonts;
  results: Record<string, QueryResult>;
  mode: Mode;
  theme: Theme;
  hero?: boolean;
  /** A design shown as the view's full-width hero: no frame, no viewport bar. */
  bleed?: boolean;
  /** Design-check findings for this item (warnings: the item still rendered). */
  warn?(messages: string[]): void;
  motion: MotionApi;
  /** URL to load a media src from (a local file's token URL, or the URL itself); undefined while unknown. */
  media(src: string): string | undefined;
  /** Set when the item is shown as the whole screen (page display). */
  page?: { viewport: Viewport };
  /** Opens a design item as the whole screen. */
  openPage?(): void;
  /** Tell the caller what the person did (aurora.send from a design). */
  send(name: string, payload: unknown): void;
  /** Tell the server whether this item drew. Components marked selfReport must call it; others are reported on mount. */
  /** `retract` lets an ok report clear this item's earlier failure for the same version. */
  report(ok: boolean, message?: string, retract?: boolean): void;
};
export type Renderer = FC<{ c: any; ctx: RenderCtx }> & { selfReport?: boolean };

type C<T extends Component["type"]> = Extract<Component, { type: T }>;

const KpiR: Renderer = ({ c, ctx }: { c: C<"kpi">; ctx: RenderCtx }) => <Kpi c={c} results={ctx.results} hero={ctx.hero} color={ctx.theme.categorical[0]} />;
const TextR: Renderer = ({ c, ctx }: { c: C<"text">; ctx: RenderCtx }) => <Text c={c} results={ctx.results} ctx={ctx} />;
const JsonR: Renderer = ({ c, ctx }: { c: { value?: unknown; query?: string }; ctx: RenderCtx }) => <Json value={c.query ? ctx.results[c.query]?.rows : c.value} />;

/**
 * One entry per component type; replacing a component or its engine touches only its line here. Light components
 * are eager; anything with an engine is `load`ed on first use, so a view downloads only the engines it shows.
 */
type Entry = { component: Renderer } | { load: () => Promise<{ default: FC<any> }>; selfReport?: boolean };
const entries: Record<string, Entry> = {
  kpi: { component: KpiR },
  text: { component: TextR },
  json: { component: JsonR },
  chart: { load: () => import("./components/Chart.tsx"), selfReport: true },
  table: { load: () => import("./components/Table.tsx") },
  callout: { load: () => import("./components/Callout.tsx") },
  steps: { load: () => import("./components/Steps.tsx") },
  cards: { load: () => import("./components/Cards.tsx") },
  timeline: { load: () => import("./components/Timeline.tsx") },
  media: { load: () => import("./components/Media.tsx") },
  code: { load: () => import("./components/Code.tsx"), selfReport: true },
  diagram: { load: () => import("./components/Diagram.tsx"), selfReport: true },
  architecture: { load: () => import("./components/Architecture.tsx"), selfReport: true },
  graph: { load: () => import("./components/Graph.tsx"), selfReport: true },
  map: { load: () => import("./components/MapView.tsx"), selfReport: true },
  design: { load: () => import("./components/Design.tsx"), selfReport: true },
  custom: { load: () => import("./components/Design.tsx"), selfReport: true },
};

const cache = new Map<string, Renderer>();

export function rendererFor(type: string): Renderer | undefined {
  const e = entries[type];
  if (!e) return undefined;
  if ("component" in e) return e.component;
  let R = cache.get(type);
  if (!R) {
    R = lazy(e.load) as unknown as Renderer;
    R.selfReport = e.selfReport;
    cache.set(type, R);
  }
  return R;
}
