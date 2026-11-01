import type { DuckDBResultReader } from "@duckdb/node-api";

/** Convert a value from DuckDB's `getRowObjectsJS()` into a JSON-safe value. `type` is the column's DuckDB type. */
export function toJsonValue(v: unknown, type?: string): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") {
    return v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v.toString();
  }
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return type === "DATE" ? v.toISOString().slice(0, 10) : v.toISOString();
  }
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (Array.isArray(v)) {
    if (type?.startsWith("MAP(") && v.every((e) => e && typeof e === "object" && "key" in e)) {
      return Object.fromEntries(v.map((e: { key: unknown; value: unknown }) => [String(e.key), toJsonValue(e.value)]));
    }
    const inner = type?.endsWith("[]") ? type.slice(0, -2) : undefined;
    return v.map((e) => toJsonValue(e, inner));
  }
  if (v instanceof Uint8Array) return `<${v.byteLength} bytes>`;
  if (typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toJsonValue(x)]));
  }
  return v;
}

/** Read all rows as JSON-safe objects. Falls back to string conversion when values exceed JS Date range (e.g. 'infinity'). */
export function readRows(reader: DuckDBResultReader): Record<string, unknown>[] {
  const names = reader.columnNames();
  const types = reader.columnTypes().map(String);
  try {
    return reader.getRowObjectsJS().map((r) => Object.fromEntries(names.map((n, i) => [n, toJsonValue(r[n], types[i])])));
  } catch {
    return reader.getRowObjects().map((r) =>
      Object.fromEntries(names.map((n, i) => [n, fallbackValue(r[n], types[i])])),
    );
  }
}

function fallbackValue(v: unknown, type: string): unknown {
  if (v === null || v === undefined || typeof v === "string" || typeof v === "boolean") return v ?? null;
  if (typeof v === "number" || typeof v === "bigint") return toJsonValue(v, type);
  const o = v as { isFinite?: () => boolean; toString(): string };
  if (typeof o.isFinite === "function" && !o.isFinite()) return o.toString().startsWith("-") ? "-infinity" : "infinity";
  if (type.startsWith("DECIMAL")) return Number(o.toString());
  return o.toString();
}
