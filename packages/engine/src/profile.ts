import { createHash } from "node:crypto";
import type { Db } from "./db.ts";
import { readRows } from "./serialize.ts";
import { quoteIdent } from "./sql.ts";

export type ColumnProfile = {
  name: string;
  type: string;
  distinct: number;
  nulls: number;
  min?: unknown;
  max?: unknown;
  top?: { value: unknown; count: number }[];
};
export type DatasetProfile = {
  name: string;
  rowCount: number;
  columns: ColumnProfile[];
  sample: Record<string, unknown>[];
  compressed: boolean;
};
export type Profile = { datasets: DatasetProfile[]; fingerprint: string };

const WIDE = 40;
const TOP_MAX_DISTINCT = 50;
const NUMERIC = /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|FLOAT|DOUBLE|DECIMAL)/;

export const isNumericType = (t: string) => NUMERIC.test(t);
export const isTemporalType = (t: string) => /^(DATE|TIMESTAMP)/.test(t);

async function rows(db: Db, sql: string): Promise<Record<string, unknown>[]> {
  return readRows(await db.conn.runAndReadAll(sql));
}

const truncate = (v: unknown) => (typeof v === "string" && v.length > 40 ? v.slice(0, 40) + "…" : v);

async function profileOne(db: Db, name: string): Promise<DatasetProfile> {
  const t = quoteIdent(name);
  const summary = await rows(db, `SUMMARIZE ${t}`);
  const rowCount = Number((await rows(db, `SELECT count(*) AS n FROM ${t}`))[0].n);
  const compressed = summary.length > WIDE;
  const columns: ColumnProfile[] = [];
  for (const s of summary) {
    const type = String(s.column_type);
    const col: ColumnProfile = {
      name: String(s.column_name),
      type,
      distinct: rowCount === 0 ? 0 : Math.min(Number(s.approx_unique ?? 0), rowCount),
      nulls: Math.round((Number(s.null_percentage ?? 0) / 100) * rowCount),
    };
    if (!compressed && rowCount > 0) {
      const num = isNumericType(type);
      if (s.min != null) col.min = num ? Number(s.min) : s.min;
      if (s.max != null) col.max = num ? Number(s.max) : s.max;
      if (col.distinct <= TOP_MAX_DISTINCT) {
        const c = quoteIdent(col.name);
        col.top = (await rows(db, `SELECT ${c} AS value, count(*) AS count FROM ${t} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`)).map(
          (r) => ({ value: r.value, count: Number(r.count) }),
        );
      }
    }
    columns.push(col);
  }
  let sample = await rows(db, `SELECT * FROM ${t} LIMIT 5`);
  if (compressed) sample = sample.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, truncate(v)])));
  return { name, rowCount, columns, sample, compressed };
}

export function fingerprint(datasets: Pick<DatasetProfile, "name" | "columns">[]): string {
  const key = datasets.map((d) => `${d.name}:${d.columns.map((c) => `${c.name}:${c.type}`).join(",")}`).join("|");
  return createHash("sha256").update(key).digest("hex");
}

export async function profileDatasets(db: Db, names: string[]): Promise<Profile> {
  const datasets: DatasetProfile[] = [];
  for (const n of names) datasets.push(await profileOne(db, n));
  return { datasets, fingerprint: fingerprint(datasets) };
}
