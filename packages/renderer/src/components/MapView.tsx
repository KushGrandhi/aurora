import { useEffect, useMemo, useRef } from "react";
import { formatValue, humanizeField, inferFormat, type MapSpec } from "@genui/spec";
import { countryKey } from "../countries.ts";
import { choroplethClasses, maplibreEngine, type MapData } from "../engines/map.ts";
import type { RenderCtx } from "../registry.tsx";

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : undefined);

function mapData(c: MapSpec, ctx: RenderCtx): MapData {
  const p = c.points;
  const points = !p ? [] : Array.isArray(p) ? p : (ctx.results[p.query]?.rows ?? []).flatMap((r) => {
    const lat = num(r[p.lat]);
    const lon = num(r[p.lon]);
    if (lat === undefined || lon === undefined) return [];
    return [{ lat, lon, label: p.label ? String(r[p.label] ?? "") : undefined, size: p.size ? num(r[p.size]) : undefined }];
  });
  let choropleth: MapData["choropleth"];
  if (c.choropleth) {
    const ch = c.choropleth;
    const values: Record<string, number> = {};
    for (const r of ctx.results[ch.query]?.rows ?? []) {
      const id = countryKey(String(r[ch.key] ?? ""));
      const v = num(r[ch.value]);
      if (id && v !== undefined) values[id] = v;
    }
    choropleth = { field: ch.value, values };
  }
  return { points, routes: c.routes ?? [], choropleth, center: c.center, zoom: c.zoom, tiles: c.tiles ?? "osm" };
}

/** World map: bundled country shapes always, street tiles when online. */
export default function MapView({ c, ctx }: { c: MapSpec; ctx: RenderCtx }) {
  const box = useRef<HTMLDivElement>(null);
  const inst = useRef<ReturnType<typeof maplibreEngine.mount>>();
  const data = useMemo(() => mapData(c, ctx), [c, ctx.results]);
  const key = JSON.stringify(data);

  useEffect(() => {
    if (!box.current) return;
    inst.current = maplibreEngine.mount(box.current, data, { theme: ctx.theme, mode: ctx.mode, reduced: ctx.motion.reduced, onLoad: () => ctx.report(true) });
    return () => { inst.current?.destroy(); inst.current = undefined; };
  }, [ctx.theme, ctx.mode, ctx.motion.reduced]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    inst.current?.update(data);
    ctx.report(true);
  }, [key]);

  const ch = data.choropleth;
  const vals = ch ? Object.values(ch.values) : [];
  const { breaks, colors } = choroplethClasses(vals, ctx.theme.sequential);
  const fmt = ch ? inferFormat(ch.field) : undefined;
  const edges = vals.length ? [Math.min(...vals), ...breaks, Math.max(...vals)] : [];
  return (
    <div className="mapview">
      <div ref={box} className="map-canvas" />
      {ch && vals.length > 0 && (
        <div className="map-legend">
          <span className="ml-title">{humanizeField(ch.field)}</span>
          <span className="ml-scale">{(breaks.length ? colors : [colors[2]]).map((col, i) => <i key={i} style={{ background: col }} title={`${formatValue(edges[i], fmt)} – ${formatValue(edges[i + 1] ?? edges[i], fmt)}`} />)}</span>
          <span className="ml-range">{formatValue(edges[0], fmt)} – {formatValue(edges[edges.length - 1], fmt)}</span>
        </div>
      )}
    </div>
  );
}
