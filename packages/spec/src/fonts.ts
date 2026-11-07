import { z } from "zod";
import { FONT_CATALOG, type FontRow } from "./fonts-catalog.ts";

/**
 * Fonts by Google Fonts family name. The catalog (fonts-catalog.ts, generated) knows every family, its category and
 * which weights and italics it has, so names are checked offline and the request to Google is built to match.
 */
export type FontEntry = { family: string; category: FontRow[1]; weights: string; italic: boolean; slug: string };

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
let index: Map<string, FontRow> | undefined;
const byName = () => (index ??= new Map(FONT_CATALOG.map((r) => [key(r[0]), r])));

let slugs: Map<string, FontRow> | undefined;
export function fontEntryBySlug(slug: string): FontEntry | undefined {
  const r = (slugs ??= new Map(FONT_CATALOG.map((r) => [fontSlug(r[0]), r]))).get(slug);
  return r ? fontEntry(r[0]) : undefined;
}

export const fontSlug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function fontEntry(name: string): FontEntry | undefined {
  const r = byName().get(key(name));
  return r ? { family: r[0], category: r[1], weights: r[2], italic: r[3] === 1, slug: fontSlug(r[0]) } : undefined;
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

/** The closest family names to a name that isn't one, most popular first among equals. */
export function suggestFonts(name: string, n = 3): string[] {
  const k = key(name);
  return FONT_CATALOG.map((r) => [r[0], distance(k, key(r[0]))] as const)
    .sort((a, b) => a[1] - b[1]).slice(0, n).map((x) => x[0]);
}

/** The `family=` value for Google's CSS2 API: every weight and italic the family has, nothing it lacks (that is a 400). */
export function css2Family(e: FontEntry): string {
  const name = e.family.replace(/ /g, "+");
  const range = e.weights.includes("..");
  const ws = range ? [e.weights] : e.weights.split(",");
  if (!range && ws.length === 1 && ws[0] === "400" && !e.italic) return name;
  if (!e.italic) return `${name}:wght@${ws.join(";")}`;
  return `${name}:ital,wght@${[...ws.map((w) => `0,${w}`), ...ws.map((w) => `1,${w}`)].join(";")}`;
}

/** The fallback a family stands in for when it can't be had: one of aurora's bundled faces, by category. */
export function fallbackFamily(category: FontRow[1]): string | undefined {
  return category === "serif" ? "Newsreader" : category === "mono" ? undefined : "Hanken Grotesk";
}

const Family = z.string().min(1).max(60);
/** A view's typefaces by Google Fonts family name: display for headlines, body for reading, mono for code, extra for designs. */
export const FontsSchema = z.object({ display: Family.optional(), body: Family.optional(), mono: Family.optional(), extra: z.array(Family).max(6).optional() });
export type Fonts = z.infer<typeof FontsSchema>;
export const fontFamilies = (f?: Fonts) => [...new Set([f?.display, f?.body, f?.mono, ...(f?.extra ?? [])].filter((x): x is string => !!x))];
