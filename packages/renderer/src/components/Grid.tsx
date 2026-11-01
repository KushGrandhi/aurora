import { itemQueries, type Item, type QueryResult } from "@genui/spec";
import { packRows } from "../layout.ts";
import type { Mode } from "../theme.ts";
import { Chart } from "./Chart.tsx";
import { Kpi } from "./Kpi.tsx";
import { Table } from "./Table.tsx";
import { Text } from "./Text.tsx";

function Body({ item, results, mode, hero }: { item: Item; results: Record<string, QueryResult>; mode: Mode; hero: boolean }) {
  const c = item.c;
  switch (c.type) {
    case "kpi": return <Kpi c={c} results={results} hero={hero} />;
    case "chart": return <Chart c={c} result={results[c.query]} mode={mode} />;
    case "table": return <Table c={c} result={results[c.query]} />;
    case "text": return <Text c={c} results={results} />;
  }
}

export function Grid({ items, results, mode }: { items: Item[]; results: Record<string, QueryResult>; mode: Mode }) {
  const packed = packRows(items);
  // One hero figure per view: the first KPI, when it opens a run of at most three.
  const firstKpi = packed.findIndex((i) => i.c.type === "kpi");
  const heroId = firstKpi >= 0 && packed[firstKpi].span >= 4 ? packed[firstKpi].id : undefined;
  return (
    <div className="grid">
      {packed.map((item, i) => {
        const ready = itemQueries(item).every((q) => results[q]);
        return (
          <section key={item.id} data-item={item.id} data-type={item.c.type}
            className={`card${item.id.startsWith("d_") ? " default" : ""}`}
            style={{ gridColumn: `span ${item.span}`, viewTransitionName: `item-${item.id}`, ["--i" as string]: i }}>
            {ready ? <Body item={item} results={results} mode={mode} hero={item.id === heroId} /> : <div className="skeleton" />}
          </section>
        );
      })}
    </div>
  );
}
