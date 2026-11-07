# Data: datasets, queries and filters

Read this before showing anything computed from a data file. aurora runs SQL (DuckDB) over the user's files in place, so data never passes through your context.

## Steps

1. **Profile** the file with `mcp__aurora__profile`: you get columns, types, stats and sample rows.
2. **Attach** it as a dataset and **write queries** in the view.
3. **Bind** components to queries: `kpi`, `chart`, `table`, and `text`/`json` that read a query.
4. **Add filters** (`params`) when the reader will want to slice it.

```json
{
  "v": 2, "id": "sales", "title": "Sales this year",
  "datasets": { "orders": "/abs/path/orders.csv" },
  "queries": {
    "total": { "sql": "SELECT sum(amount) AS total_revenue FROM orders WHERE ($region IS NULL OR region = $region)" },
    "by_month": { "sql": "SELECT date_trunc('month', date) AS month, sum(amount) AS revenue FROM orders WHERE ($region IS NULL OR region = $region) GROUP BY 1 ORDER BY 1" },
    "regions": { "sql": "SELECT DISTINCT region FROM orders ORDER BY 1" }
  },
  "params": { "region": { "type": "select", "label": "Region", "options": { "query": "regions", "field": "region" } } },
  "sections": [ { "id": "top", "layout": "grid", "items": [
    { "id": "k_total", "span": 4, "c": { "type": "kpi", "query": "total", "field": "total_revenue", "label": "Revenue", "format": "currency", "sparkline": { "query": "by_month", "x": "month", "y": "revenue" } } },
    { "id": "trend", "span": 12, "c": { "type": "chart", "query": "by_month", "vegaLite": { "mark": "line", "encoding": { "x": { "field": "month", "type": "temporal" }, "y": { "field": "revenue", "type": "quantitative" } } } } }
  ] } ]
}
```

## Datasets

A `datasets` value is an absolute path (csv, tsv, json, ndjson, parquet, a folder of .md), `{"path", "format"}`, or `{"inline": [rows]}` for small data you already hold. Add one later with `{"op":"addDataset","name","input"}`.

## Query rules

- Queries read from a dataset table (`FROM <dataset>`). Constant `SELECT`s are rejected.
- Alias columns descriptively (`AS total_revenue`, `AS size_mb`): units and formats are inferred from the names.
- A headline number (a `kpi`, or a `{query.field|format}` placeholder in prose) reads the first row, so its query returns exactly one row: an aggregate, or `ORDER BY … LIMIT 1`.
- Numbers in data-bound components come from queries. Never type a figure from the data into a label or title; labels name the measure in words.
- Your own prose is free ("3 replicas" is fine). When a figure comes from the data, write a placeholder like `{total.total_revenue|currency}`. Formats: number, integer, percent, currency, date, compact, delta, bytes, kilobytes, megabytes, gigabytes.
- Add or change a query with `{"op":"addQuery","id","sql"}`.

## Charts

- Categories go on the y axis as horizontal bars sorted by value (`"sort": "-x"`). Time goes on x as a line.
- One measure per chart; no dual axes. Fields are the query's column names; never inline values.
- aurora themes every chart with the screen's palette: don't set colors unless a series has a fixed meaning.

## Filters (params)

A view's `params` become one row of filters above its sections. Queries read them as bound variables; aurora never pastes values into SQL.

```json
"params": {
  "region": { "type": "select", "label": "Region", "options": { "query": "regions", "field": "region" } },
  "price":  { "type": "range", "label": "Price", "min": 0, "max": 500 },
  "when":   { "type": "daterange", "label": "Order date" },
  "q":      { "type": "search", "label": "Product" },
  "top":    { "type": "number", "label": "Orders shown", "min": 5, "max": 50, "step": 5, "default": 10 }
}
```

- `select` gives `$name` (null means "All"; options come from a list or from a query's column), `search` gives `$name` (text), `range` gives `$name_min` and `$name_max`, `daterange` gives `$name_from` and `$name_to` (ISO dates or null), `number` gives `$name` (one number; `unit` labels it).
- **Controls in prose:** write `{{name}}` in a `text` item and that param becomes a control inside the sentence: a `number` is a value the reader drags sideways ("Show the {{top}} largest orders"), a `select` an underlined choice. A param used this way leaves the filter row. Designs read params as `aurora.params` (`onParams`), or the kit's `useParam("name")`.
- Write queries that work when a filter is unset: `WHERE ($region IS NULL OR region = $region)`, `AND ($when_from IS NULL OR date >= $when_from::DATE)`, `AND ($q = '' OR product ILIKE '%' || $q || '%')`.
- Changing a filter on screen re-runs only the queries that use it. `status` shows current values under `params`; set one with `POST /api/views/<id>/params {"name","value"}`.
- A query that uses a `$var` that no param provides is an error.
- Patch ops: `{"op":"addParam","name","param":{…}}` adds or replaces a filter, `{"op":"removeParam","name"}` removes one.

## Data in a design

A `design` can draw rows itself: `"data": ["by_month"]` puts them in `window.aurora.data.by_month`, and `window.aurora.onData(cb)` fires when filters change them. Prefer `chart` and `table` unless the visual is truly custom.

## Media

Media is displayed, never generated: `media` and `cards` show images and videos that already exist. Use absolute local paths (png, jpg, gif, webp, avif, svg, mp4, webm, mov, m4v, ogg) or http(s) URLs. aurora serves a local file only because an accepted view references it, at a private token URL. A missing or unsupported file comes back as a warning on the item.
