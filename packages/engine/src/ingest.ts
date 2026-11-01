import { mkdtemp, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Db } from "./db.ts";

export type InputFormat = "csv" | "tsv" | "json" | "ndjson" | "parquet" | "text";
export type DataInput = string | { path: string; format?: InputFormat } | { inline: unknown[] };

const NAME_RE = /^[A-Za-z_]\w*$/;
const TEXT_EXT = new Set([".md", ".markdown", ".txt"]);

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

function isSingle(input: DataInput | Record<string, DataInput>): input is DataInput {
  return typeof input === "string" || "path" in input || "inline" in input;
}

function formatFor(p: string): InputFormat {
  const ext = path.extname(p).toLowerCase();
  if (TEXT_EXT.has(ext)) return "text";
  if (ext === ".tsv") return "tsv";
  if (ext === ".json") return "json";
  if (ext === ".ndjson" || ext === ".jsonl") return "ndjson";
  if (ext === ".parquet") return "parquet";
  return "csv";
}

async function tempFile(name: string, content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aurora-"));
  const file = path.join(dir, name);
  await writeFile(file, content);
  return file;
}

async function download(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return tempFile(path.basename(new URL(url).pathname) || "download", Buffer.from(await res.arrayBuffer()).toString("utf8"));
}

async function textRows(p: string): Promise<{ name: string; body: string }[]> {
  if ((await stat(p)).isDirectory()) {
    const names = (await readdir(p)).filter((n) => TEXT_EXT.has(path.extname(n).toLowerCase())).sort();
    return Promise.all(names.map(async (n) => ({ name: n, body: await readFile(path.join(p, n), "utf8") })));
  }
  return [{ name: path.basename(p), body: await readFile(p, "utf8") }];
}

async function loadOne(db: Db, name: string, input: DataInput): Promise<void> {
  const t = ident(name);
  if (typeof input !== "string" && "inline" in input) {
    const file = await tempFile("inline.ndjson", input.inline.map((r) => JSON.stringify(r)).join("\n"));
    await db.conn.run(`CREATE TABLE ${t} AS SELECT * FROM read_json_auto(${lit(file)})`);
    return;
  }
  let p = typeof input === "string" ? input : input.path;
  if (/^https?:\/\//.test(p)) p = await download(p);
  const isDir = (await stat(p)).isDirectory();
  const format = (typeof input !== "string" && input.format) || (isDir ? "text" : formatFor(p));

  if (format === "text") {
    const rows = await textRows(p);
    const file = await tempFile("docs.ndjson", rows.map((r) => JSON.stringify(r)).join("\n"));
    await db.conn.run(
      `CREATE TABLE ${t} AS SELECT * FROM read_json(${lit(file)}, format='newline_delimited', columns={name: 'VARCHAR', body: 'VARCHAR'})`,
    );
    return;
  }
  if (format === "parquet") {
    await db.conn.run(`CREATE TABLE ${t} AS SELECT * FROM read_parquet(${lit(p)})`);
    return;
  }
  if (format === "json" || format === "ndjson") {
    await db.conn.run(`CREATE TABLE ${t} AS SELECT * FROM read_json_auto(${lit(p)})`);
    return;
  }
  if ((await stat(p)).size === 0) {
    await db.conn.run(`CREATE TABLE ${t} (empty VARCHAR)`);
    return;
  }
  const delim = format === "tsv" ? `, delim='\\t'` : "";
  await db.conn.run(`CREATE TABLE ${t} AS SELECT * FROM read_csv_auto(${lit(p)}, header=true${delim})`);
}

/** Load inputs into tables, then lock the database against external access. Returns table names. */
export async function ingest(
  db: Db,
  input: DataInput | Record<string, DataInput>,
  opts: { lock?: boolean } = {},
): Promise<string[]> {
  const entries: [string, DataInput][] = isSingle(input) ? [["data", input]] : Object.entries(input);
  for (const [name] of entries) {
    if (!NAME_RE.test(name)) throw new Error(`invalid dataset name '${name}': use letters, digits and _`);
  }
  for (const [name, inp] of entries) await loadOne(db, name, inp);
  if (opts.lock !== false) await lockDb(db);
  return entries.map(([n]) => n);
}

export async function lockDb(db: Db): Promise<void> {
  await db.conn.run(`SET enable_external_access=false`);
  await db.conn.run(`SET lock_configuration=true`);
}
