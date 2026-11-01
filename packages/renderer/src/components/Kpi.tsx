import type { Component, QueryResult } from "@genui/spec";
import { formatValue } from "../format.ts";

type KpiC = Extract<Component, { type: "kpi" }>;

export function Kpi({ c, results }: { c: KpiC; results: Record<string, QueryResult> }) {
  const row = results[c.query]?.rows[0];
  const delta = c.delta ? results[c.delta.query]?.rows[0]?.[c.delta.field] : undefined;
  return (
    <div className="kpi">
      <div className="label">{c.label}</div>
      <div className="value">{row ? formatValue(row[c.field], c.format) : "—"}</div>
      {delta !== undefined && <div className="delta">{formatValue(delta, "delta")}</div>}
    </div>
  );
}
