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

const SIZE_FACTOR: Partial<Record<Format, number>> = { bytes: 1, kilobytes: 1e3, megabytes: 1e6, gigabytes: 1e9 };
const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"];

function humanBytes(bytes: number): string {
  let i = 0;
  let v = Math.abs(bytes);
  while (v >= 1000 && i < SIZE_UNITS.length - 1) {
    v /= 1000;
    i++;
  }
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: v < 100 ? 1 : 0 }).format(v);
  return `${bytes < 0 ? "−" : ""}${n} ${SIZE_UNITS[i]}`;
}

export function formatValue(v: unknown, format?: Format): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : NaN;
  const factor = format ? SIZE_FACTOR[format] : undefined;
  if (factor !== undefined) return isNaN(n) ? String(v) : humanBytes(n * factor);
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
