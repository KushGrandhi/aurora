import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { explainQuery, ingest, lockDb, openDb, profileDatasets, referencesData, runQuery, type Db, type Profile } from "@genui/engine";
import type { DataInput } from "@genui/engine";
import type { DataInputJson, Problem, QueryResult, View } from "@genui/spec";

type Open = { db: Db; key: string; tables: string[]; failed: number; timer?: NodeJS.Timeout; queue: Promise<unknown> };

/** One DuckDB per view, opened on demand from the view's datasets and closed after `idleMs` without use. */
export class DataRuntime {
  private open = new Map<string, Open>();
  private known = new Map<string, Record<string, DataInputJson>>(); // last datasets seen per view, to reopen after idle close
  private idleMs: number;
  private inlineDir: string;

  constructor(opts: { idleMs?: number; inlineDir: string }) {
    this.idleMs = opts.idleMs ?? 600_000;
    this.inlineDir = opts.inlineDir;
  }

  isOpen(viewId: string): boolean {
    return this.open.has(viewId);
  }

  /**
   * Loads (or reloads, when they changed or some failed last time) the view's datasets. A dataset that fails to load
   * is a problem; the rest load. Returns the datasets with inline rows replaced by the file they were saved to.
   */
  async ensure(view: View): Promise<{ problems: Problem[]; datasets: Record<string, DataInputJson> }> {
    const datasets: Record<string, DataInputJson> = {};
    for (const [name, input] of Object.entries(view.datasets ?? {})) datasets[name] = await this.resolve(view.id, name, input);
    this.known.set(view.id, datasets);
    const key = JSON.stringify(datasets);
    const cur = this.open.get(view.id);
    if (cur && cur.key === key && cur.failed === 0) {
      this.touch(view.id);
      return { problems: [], datasets };
    }
    if (cur) await this.close(view.id);
    return { ...(await this.load(view.id, datasets)), datasets };
  }

  async run(viewId: string, queryId: string, sql: string, params: Record<string, unknown> = {}): Promise<QueryResult | { problem: Problem }> {
    if (!this.open.has(viewId)) {
      const datasets = this.known.get(viewId);
      if (!datasets) return { problem: { severity: "error", message: `query "${queryId}": the view has no datasets` } };
      await this.load(viewId, datasets);
    }
    const o = this.open.get(viewId)!;
    this.touch(viewId);
    const fail = (message: string) => ({ problem: { severity: "error" as const, message: `query "${queryId}": ${message}` } });
    if (!referencesData(sql, o.tables)) return fail(`must read from a dataset table (${o.tables.join(", ") || "none loaded"})`);
    const job = o.queue.then(async () => {
      const ex = await explainQuery(o.db, sql, params);
      if (!ex.ok) return fail(ex.message);
      try {
        return await runQuery(o.db, sql, params);
      } catch (e) {
        return fail((e as Error).message);
      }
    });
    o.queue = job.catch(() => {});
    return job;
  }

  /** Profiles inputs in a throwaway database (the `profile` tool). */
  async profile(input: DataInput | Record<string, DataInput>): Promise<Profile> {
    const db = await openDb();
    try {
      const names = await ingest(db, input);
      return await profileDatasets(db, names);
    } finally {
      await db.close();
    }
  }

  async close(viewId: string): Promise<void> {
    const o = this.open.get(viewId);
    if (!o) return;
    this.open.delete(viewId);
    clearTimeout(o.timer);
    await o.queue;
    await o.db.close();
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.open.keys()].map((id) => this.close(id)));
  }

  private async load(viewId: string, datasets: Record<string, DataInputJson>): Promise<{ problems: Problem[] }> {
    const problems: Problem[] = [];
    const db = await openDb();
    const tables: string[] = [];
    for (const [name, input] of Object.entries(datasets)) {
      try {
        await ingest(db, { [name]: input as DataInput }, { lock: false });
        tables.push(name);
      } catch (e) {
        problems.push({ severity: "error", message: `dataset "${name}" failed to load: ${(e as Error).message}`, hint: "check the path exists and is readable; items reading it can't render" });
      }
    }
    await lockDb(db);
    this.open.set(viewId, { db, key: JSON.stringify(datasets), tables, failed: problems.length, queue: Promise.resolve() });
    this.touch(viewId);
    return { problems };
  }

  /** Inline rows are saved beside the view (named by content, so older versions keep their data) and referenced by path. */
  private async resolve(viewId: string, name: string, input: DataInputJson): Promise<DataInputJson> {
    if (typeof input === "string" || !("inline" in input)) return input;
    const body = input.inline.map((r) => JSON.stringify(r)).join("\n") + "\n";
    const folder = path.join(this.inlineDir, viewId);
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `${name}-${createHash("sha256").update(body).digest("hex").slice(0, 10)}.ndjson`);
    await writeFile(file, body);
    return { path: file, format: "ndjson" };
  }

  private touch(viewId: string): void {
    const o = this.open.get(viewId);
    if (!o) return;
    clearTimeout(o.timer);
    o.timer = setTimeout(() => void this.close(viewId), this.idleMs);
    o.timer.unref();
  }
}
