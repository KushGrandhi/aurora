// Validated reference palette (dataviz skill): fixed categorical order, light/dark steps selected per surface.
export type Mode = "light" | "dark";

export const TOKENS = {
  light: {
    surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7",
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
    ramp: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
  },
  dark: {
    surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835",
    series: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
    ramp: ["#104281", "#184f95", "#1c5cab", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"],
  },
} as const;

const FONT = 'system-ui, -apple-system, "SF Pro Text", "Segoe UI", sans-serif';

export function vegaConfig(mode: Mode): Record<string, unknown> {
  const t = TOKENS[mode];
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
