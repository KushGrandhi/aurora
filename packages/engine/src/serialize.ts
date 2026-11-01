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
