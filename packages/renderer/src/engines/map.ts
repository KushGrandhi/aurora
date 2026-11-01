// Adapter for maps. Only this file knows the engine (MapLibre); the MapView chunk loads it lazily.
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, LngLatBoundsLike, MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url"; // served by genui like every other asset
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { countryFeatures } from "../countries.ts";
import type { Theme } from "../registry.tsx";

export type MapData = {
  points: { lon: number; lat: number; label?: string; size?: number }[];
  routes: { path: [number, number][]; label?: string }[];
  choropleth?: { field: string; values: Record<string, number> }; // numeric country id → value
  center?: [number, number];
  zoom?: number;
  tiles: "osm" | "none";
};
export type MapOpts = { theme: Theme; mode: "light" | "dark"; reduced: boolean; onLoad(): void };
export type MapEngine = { mount(el: HTMLElement, data: MapData, opts: MapOpts): { update(data: MapData): void; destroy(): void } };

maplibregl.setWorkerUrl(workerUrl);

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const STEPS = 5;

/** Five equal-interval classes over the values; `breaks` are the four inner thresholds. */
export function choroplethClasses(values: number[], ramp: readonly string[]): { breaks: number[]; colors: string[] } {
  const pick = [0, 2, 3, 5, 6].map((i) => ramp[Math.min(i, ramp.length - 1)]);
  if (!values.length) return { breaks: [], colors: pick };
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = (hi - lo) / STEPS;
  return { breaks: step > 0 ? Array.from({ length: STEPS - 1 }, (_, i) => lo + step * (i + 1)) : [], colors: pick };
}

function countriesWith(data: MapData): FeatureCollection<Geometry, { name: string; v?: number }> {
  const fc = countryFeatures();
  const vals = data.choropleth?.values ?? {};
  return { type: "FeatureCollection", features: fc.features.map((f) => ({ ...f, properties: { ...f.properties, ...(f.id !== undefined && String(f.id) in vals ? { v: vals[String(f.id)] } : {}) } })) };
}
const pointsFC = (d: MapData): FeatureCollection => ({ type: "FeatureCollection", features: d.points.map((p): Feature => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] }, properties: { label: p.label ?? "", size: p.size ?? null } })) });
const routesFC = (d: MapData): FeatureCollection => ({ type: "FeatureCollection", features: d.routes.map((r): Feature => ({ type: "Feature", geometry: { type: "LineString", coordinates: r.path }, properties: { label: r.label ?? "" } })) });

function bounds(d: MapData): LngLatBoundsLike | undefined {
  // Points, routes and each choropleth country's main landmass (overseas territories would zoom out to the whole world).
  const pts: [number, number][] = [...d.points.map((p): [number, number] => [p.lon, p.lat]), ...d.routes.flatMap((r) => r.path)];
  if (d.choropleth) {
    const ids = new Set(Object.keys(d.choropleth.values));
    for (const f of countryFeatures().features) {
      if (f.id === undefined || !ids.has(String(f.id))) continue;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [];
      const main = polys.reduce<number[][][] | undefined>((best, p) => (!best || p[0].length > best[0].length ? p : best), undefined);
      if (main) pts.push(...(main[0] as [number, number][]));
    }
  }
  if (!pts.length) return undefined;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

function style(d: MapData, opts: MapOpts): StyleSpecification {
  const t = opts.theme;
  const land = opts.mode === "dark" ? "#242422" : "#efeee9";
  const { breaks, colors } = choroplethClasses(Object.values(d.choropleth?.values ?? {}), t.sequential);
  const valueColor = breaks.length ? (["step", ["get", "v"], colors[0], ...breaks.flatMap((b, i) => [b, colors[i + 1]])] as never) : colors[2];
  const tiles = d.tiles === "osm";
  return {
    version: 8,
    sources: {
      countries: { type: "geojson", data: countriesWith(d) as never },
      routes: { type: "geojson", data: routesFC(d) as never },
      points: { type: "geojson", data: pointsFC(d) as never },
      ...(tiles ? { osm: { type: "raster" as const, tiles: [OSM], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" } } : {}),
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": t.surface } },
      // Bundled land under the street tiles: if the tiles never arrive, this is the map.
      { id: "land", type: "fill", source: "countries", paint: { "fill-color": land } },
      ...(tiles ? [{ id: "osm", type: "raster" as const, source: "osm", paint: { "raster-opacity": 0.85 } }] : []),
      { id: "choropleth", type: "fill", source: "countries", filter: ["has", "v"], paint: { "fill-color": valueColor, "fill-opacity": tiles ? 0.75 : 1 } },
      { id: "borders", type: "line", source: "countries", paint: { "line-color": opts.mode === "dark" ? "#3a3a37" : t.axis, "line-width": 0.6 } },
      { id: "routes", type: "line", source: "routes", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": t.categorical[1], "line-width": 2 } },
      { id: "points", type: "circle", source: "points", paint: {
        "circle-color": t.categorical[0],
        "circle-radius": d.points.some((p) => p.size !== undefined)
          ? (["interpolate", ["linear"], ["coalesce", ["get", "size"], 0], Math.min(...d.points.map((p) => p.size ?? 0)), 4, Math.max(1, ...d.points.map((p) => p.size ?? 0)), 18] as never)
          : 6,
        "circle-stroke-color": t.surface,
        "circle-stroke-width": 2,
      } },
    ],
  };
}

export const maplibreEngine: MapEngine = {
  mount(el, data, opts) {
    const fit = bounds(data);
    const map = new maplibregl.Map({
      container: el,
      style: style(data, opts),
      center: data.center ?? [0, 20],
      zoom: data.zoom ?? 1,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true, preserveDrawingBuffer: true },
      fadeDuration: opts.reduced ? 0 : 300,
    });
    map.on("error", () => {}); // unreachable tiles: the bundled layers stay
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
    map.on("mousemove", "points", (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || !f.properties.label) return;
      map.getCanvas().style.cursor = "pointer";
      popup.setLngLat((f.geometry as unknown as { coordinates: [number, number] }).coordinates).setText(String(f.properties.label)).addTo(map);
    });
    map.on("mouseleave", "points", () => { map.getCanvas().style.cursor = ""; popup.remove(); });
    map.once("load", () => {
      if (!data.center && fit) map.fitBounds(fit, { padding: 48, maxZoom: 5, duration: 0 });
      opts.onLoad();
    });
    return {
      update(next) {
        if (!map.isStyleLoaded()) return;
        if (next.tiles !== data.tiles) map.setStyle(style(next, opts));
        else {
          (map.getSource("countries") as GeoJSONSource).setData(countriesWith(next) as never);
          (map.getSource("points") as GeoJSONSource).setData(pointsFC(next) as never);
          (map.getSource("routes") as GeoJSONSource).setData(routesFC(next) as never);
          const s = style(next, opts);
          for (const id of ["choropleth", "points"]) {
            const paint = s.layers.find((l) => l.id === id)!.paint as Record<string, unknown>;
            for (const [k, v] of Object.entries(paint)) map.setPaintProperty(id, k as never, v as never);
          }
        }
        data = next;
        const duration = opts.reduced ? 0 : 600;
        if (next.center) map.flyTo({ center: next.center, zoom: next.zoom ?? map.getZoom(), duration });
        else {
          const b = bounds(next);
          if (b) map.fitBounds(b, { padding: 48, maxZoom: 5, duration });
        }
      },
      destroy() {
        map.remove();
      },
    };
  },
};
