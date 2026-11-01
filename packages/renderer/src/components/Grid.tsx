import { itemQueries, type Item, type QueryResult } from "@genui/spec";
import { Chart } from "./Chart.tsx";
import { Kpi } from "./Kpi.tsx";
import { Table } from "./Table.tsx";
import { Text } from "./Text.tsx";

function Body({ item, results }: { item: Item; results: Record<string, QueryResult> }) {
  const c = item.c;
  switch (c.type) {
    case "kpi": return <Kpi c={c} results={results} />;
    case "chart": return <Chart c={c} result={results[c.query]} />;
    case "table": return <Table c={c} result={results[c.query]} />;
    case "text": return <Text c={c} results={results} />;
  }
}

export function Grid({ items, results }: { items: Item[]; results: Record<string, QueryResult> }) {
  return (
    <div className="grid">
      {items.map((item) => {
        const ready = itemQueries(item).every((q) => results[q]);
        return (
          <section key={item.id} data-item={item.id} data-type={item.c.type}
            className={`card${item.id.startsWith("d_") ? " default" : ""}`} style={{ gridColumn: `span ${item.span}` }}>
            {ready ? <Body item={item} results={results} /> : <div className="skeleton" />}
          </section>
        );
      })}
    </div>
  );
}
