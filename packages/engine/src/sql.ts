import { stripSqlLiterals, type QueryResult } from "@genui/spec";
import type { Db } from "./db.ts";
import { readRows } from "./serialize.ts";

export const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

const FORBIDDEN = /\b(ATTACH|DETACH|COPY|INSTALL|LOAD|PRAGMA|SET|RESET|CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|EXPORT|IMPORT|CALL|USE|CHECKPOINT|VACUUM)\b/i;
const FORBIDDEN_FN = /\b(read_\w+|glob|parquet_scan|parquet_metadata|parquet_schema|sniff_csv|query_table|query|getenv)\s*\(/i;

const stripLiterals = stripSqlLiterals;

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
    `SELECT * FROM (${inner}\n) AS _q LIMIT ${limit + 1}`,
    usedParams(inner, params) as never,
  );
  const names = reader.columnNames();
  const types = reader.columnTypes().map(String);
  const raw = readRows(reader);
  const truncated = raw.length > limit;
  const rows = truncated ? raw.slice(0, limit) : raw;
  return {
    columns: names.map((name, i) => ({ name, type: types[i] })),
    rows,
    truncated,
    ms: Math.round(performance.now() - t0),
  };
}

export async function explainQuery(db: Db, sql: string, params: Record<string, unknown> = {}): Promise<{ ok: true } | { ok: false; message: string }> {
  const g = guardSql(sql);
  if (!g.ok) return { ok: false, message: g.reason };
  try {
    // Wrapped like runQuery, so a smuggled second statement is a parse error instead of being executed.
    await db.conn.run(`EXPLAIN SELECT * FROM (${g.sql}\n) AS _q`, usedParams(g.sql, params) as never);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** True when the query reads from at least one dataset table, so its values come from data rather than constants. */
export function referencesData(sql: string, tables: string[]): boolean {
  const bare = stripLiterals(sql.replace(/"((?:[^"]|"")*)"/g, (_m, n: string) => n.replace(/""/g, '"').replace(/\s/g, "_")));
  return tables.some((t) => new RegExp(`\\b(FROM|JOIN)\\s+${t.replace(/\W/g, "\\$&")}\\b`, "i").test(bare));
}
