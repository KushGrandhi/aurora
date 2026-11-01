import type { FC } from "react";
import type { Component, QueryResult } from "@genui/spec";
import type { Mode } from "./theme.ts";
import { Chart } from "./components/Chart.tsx";
import { Json } from "./components/Json.tsx";
import { Kpi } from "./components/Kpi.tsx";
import { Table } from "./components/Table.tsx";
import { Text } from "./components/Text.tsx";

export type RenderCtx = {
  results: Record<string, QueryResult>;
  mode: Mode;
  hero?: boolean;
  /** Tell the server whether this item drew. Components marked selfReport must call it; others are reported on mount. */
  report(ok: boolean, message?: string): void;
};
export type Renderer = FC<{ c: any; ctx: RenderCtx }> & { selfReport?: boolean };

type C<T extends Component["type"]> = Extract<Component, { type: T }>;

const KpiR: Renderer = ({ c, ctx }: { c: C<"kpi">; ctx: RenderCtx }) => <Kpi c={c} results={ctx.results} hero={ctx.hero} />;
const ChartR: Renderer = ({ c, ctx }: { c: C<"chart">; ctx: RenderCtx }) => <Chart c={c} result={ctx.results[c.query]} mode={ctx.mode} onDrawn={ctx.report} />;
ChartR.selfReport = true;
const TableR: Renderer = ({ c, ctx }: { c: C<"table">; ctx: RenderCtx }) => <Table c={c} result={ctx.results[c.query]} />;
const TextR: Renderer = ({ c, ctx }: { c: C<"text">; ctx: RenderCtx }) => <Text c={c} results={ctx.results} />;
const JsonR: Renderer = ({ c, ctx }: { c: { value?: unknown; query?: string }; ctx: RenderCtx }) => <Json value={c.query ? ctx.results[c.query]?.rows : c.value} />;

// One entry per component type; replacing a component or its engine touches only its line here.
const renderers: Record<string, Renderer> = { kpi: KpiR, chart: ChartR, table: TableR, text: TextR, json: JsonR };

export function rendererFor(type: string): Renderer | undefined {
  return renderers[type];
}
