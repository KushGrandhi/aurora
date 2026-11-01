import type { QueryResult } from "./events.ts";
import { FORMATS, type Format } from "./spec.ts";

export const PLACEHOLDER_RE = /\{([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\|(\w+))?\}/g;

export type PlaceholderRef = { queryId: string; field: string; format?: Format };

export function parsePlaceholders(text: string): PlaceholderRef[] {
  const refs: PlaceholderRef[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const ref: PlaceholderRef = { queryId: m[1], field: m[2] };
    if (m[3] && (FORMATS as readonly string[]).includes(m[3])) ref.format = m[3] as Format;
    refs.push(ref);
  }
  return refs;
}

export function formatValue(v: unknown, format?: Format): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : NaN;
  switch (format) {
    case "date": {
      const d = new Date(v as string);
      return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("en-US", { timeZone: "UTC" });
    }
    case "currency":
      return isNaN(n) ? String(v) : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    case "percent":
      return isNaN(n) ? String(v) : new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(n);
    case "delta": {
      if (isNaN(n)) return String(v);
      const s = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(n));
      return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
    }
    case "compact":
      return isNaN(n) ? String(v) : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    case "integer":
      return isNaN(n) ? String(v) : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
    default:
      return isNaN(n) ? String(v) : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
  }
}

export function fillPlaceholders(text: string, results: Record<string, QueryResult | undefined>): string {
  return text.replace(PLACEHOLDER_RE, (_m, q: string, field: string, fmt?: string) => {
    const row = results[q]?.rows[0];
    if (!row || !(field in row)) return "…";
    return formatValue(row[field], fmt as Format | undefined);
  });
}
