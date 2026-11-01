// Canned composition for GENUI_FAKE_PROVIDER=1 (smoke tests, demos without a model). Targets sales.csv-shaped data.
export const fakeSalesDoc = {
  title: "Revenue overview",
  parts: [
    { kind: "query", id: "total", sql: "SELECT sum(revenue) AS v FROM data" },
    { kind: "item", item: { id: "k_total", span: 4, c: { type: "kpi", query: "total", field: "v", label: "Total revenue", format: "currency" } } },
    { kind: "query", id: "units", sql: "SELECT sum(units) AS v FROM data" },
    { kind: "item", item: { id: "k_units", span: 4, c: { type: "kpi", query: "units", field: "v", label: "Units sold", format: "integer" } } },
    { kind: "query", id: "regions", sql: "SELECT count(DISTINCT region) AS v FROM data" },
    { kind: "item", item: { id: "k_regions", span: 4, c: { type: "kpi", query: "regions", field: "v", label: "Regions", format: "integer" } } },
    { kind: "query", id: "monthly", sql: "SELECT date_trunc('month', date) AS month, region, sum(revenue) AS revenue FROM data GROUP BY 1, 2 ORDER BY 1" },
    { kind: "item", item: { id: "c_monthly", span: 8, c: { type: "chart", query: "monthly", vegaLite: { title: "Monthly revenue by region", mark: { type: "line", point: true }, encoding: { x: { field: "month", type: "temporal" }, y: { field: "revenue", type: "quantitative" }, color: { field: "region", type: "nominal" } } } } } },
    { kind: "query", id: "byRegion", sql: "SELECT region, sum(revenue) AS revenue FROM data GROUP BY 1 ORDER BY 2 DESC" },
    { kind: "item", item: { id: "c_region", span: 4, c: { type: "chart", query: "byRegion", vegaLite: { title: "Revenue by region", mark: "bar", encoding: { y: { field: "region", type: "nominal", sort: "-x" }, x: { field: "revenue", type: "quantitative" } } } } } },
    { kind: "query", id: "top", sql: "SELECT region, sum(revenue) AS region_revenue FROM data GROUP BY 1 ORDER BY 2 DESC LIMIT 1" },
    { kind: "item", item: { id: "t_note", span: 12, c: { type: "text", md: "**{top.region}** leads with {top.region_revenue|currency} of {total.v|currency} total." } } },
    { kind: "item", item: { id: "t_monthly", span: 12, c: { type: "table", query: "monthly", title: "Monthly revenue by region" } } },
  ],
  summary: "Total revenue {total.v|currency} across {regions.v|integer} regions.",
};
