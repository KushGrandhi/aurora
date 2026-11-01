import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import countries from "i18n-iso-countries";
import atlas from "world-atlas/countries-110m.json";

let cache: FeatureCollection<Geometry, { name: string }> | undefined;

/** Natural Earth 1:110m country shapes (bundled, offline). Feature ids are ISO 3166 numeric strings, e.g. "250". */
export function countryFeatures(): FeatureCollection<Geometry, { name: string }> {
  const topo = atlas as unknown as Topology<{ countries: GeometryCollection<{ name: string }> }>;
  cache ??= feature(topo, topo.objects.countries) as FeatureCollection<Geometry, { name: string }>;
  return cache;
}

/** ISO alpha-3, alpha-2, numeric code or English name → the numeric id the shapes use. */
export function countryKey(key: string): string | undefined {
  const k = String(key).trim();
  if (/^\d{1,3}$/.test(k)) return k.padStart(3, "0");
  const upper = k.toUpperCase();
  const byCode = upper.length === 3 ? countries.alpha3ToNumeric(upper) : upper.length === 2 ? countries.alpha2ToNumeric(upper) : undefined;
  if (byCode) return byCode;
  const lower = k.toLowerCase();
  const f = countryFeatures().features.find((x) => x.properties.name.toLowerCase() === lower);
  return f?.id === undefined ? undefined : String(f.id);
}
