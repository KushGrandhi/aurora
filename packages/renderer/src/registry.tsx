import { lazy, type FC } from "react";
import type { Component, QueryResult } from "@aurora/spec";
import type { MotionApi } from "./motion.tsx";
import { TOKENS, type Mode } from "./theme.ts";
import { Json } from "./components/Json.tsx";
import { Kpi } from "./components/Kpi.tsx";
import { Text } from "./components/Text.tsx";

export type Theme = { categorical: readonly string[]; sequential: readonly string[]; ink: string; ink2: string; muted: string; surface: string; hair: string; axis: string };

export function themeFor(mode: Mode): Theme {
  const t = TOKENS[mode];
  return { categorical: t.series, sequential: t.ramp, ink: t.ink, ink2: t.ink2, muted: t.muted, surface: t.surface, hair: t.grid, axis: t.axis };
}

export type Viewport = "desktop" | "tablet" | "phone";

export type RenderCtx = {
  results: Record<string, QueryResult>;
  mode: Mode;
  theme: Theme;
  hero?: boolean;
  /** A design shown as the view's full-width hero: no frame, no viewport bar. */
  bleed?: boolean;
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
const TextR: Renderer = ({ c, ctx }: { c: C<"text">; ctx: RenderCtx }) => <Text c={c} results={ctx.results} />;
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
