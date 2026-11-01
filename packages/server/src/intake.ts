import { validateView } from "@genui/engine";
import {
  applyOps, fromPlan1, getComponent, SpecSchema, ViewSchema,
  type PatchOp, type Problem, type QueryResult, type ScreenMessage, type Spec, type View, type ViewEvent,
} from "@genui/spec";
import { randomUUID } from "node:crypto";
import type { DataRuntime } from "./dataRuntime.ts";
import type { VersionSource, ViewStore } from "./viewStore.ts";

export type IntakeResult = { viewId: string; version: number; url: string; rebased?: boolean; problems: Problem[] };

export class IntakeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Report = { version: number; ok: Set<string>; failed: { itemId: string; message: string }[] };
type Runtime = {
  results: Map<string, { sql: string; result?: QueryResult; problem?: Problem }>;
  problems: Problem[]; // static + data problems of the current version
  extra: Problem[]; // caller-level notes (e.g. composer errors), cleared on the next render
  report?: Report;
  waiters: { version: number; resolve: () => void }[];
  queue: Promise<unknown>;
};

export type IntakeDeps = {
  store: ViewStore;
  data: DataRuntime;
  emit(e: ViewEvent): void;
  baseUrl(): string;
  screens(): number;
  openScreen(url: string): void;
  waitMs?: number;
};

/**
 * The one door every caller goes through (HTTP, MCP, file streaming, the Plan 1 composer, the screen): apply →
 * load data → run new queries → validate → store a version → broadcast → wait briefly for the screen's report.
 */
export class Intake {
  private rt = new Map<string, Runtime>();
  private deps: IntakeDeps;

  constructor(deps: IntakeDeps) {
    this.deps = deps;
  }

  url(viewId: string): string {
    return `${this.deps.baseUrl()}/#${viewId}`;
  }

  async render(input: View | Spec, source: VersionSource, opts: { id?: string } = {}): Promise<IntakeResult> {
    let view: View;
    if ((input as { v?: unknown }).v === 1) {
      const p = SpecSchema.safeParse(input);
      if (!p.success) throw new IntakeError(`invalid plan 1 spec: ${issue(p.error)}`);
      view = fromPlan1(p.data, opts.id ?? `v_${randomUUID().slice(0, 8)}`);
    } else {
      const p = ViewSchema.safeParse(input);
      if (!p.success) throw new IntakeError(`invalid view: ${issue(p.error)}`);
      view = p.data;
    }
    const r = this.runtime(view.id);
    r.extra = [];
    const version = await this.serial(view.id, () => this.commit(view, source, {}));
    return this.finish(view.id, version);
  }

  async patch(viewId: string, ops: PatchOp[], source: VersionSource, baseVersion?: number): Promise<IntakeResult> {
    const out = await this.serial(viewId, async () => {
      const cur = this.deps.store.current(viewId);
      if (!cur) throw new IntakeError(`no view "${viewId}"; render it first`, 404);
      const applied = applyOps(cur.view, ops);
      if (!applied.ok) return { rejected: applied.problem, version: cur.version };
      const rebased = baseVersion !== undefined && baseVersion < cur.version;
      const version = await this.commit(applied.view, source, { ops, changed: applied.changed, baseVersion: cur.version });
      return { version, rebased };
    });
    if ("rejected" in out) return { viewId, version: out.version, url: this.url(viewId), problems: [out.rejected!] };
    const result = await this.finish(viewId, out.version);
    return { ...result, rebased: out.rebased };
  }

  async pick(viewId: string, version: number): Promise<IntakeResult> {
    const v = await this.serial(viewId, async () => {
      const old = this.deps.store.get(viewId, version);
      if (!old) throw new IntakeError(`view "${viewId}" has no version ${version}`, 404);
      return this.commit(old.view, "screen", { note: `picked v${version}` });
    });
    return this.finish(viewId, v);
  }

  async revertItem(viewId: string, itemId: string, version: number): Promise<IntakeResult> {
    const ops = this.deps.store.revertOps(viewId, itemId, version);
    if ("problem" in ops) throw new IntakeError(ops.problem.message, 404);
    return this.patch(viewId, ops, "screen");
  }

  async screenMessage(msg: ScreenMessage): Promise<void> {
    switch (msg.t) {
      case "rendered": {
        const r = this.runtime(msg.viewId);
        if (r.report && r.report.version > msg.version) return;
        r.report = { version: msg.version, ok: new Set(msg.ok), failed: msg.failed };
        for (const w of r.waiters.filter((w) => w.version <= msg.version)) w.resolve();
        r.waiters = r.waiters.filter((w) => w.version > msg.version);
        return;
      }
      case "pick":
        await this.pick(msg.viewId, msg.version);
        return;
      case "revertItem":
        await this.revertItem(msg.viewId, msg.itemId, msg.version);
        return;
      case "sync":
        for (const e of this.snapshot(msg.viewId)) this.deps.emit(e);
        return;
    }
  }

  /** Composer notes and the like: attached to the view until its next render. */
  note(viewId: string, problem: Problem): void {
    const r = this.runtime(viewId);
    r.extra.push(problem);
    const cur = this.deps.store.current(viewId);
    if (cur) this.deps.emit({ t: "problems", viewId, version: cur.version, problems: this.problems(viewId) });
  }

  activity(viewId: string, text: string): void {
    this.deps.emit({ t: "activity", viewId, text });
  }

  status(viewId: string): { version: number; problems: Problem[]; unverified: string[] } {
    const cur = this.deps.store.current(viewId);
    if (!cur) throw new IntakeError(`no view "${viewId}"`, 404);
    return { version: cur.version, problems: this.problems(viewId), unverified: this.unverified(viewId) };
  }

  /** Everything a screen needs to show the current version from scratch. */
  snapshot(viewId: string): ViewEvent[] {
    const cur = this.deps.store.current(viewId);
    if (!cur) return [];
    const r = this.runtime(viewId);
    const out: ViewEvent[] = [{ t: "view", viewId, version: cur.version, view: cur.view, source: cur.source }];
    for (const [queryId, q] of r.results) if (q.result) out.push({ t: "result", viewId, queryId, result: q.result });
    out.push({ t: "problems", viewId, version: cur.version, problems: this.problems(viewId) });
    return out;
  }

  /** Runs inside the view's queue. Returns the new version. */
  private async commit(view: View, source: VersionSource, how: { ops?: PatchOp[]; changed?: string[]; baseVersion?: number; note?: string }): Promise<number> {
    const { store, data, emit } = this.deps;
    const r = this.runtime(view.id);
    const dataProblems = (await data.ensure(view)).problems;
    if (dataProblems.length) r.results.clear();

    const queries = view.queries ?? {};
    for (const id of r.results.keys()) if (!(id in queries)) r.results.delete(id);
    const fresh: string[] = [];
    for (const [id, q] of Object.entries(queries)) {
      if (r.results.get(id)?.sql === q.sql && !dataProblems.length) continue;
      const out = await data.run(view.id, id, q.sql);
      r.results.set(id, "problem" in out ? { sql: q.sql, problem: out.problem } : { sql: q.sql, result: out });
      fresh.push(id);
    }

    const queryRows = new Map<string, number>();
    const querySql = new Map<string, string>();
    for (const [id, q] of r.results) {
      querySql.set(id, q.sql);
      if (q.result) queryRows.set(id, q.result.rows.length);
    }
    const checked = validateView(view, { queryRows, querySql });
    const problems = [...dataProblems, ...checked.problems];
    for (const [id, q] of r.results) if (q.problem) problems.push(q.problem);
    for (const s of checked.view.sections)
      for (const item of s.items) {
        if (checked.invalid.has(item.id)) continue;
        const failed = (getComponent(item.c.type)?.dataBound?.(item.c) ?? []).find((q) => r.results.get(q)?.problem);
        if (failed) problems.push({ itemId: item.id, severity: "error", message: `query "${failed}" failed; see its problem`, hint: "fix the query with addQuery" });
      }
    r.problems = problems;

    const entry = await store.render(checked.view, source, how.note);
    if (how.ops && how.baseVersion !== undefined) {
      // Send the caller's ops plus the normalized form of every touched item, so the screen ends on exactly the stored view.
      const touched = new Set(how.changed);
      const fixes: PatchOp[] = checked.view.sections.flatMap((s) => s.items.filter((i) => touched.has(i.id)).map((i) => ({ op: "replace", id: i.id, item: i }) as PatchOp));
      if (checked.view.summary !== undefined && checked.view.summary !== view.summary) fixes.push({ op: "set", summary: checked.view.summary });
      emit({ t: "patch", viewId: view.id, version: entry.version, baseVersion: how.baseVersion, ops: [...how.ops, ...fixes], changed: how.changed ?? [], source });
    } else {
      emit({ t: "view", viewId: view.id, version: entry.version, view: entry.view, source });
    }
    for (const id of fresh) {
      const q = r.results.get(id)!;
      if (q.result) emit({ t: "result", viewId: view.id, queryId: id, result: q.result });
    }
    emit({ t: "problems", viewId: view.id, version: entry.version, problems: this.problems(view.id) });
    emit({ t: "list", views: store.list() });
    return entry.version;
  }

  /** Opens a screen if none is connected, waits briefly for its report, then answers with every known problem. */
  private async finish(viewId: string, version: number): Promise<IntakeResult> {
    const url = this.url(viewId);
    if (this.deps.screens() === 0) this.deps.openScreen(url);
    const r = this.runtime(viewId);
    if (!r.report || r.report.version < version) {
      await new Promise<void>((resolve) => {
        const w = { version, resolve };
        r.waiters.push(w);
        setTimeout(() => {
          r.waiters = r.waiters.filter((x) => x !== w);
          resolve();
        }, this.deps.waitMs ?? 1500).unref?.();
      });
    }
    const unverified = this.unverified(viewId).map((itemId): Problem => ({ itemId, severity: "unverified", message: "not confirmed by a screen yet", hint: "call status in a moment; open the URL if no screen is showing" }));
    return { viewId, version, url, problems: [...this.problems(viewId), ...unverified] };
  }

  private problems(viewId: string): Problem[] {
    const r = this.runtime(viewId);
    const cur = this.deps.store.current(viewId);
    const rendered = r.report && cur && r.report.version === cur.version
      ? r.report.failed.map((f): Problem => ({ itemId: f.itemId, severity: "error", message: `render failed: ${f.message}` }))
      : [];
    return [...r.problems, ...rendered, ...r.extra];
  }

  private unverified(viewId: string): string[] {
    const cur = this.deps.store.current(viewId);
    if (!cur) return [];
    const r = this.runtime(viewId);
    const rep = r.report && r.report.version >= cur.version ? r.report : undefined;
    const seen = new Set([...(rep?.ok ?? []), ...(rep?.failed.map((f) => f.itemId) ?? [])]);
    return cur.view.sections.flatMap((s) => s.items.map((i) => i.id)).filter((id) => !seen.has(id));
  }

  private runtime(viewId: string): Runtime {
    let r = this.rt.get(viewId);
    if (!r) {
      r = { results: new Map(), problems: [], extra: [], waiters: [], queue: Promise.resolve() };
      this.rt.set(viewId, r);
    }
    return r;
  }

  private serial<T>(viewId: string, fn: () => Promise<T>): Promise<T> {
    const r = this.runtime(viewId);
    const next = r.queue.then(fn, fn);
    r.queue = next.catch(() => {});
    return next;
  }
}

function issue(e: { issues: { path: PropertyKey[]; message: string }[] }): string {
  const i = e.issues[0];
  return i ? `${i.path.map(String).join(".") || "(root)"}: ${i.message}` : "schema";
}
