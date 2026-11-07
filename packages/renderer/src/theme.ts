// Validated reference palette (dataviz skill): fixed categorical order, light/dark steps selected per surface.
// The house values live in @aurora/spec (stage.ts), with the derivation of a view's own stage.
import { HOUSE, type Mode, type Stage } from "@aurora/spec";
export type { Mode, Stage };

export const TOKENS = HOUSE;

/** The stage as the screen's CSS variables (the screen's own names; the design sandbox has its own, see design/tokens.ts). */
export function stageVars(t: Stage): Record<string, string> {
  return {
    "--page": t.page, "--surface": t.surface, "--raised": t.raised, "--ink": t.ink, "--ink2": t.ink2, "--muted": t.muted,
    "--hair": t.hair, "--grid": t.grid, "--accent": t.accent, "--good": t.good, "--bad": t.bad, "--warn": t.warn, "--violet": t.violet,
    "--shadow": t.shadow, "--shadow-hover": t.shadowHover, "--skeleton-a": t.skeletonA, "--skeleton-b": t.skeletonB, "--side": t.side, "--band": t.band,
    ...Object.fromEntries(t.series.map((c, i) => [`--s${i + 1}`, c])),
  };
}

const HOUSE_FONT = '"Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif';

/** Vega-Lite theme for a stage (the house theme, or a view's own). */
export function vegaConfig(t: Stage, FONT = HOUSE_FONT): Record<string, unknown> {
  const axis = {
    domainColor: t.axis, gridColor: t.grid, gridWidth: 1, tickColor: t.axis, tickSize: 4,
    labelColor: t.muted, labelFont: FONT, labelFontSize: 11, labelPadding: 6, labelAngle: 0, labelOverlap: "greedy", labelLimit: 160, tickCount: 6,
    titleColor: t.ink2, titleFont: FONT, titleFontSize: 11, titleFontWeight: 500, titlePadding: 10,
  };
  return {
    background: null,
    font: FONT,
    padding: { top: 4, right: 8, bottom: 4, left: 4 },
    view: { stroke: null },
    title: { color: t.ink, font: FONT, fontSize: 14, fontWeight: 600, anchor: "start", offset: 14, subtitleColor: t.ink2 },
    axis,
    axisX: { grid: false },
    axisY: { domain: false, ticks: false },
    axisBand: { grid: false },
    legend: {
      labelColor: t.ink2, labelFont: FONT, labelFontSize: 12, titleColor: t.ink2, titleFont: FONT, titleFontSize: 11, titleFontWeight: 500,
      symbolType: "circle", symbolSize: 80, orient: "top", direction: "horizontal", columnPadding: 14,
    },
    range: { category: [...t.series], ordinal: [...t.ramp], ramp: [...t.ramp], heatmap: [...t.ramp] },
    mark: { color: t.series[0] },
    bar: { cornerRadiusEnd: 4, discreteBandSize: { band: 0.6 }, maxBandSize: 24 } as unknown,
    line: { strokeWidth: 2, strokeCap: "round", strokeJoin: "round" },
    point: { size: 64, filled: true, stroke: t.surface, strokeWidth: 2 },
    area: { opacity: 0.12, line: { strokeWidth: 2 } },
    arc: { stroke: t.surface, strokeWidth: 2 },
    rect: { stroke: t.surface, strokeWidth: 2 },
    circle: { size: 64, stroke: t.surface, strokeWidth: 2 },
  };
}
