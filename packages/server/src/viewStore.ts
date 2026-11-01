import { mkdir, readdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { applyOps, type PatchOp, type Problem, type View } from "@aurora/spec";

export type VersionSource = "caller" | "file" | "screen" | "compose";
export type VersionEntry = { version: number; at: string; source: VersionSource; note?: string; view: View };
export type PatchOutcome = { entry: VersionEntry; changed: string[]; rebased: boolean } | { problem: Problem };
import type { ListEntry } from "@aurora/spec";
export type { ListEntry };

const SAFE_ID = /^[A-Za-z_]\w*$/;
export const defaultViewsDir = () => path.join(homedir(), ".aurora", "views");

/** Versioned views on disk: `<dir>/<id>/v<N>.json`, one file per version, current = highest N. History is linear. */
export class ViewStore {
  private views = new Map<string, VersionEntry[]>();
  private queues = new Map<string, Promise<unknown>>();
  private keep: number;
  private maxAgeMs: number;
  private dir: string;

  constructor(dir: string = defaultViewsDir(), opts: { keep?: number; maxAgeDays?: number } = {}) {
    this.dir = dir;
    this.keep = opts.keep ?? 200;
    this.maxAgeMs = (opts.maxAgeDays ?? 30) * 86_400_000;
  }

  async load(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const id of await readdir(this.dir)) {
      if (!SAFE_ID.test(id)) continue;
      const files = (await readdir(path.join(this.dir, id)).catch(() => [] as string[])).filter((f) => /^v\d+\.json$/.test(f));
      const entries: VersionEntry[] = [];
      for (const f of files) {
        try {
          entries.push(JSON.parse(await readFile(path.join(this.dir, id, f), "utf8")));
        } catch {
          // a torn or hand-edited file: skip that version
        }
      }
      if (entries.length) this.views.set(id, entries.sort((a, b) => a.version - b.version));
    }
  }

  current(viewId: string): VersionEntry | undefined {
    return this.views.get(viewId)?.at(-1);
  }

  get(viewId: string, version: number): VersionEntry | undefined {
    return this.views.get(viewId)?.find((e) => e.version === version);
  }

  history(viewId: string): Omit<VersionEntry, "view">[] {
    return (this.views.get(viewId) ?? []).map(({ view: _v, ...h }) => h);
  }

  list(): ListEntry[] {
    return [...this.views.values()]
      .map((es) => es.at(-1)!)
      .map((e) => ({ id: e.view.id, title: e.view.title, version: e.version, at: e.at }))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  render(view: View, source: VersionSource, note?: string): Promise<VersionEntry> {
    if (!SAFE_ID.test(view.id)) return Promise.reject(new Error(`invalid view id "${view.id}"`));
    return this.serial(view.id, () => this.append(view.id, view, source, note));
  }

  patch(viewId: string, ops: PatchOp[], source: VersionSource, baseVersion?: number): Promise<PatchOutcome> {
    return this.serial(viewId, async () => {
      const cur = this.current(viewId);
      if (!cur) return { problem: { severity: "error", message: `no view "${viewId}"`, hint: "render the view first" } };
      const r = applyOps(cur.view, ops);
      if (!r.ok) return { problem: r.problem };
      const entry = await this.append(viewId, r.view, source);
      return { entry, changed: r.changed, rebased: baseVersion !== undefined && baseVersion < cur.version };
    });
  }

  pick(viewId: string, version: number): Promise<VersionEntry> {
    return this.serial(viewId, async () => {
      const old = this.get(viewId, version);
      if (!old) throw new Error(`view "${viewId}" has no version ${version}`);
      return this.append(viewId, old.view, "screen", `picked v${version}`);
    });
  }

  revertItem(viewId: string, itemId: string, version: number): Promise<VersionEntry | { problem: Problem }> {
    return this.serial(viewId, async () => {
      const ops = this.revertOps(viewId, itemId, version);
      if ("problem" in ops) return ops;
      const r = applyOps(this.current(viewId)!.view, ops);
      if (!r.ok) return { problem: r.problem };
      return this.append(viewId, r.view, "screen", `reverted ${itemId} to v${version}`);
    });
  }

  /** The ops that put one item back the way it was in an older version (replace it, or re-add it where it lived). */
  revertOps(viewId: string, itemId: string, version: number): PatchOp[] | { problem: Problem } {
    const cur = this.current(viewId);
    const old = this.get(viewId, version);
    if (!cur || !old) return { problem: { severity: "error", message: `view "${viewId}" has no version ${version}` } };
    const home = old.view.sections.find((s) => s.items.some((i) => i.id === itemId));
    if (!home) return { problem: { itemId, severity: "error", message: `item "${itemId}" is not in v${version}` } };
    const was = home.items.find((i) => i.id === itemId)!;
    if (cur.view.sections.some((s) => s.items.some((i) => i.id === itemId))) return [{ op: "replace", id: itemId, item: was }];
    const target = cur.view.sections.some((s) => s.id === home.id) ? home.id : cur.view.sections[0]?.id;
    if (!target) return { problem: { itemId, severity: "error", message: "the current view has no section to restore the item into" } };
    return [{ op: "add", section: target, item: was }];
  }

  /** Retention: a view survives if it is among the `keep` most recent or younger than maxAgeDays. */
  async prune(): Promise<void> {
    const now = Date.now();
    const list = this.list();
    for (const [i, e] of list.entries()) {
      if (i < this.keep || now - Date.parse(e.at) < this.maxAgeMs) continue;
      await this.serial(e.id, async () => {
        this.views.delete(e.id);
        await rm(path.join(this.dir, e.id), { recursive: true, force: true });
      });
    }
  }

  private async append(viewId: string, view: View, source: VersionSource, note?: string): Promise<VersionEntry> {
    const version = (this.current(viewId)?.version ?? 0) + 1;
    const entry: VersionEntry = { version, at: new Date().toISOString(), source, ...(note ? { note } : {}), view: structuredClone(view) };
    const folder = path.join(this.dir, viewId);
    await mkdir(folder, { recursive: true });
    const file = path.join(folder, `v${version}.json`);
    await writeFile(file + ".tmp", JSON.stringify(entry));
    await rename(file + ".tmp", file);
    const list = this.views.get(viewId) ?? [];
    list.push(entry);
    this.views.set(viewId, list);
    return entry;
  }

  /** Runs mutations of one view one at a time, in call order. */
  private serial<T>(viewId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(viewId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    const tail = next.catch(() => {});
    this.queues.set(viewId, tail);
    tail.then(() => { if (this.queues.get(viewId) === tail) this.queues.delete(viewId); });
    return next;
  }
}
