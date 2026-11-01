import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

const PointsQuery = z.object({ query: IdSchema, lat: z.string(), lon: z.string(), label: z.string().optional(), size: z.string().optional() });
const PointList = z.array(z.object({ lat: z.number(), lon: z.number(), label: z.string().optional() }));

export const MapSchema = z.object({
  type: z.literal("map"),
  points: z.union([PointsQuery, PointList]).optional(),
  routes: z.array(z.object({ path: z.array(z.tuple([z.number(), z.number()])).min(2), label: z.string().optional() })).optional(),
  choropleth: z.object({ query: IdSchema, key: z.string(), value: z.string() }).optional(),
  center: z.tuple([z.number(), z.number()]).optional(),
  zoom: z.number().optional(),
  tiles: z.enum(["osm", "none"]).optional(),
});
export type MapSpec = z.infer<typeof MapSchema>;

export const map: ComponentDef<MapSpec> = {
  type: "map",
  schema: MapSchema,
  doc: {
    summary: "A world map with points, routes and a country choropleth. Country shapes are bundled and work offline; street tiles are an optional online layer.",
    example: {
      type: "map",
      points: { query: "map_cities", lat: "lat", lon: "lon", label: "city", size: "visitors" },
      choropleth: { query: "map_by_country", key: "iso3", value: "visitors" },
      routes: [{ path: [[-0.13, 51.51], [2.35, 48.86], [13.4, 52.52]], label: "Tour" }],
      tiles: "none",
    },
    guidance: "Pick it for data about places. Points come from a query with lat/lon columns (or an authored list); `size` names a numeric column. Choropleth `key` is a column holding ISO alpha-3, alpha-2, numeric code or country name. Route paths are [lon, lat] pairs. The view fits the data unless `center` [lon, lat] and `zoom` are given. `tiles: \"none\"` keeps it fully offline.",
    fixture: {
      datasets: {
        map_city_rows: { inline: [{ city: "London", lat: 51.51, lon: -0.13, visitors: 820 }, { city: "Paris", lat: 48.86, lon: 2.35, visitors: 640 }, { city: "Berlin", lat: 52.52, lon: 13.4, visitors: 410 }, { city: "Lisbon", lat: 38.72, lon: -9.14, visitors: 230 }] },
        map_country_rows: { inline: [{ iso3: "GBR", visitors: 820 }, { iso3: "FRA", visitors: 640 }, { iso3: "DEU", visitors: 410 }, { iso3: "PRT", visitors: 230 }] },
      },
      queries: {
        map_cities: { sql: "SELECT city, lat, lon, visitors FROM map_city_rows" },
        map_by_country: { sql: "SELECT iso3, visitors FROM map_country_rows" },
      },
    },
  },
  dataBound: (c) => [...(c.points && !Array.isArray(c.points) ? [c.points.query] : []), ...(c.choropleth ? [c.choropleth.query] : [])],
  check: (c) => (c.points || c.routes || c.choropleth || c.center ? null : "map needs `points`, `routes`, `choropleth` or `center`"),
};
