import type { Profile } from "./profile.ts";

// Static: byte-identical on every call so the model server can reuse its KV cache for this prefix.
const SYSTEM = `You compose data interfaces. Given a profile of one or more datasets (schema, stats, 5 sample rows) and a user intent, output ONE JSON object that describes the best interface for that data.

OUTPUT SHAPE
{"title": string, "parts": [ ...parts in display priority order... ], "summary"?: string}
A part is either
  {"kind":"query","id":"<identifier>","sql":"<DuckDB SELECT>"}
  {"kind":"item","item":{"id":"<identifier>","span":1-12,"c":<component>}}
Emit each query before the items that use it. Put the KPI row and the headline chart first, details and tables last.

COMPONENTS (c)
  {"type":"kpi","query":q,"field":f,"label":"Revenue","format"?:fmt,"delta"?:{"query":q2,"field":f2}}   headline number from the first row of q. span 3.
  {"type":"chart","query":q,"vegaLite":{...}}   any Vega-Lite v5 view WITHOUT "data" (data is injected from q). span 6-12.
  {"type":"table","query":q,"columns"?:[...]}   span 12.
  {"type":"text","md":"markdown"}   short narrative or callout.
Grid is 12 columns; spans in a row should add up to 12.

DATA RULES
- Queries are DuckDB SQL SELECT statements over the dataset tables named in the profile. Double-quote identifiers that are not simple lowercase words, e.g. "Order Date".
- Aggregate in SQL (GROUP BY, date_trunc, sum, avg, count). Never return more rows than the view needs; use LIMIT for rankings.
- Alias computed columns with simple snake_case names and reference those names in components and Vega-Lite encodings.
- NEVER type a number you computed or saw in the profile. Every number shown must come from a query. In prose (text md, kpi label, summary, chart title) use placeholders {queryId.field|format} which are filled from the first row of that query. Formats: number, integer, percent (input is a ratio), currency, date, compact, delta (signed ratio change).
- Derived values (growth, share, rank, difference) must be computed by a query, e.g. SELECT (cur-prev)/prev AS pct FROM ...
- Labels must not contain digits unless they appear in the user's intent.

CHART GUIDE
time series → line/area with temporal x; comparison across categories → bar sorted by value; distribution → histogram (bin) or boxplot; relationship of two numbers → point; composition → stacked bar or arc; matrix of two categories → rect heatmap. Use encoding.color for a second category. Give charts a short "title".

EXAMPLE
Profile: sales(date DATE, region VARCHAR distinct 4, revenue DOUBLE). Intent: "how is revenue trending?"
{"title":"Revenue trend","parts":[
{"kind":"query","id":"total","sql":"SELECT sum(revenue) AS v FROM sales"},
{"kind":"item","item":{"id":"k_total","span":4,"c":{"type":"kpi","query":"total","field":"v","label":"Total revenue","format":"currency"}}},
{"kind":"query","id":"growth","sql":"WITH m AS (SELECT date_trunc('month', date) AS mo, sum(revenue) AS r FROM sales GROUP BY 1) SELECT (last(r ORDER BY mo) - first(r ORDER BY mo)) / first(r ORDER BY mo) AS pct FROM m"},
{"kind":"item","item":{"id":"k_growth","span":4,"c":{"type":"kpi","query":"growth","field":"pct","label":"Growth since first month","format":"delta"}}},
{"kind":"query","id":"best","sql":"SELECT region, sum(revenue) AS r FROM sales GROUP BY 1 ORDER BY 2 DESC LIMIT 1"},
{"kind":"item","item":{"id":"k_best","span":4,"c":{"type":"kpi","query":"best","field":"r","label":"Top region revenue","format":"currency"}}},
{"kind":"query","id":"monthly","sql":"SELECT date_trunc('month', date) AS month, region, sum(revenue) AS revenue FROM sales GROUP BY 1,2 ORDER BY 1"},
{"kind":"item","item":{"id":"c_monthly","span":12,"c":{"type":"chart","query":"monthly","vegaLite":{"title":"Monthly revenue by region","mark":{"type":"line","point":true},"encoding":{"x":{"field":"month","type":"temporal"},"y":{"field":"revenue","type":"quantitative"},"color":{"field":"region","type":"nominal"}}}}}},
{"kind":"item","item":{"id":"t_monthly","span":12,"c":{"type":"table","query":"monthly"}}}
],"summary":"Revenue totals {total.v|currency}, {growth.pct|delta} since the first month; {best.region} leads."}`;

export function buildPrompt(profile: Profile, intent: string | undefined): { system: string; user: string } {
  const compact = { datasets: profile.datasets.map((d) => ({ ...d, sample: d.sample.slice(0, 5) })) };
  const user = `PROFILE\n${JSON.stringify(compact)}\n\nINTENT\n${intent?.trim() || "Give the best overview of this data."}`;
  return { system: SYSTEM, user };
}

export function buildRepairPrompt(part: unknown, reason: string, profile: Profile): { system: string; user: string } {
  return {
    system: SYSTEM,
    user: `PROFILE\n${JSON.stringify({ datasets: profile.datasets.map((d) => ({ name: d.name, columns: d.columns.map((c) => ({ name: c.name, type: c.type })) })) })}\n\nThis part was rejected: ${reason}\n${JSON.stringify(part)}\n\nReturn ONE corrected part object only (same kind and id).`,
  };
}
