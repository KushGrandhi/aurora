import type { QueryResult } from "@genui/spec";
import type { Db } from "./db.ts";
import { toJsonValue } from "./serialize.ts";

export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const FORBIDDEN = /\b(ATTACH|DETACH|COPY|INSTALL|LOAD|PRAGMA|SET|RESET|CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|EXPORT|IMPORT|CALL|USE|CHECKPOINT|VACUUM)\b/i;
const FORBIDDEN_FN = /\b(read_\w+|glob|parquet_scan|parquet_metadata|parquet_schema|sniff_csv|query_table|query|getenv)\s*\(/i;

/** Remove string literals, quoted identifiers and comments so keyword scans only see SQL structure. */
function stripLiterals(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

export function guardSql(sql: string): { ok: true; sql: string } | { ok: false; reason: string } {
  const trimmed = sql.trim().replace(/;\s*$/, "").trim();
  const bare = stripLiterals(trimmed);
  if (bare.includes(";")) return { ok: false, reason: "multiple statements are not allowed" };
  if (!/^(SELECT|WITH|FROM|\()/i.test(bare.trim())) return { ok: false, reason: "only SELECT queries are allowed" };
  const kw = bare.match(FORBIDDEN);
  if (kw) return { ok: false, reason: `keyword ${kw[1].toUpperCase()} is not allowed` };
  const fn = bare.match(FORBIDDEN_FN);
  if (fn) return { ok: false, reason: `function ${fn[1]} is not allowed` };
  return { ok: true, sql: trimmed };
}

function guarded(sql: string): string {
  const g = guardSql(sql);
  if (!g.ok) throw new Error(g.reason);
  return g.sql;
}

/** Bind only the params the SQL actually references; DuckDB rejects unused named params. */
function usedParams(sql: string, params: Record<string, unknown>): Record<string, unknown> | undefined {
  const bare = stripLiterals(sql);
  const used = Object.entries(params).filter(([k]) => new RegExp(`\\$${k}\\b`).test(bare));
  return used.length ? (Object.fromEntries(used) as Record<string, unknown>) : undefined;
}

export async function runQuery(
  db: Db,
  sql: string,
  params: Record<string, unknown> = {},
  limit = 10_000,
): Promise<QueryResult> {
  const inner = guarded(sql);
  const t0 = performance.now();
  const reader = await db.conn.runAndReadAll(
    `SELECT * FROM (${inner}) AS _q LIMIT ${limit + 1}`,
    usedParams(inner, params) as never,
  );
  const names = reader.columnNames();
  const types = reader.columnTypes().map(String);
  const raw = reader.getRowObjectsJS();
  const truncated = raw.length > limit;
  const rows = (truncated ? raw.slice(0, limit) : raw).map((r) =>
    Object.fromEntries(names.map((n, i) => [n, toJsonValue(r[n], types[i])])),
  );
  return {
    columns: names.map((name, i) => ({ name, type: types[i] })),
    rows,
    truncated,
    ms: Math.round(performance.now() - t0),
  };
}

export async function explainQuery(db: Db, sql: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const g = guardSql(sql);
  if (!g.ok) return { ok: false, message: g.reason };
  try {
    await db.conn.run(`EXPLAIN ${g.sql}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
