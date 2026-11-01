import { humanizeField as human, type Item, type Spec } from "@aurora/spec";
import { isNumericType, isTemporalType, type DatasetProfile, type Profile } from "./profile.ts";
import { quoteIdent as q } from "./sql.ts";

const isText = (d: DatasetProfile) => d.columns.length === 2 && d.columns[0].name === "name" && d.columns[1].name === "body";

function rangeDays(min: unknown, max: unknown): number {
  const a = Date.parse(String(min));
  const b = Date.parse(String(max));
  return isNaN(a) || isNaN(b) ? Infinity : (b - a) / 86_400_000;
}

function datasetItems(d: DatasetProfile, multi: boolean, spec: Spec): Item[] {
  const items: Item[] = [];
  const t = q(d.name);
  const id = (s: string) => `d_${d.name}_${s}`;
  const add = (key: string, sql: string) => {
    spec.queries[id(key)] = { sql };
    return id(key);
  };
  const of = multi ? ` in ${d.name}` : "";

  if (d.rowCount === 0) {
    return [{ id: id("empty"), span: 12, c: { type: "text", md: `No rows in **${d.name}**.` } }];
  }
  if (isText(d)) {
    for (let n = 0; n < Math.min(d.rowCount, 5); n++) {
      const qid = add(`doc${n}`, `SELECT body FROM ${t} ORDER BY name LIMIT 1 OFFSET ${n}`);
      items.push({ id: id(`doc${n}`), span: 12, c: { type: "text", doc: { query: qid, field: "body" } } });
    }
    return items;
  }

  items.push({ id: id("rows"), span: 3, c: { type: "kpi", query: add("rows", `SELECT count(*) AS n FROM ${t}`), field: "n", label: `Rows${of}`, format: "integer" } });

  const numeric = d.columns.filter((c) => isNumericType(c.type));
  const temporal = d.columns.find((c) => isTemporalType(c.type));
  const category = d.columns.find((c) => c.type === "VARCHAR" && c.distinct >= 2 && c.distinct <= 50);
  let used: string | undefined;

  if (temporal && numeric.length) {
    const num = numeric[numeric.length - 1];
    used = num.name;
    const unit = rangeDays(temporal.min, temporal.max) > 90 ? "month" : "day";
    const qid = add("trend", `SELECT date_trunc('${unit}', ${q(temporal.name)}) AS x, sum(${q(num.name)}) AS y FROM ${t} GROUP BY 1 ORDER BY 1`);
    items.push({ id: id("trend"), span: 9, c: { type: "chart", query: qid, vegaLite: {
      title: `${human(num.name)} by ${unit}`, mark: { type: "line", point: true },
      encoding: { x: { field: "x", type: "temporal", title: null }, y: { field: "y", type: "quantitative", title: human(num.name, true) } },
    } } });
  } else if (category) {
    const qid = add("cats", `SELECT ${q(category.name)} AS x, count(*) AS y FROM ${t} GROUP BY 1 ORDER BY 2 DESC LIMIT 20`);
    items.push({ id: id("cats"), span: 9, c: { type: "chart", query: qid, vegaLite: {
      title: `Rows by ${human(category.name).toLowerCase()}`, mark: "bar",
      encoding: { y: { field: "x", type: "nominal", sort: "-x", title: null }, x: { field: "y", type: "quantitative", title: "Rows", axis: { tickMinStep: 1 } } },
    } } });
  }

  const hist = numeric.find((c) => c.name !== used) ?? (used ? undefined : numeric[0]);
  if (hist) {
    const qid = add("hist", `SELECT ${q(hist.name)} AS v FROM ${t} WHERE ${q(hist.name)} IS NOT NULL`);
    items.push({ id: id("hist"), span: 6, c: { type: "chart", query: qid, vegaLite: {
      title: `Distribution of ${human(hist.name).toLowerCase()}`, mark: "bar",
      encoding: { x: { field: "v", bin: true, type: "quantitative", title: human(hist.name, true) }, y: { aggregate: "count", type: "quantitative", title: "Count" } },
    } } });
  }

  items.push({ id: id("table"), span: 12, c: { type: "table", query: add("table", `SELECT * FROM ${t} LIMIT 1000`) } });
  return items;
}

export function defaultSpec(profile: Profile): Spec {
  const multi = profile.datasets.length > 1;
  const spec: Spec = {
    v: 1,
    title: multi ? "Overview" : `Overview of ${profile.datasets[0]?.name ?? "data"}`,
    queries: {},
    layout: { type: "grid", cols: 12, items: [] },
  };
  for (const d of profile.datasets) spec.layout.items.push(...datasetItems(d, multi, spec));
  return spec;
}
