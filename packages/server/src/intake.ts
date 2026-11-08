import { validateView } from "@aurora/engine";
import {
  paletteWarnings,
  allIds, applyOps, fromPlan1, getComponent, IdSchema, paramDefault, paramValueVars, paramVars, SpecSchema, sqlVars, validateParamValue, ViewSchema,
  type AuroraEvent, type Param, type PatchOp, type Problem, type QueryResult, type ScreenMessage, type Spec, type View, type ViewEvent,
} from "@aurora/spec";
import { randomUUID } from "node:crypto";
import type { DataRuntime } from "./dataRuntime.ts";
import { EventLog } from "./events.ts";
import type { MediaRegistry } from "./media.ts";
import type { FontStore } from "./fonts.ts";
import { buildVariants } from "./variants.ts";
import type { VersionSource, ViewStore } from "./viewStore.ts";

export type IntakeResult = { viewId: string; version: number; url: string; rebased?: boolean; problems: Problem[] };

export class IntakeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Report = { version: number; ok: Set<string>; failed: { itemId: string; message: string }[]; warnings: { itemId: string; message: string }[] };
type Runtime = {
  results: Map<string, { sql: string; key: string; result?: QueryResult; problem?: Problem }>; // key = sql + the var values it ran with
  dataProblems: Problem[];
  dataKey?: string; // the datasets the current results were computed from
  params: Record<string, unknown>; // current value by param name; runtime only, never versioned
  paramDefs: Record<string, Param>;
  options: Record<string, string[]>; // resolved select options
  media: Record<string, string>; // src → URL the screen loads
  variants?: { baseVersion: number; items: { label: string; view: View }[] }; // pending alternatives (not versions)
  problems: Problem[]; // static + data problems of the current version
  extra: Problem[]; // caller-level notes (e.g. composer errors), cleared on the next render
  report?: Report;
  waiters: { version: number; resolve: () => void }[];
  loaded?: boolean; // data loaded and validated since the server started
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
  media?: MediaRegistry;
  fonts?: FontStore;
};

const OPTIONS_CAP = 200;

/**
 * The one door every caller goes through (HTTP, MCP, file streaming, the Plan 1 composer, the screen): apply →
 * load data → run new queries → validate → store a version → broadcast → wait briefly for the screen's report.
 */
export class Intake {
  private rt = new Map<string, Runtime>();
  private log = new EventLog();
  private opened = 0;
  private deps: IntakeDeps;

  constructor(deps: IntakeDeps) {
    this.deps = deps;
  }

  url(viewId: string): string {
    return `${this.deps.baseUrl()}/#${viewId}`;
  }

  async render(input: View | Spec, source: VersionSource, opts: { id?: string; wait?: boolean } = {}): Promise<IntakeResult> {
    let view: View;
    if ((input as { v?: unknown }).v === 1) {
      const p = SpecSchema.safeParse(input);
      if (!p.success) throw new IntakeError(`invalid plan 1 spec: ${issue(p.error)}`);
      const id = opts.id ?? `v_${randomUUID().slice(0, 8)}`;
      if (!IdSchema.safeParse(id).success) throw new IntakeError(`view id "${id}" must match ^[A-Za-z_]\\w*$ (for a streamed file, rename it, e.g. my_view.ndjson)`);
      view = fromPlan1(p.data, id);
    } else {
      const p = ViewSchema.safeParse(input);
      if (!p.success) throw new IntakeError(`invalid view: ${issue(p.error)}`);
      view = p.data;
    }
    const seen = new Set<string>();
    for (const id of allIds(view)) {
      if (seen.has(id)) throw new IntakeError(`id "${id}" is used more than once (section and item ids must be unique across the view)`);
      seen.add(id);
    }
    const r = this.runtime(view.id);
    r.extra = [];
    const version = await this.serial(view.id, () => this.commit(view, source, {}));
    return this.finish(view.id, version, opts.wait);
  }

  async patch(viewId: string, ops: PatchOp[], source: VersionSource, baseVersion?: number, opts: { wait?: boolean } = {}): Promise<IntakeResult> {
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
    const result = await this.finish(viewId, out.version, opts.wait);
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
        r.report = { version: msg.version, ok: new Set(msg.ok), failed: msg.failed, warnings: msg.warnings ?? [] };
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
      case "param":
        await this.setParam(msg.viewId, msg.name, msg.value);
        return;
      case "event":
        if (this.deps.store.current(msg.viewId)) this.log.add(msg.viewId, { itemId: msg.itemId, name: msg.name, payload: msg.payload });
        return;
      case "pickVariant":
        await this.pickVariant(msg.viewId, msg.index);
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

  /** Opens a screen when none is connected (once per 10 s: a new screen takes a moment to connect). */
  ensureScreen(viewId: string): void {
    if (this.deps.screens() > 0 || Date.now() - this.opened < 10_000) return;
    this.opened = Date.now();
    this.deps.openScreen(this.url(viewId));
  }

  activity(viewId: string, text: string): void {
    this.deps.emit({ t: "activity", viewId, text });
  }

  status(viewId: string): { version: number; problems: Problem[]; unverified: string[]; params: Record<string, unknown>; events: { count: number; lastSeq: number } } {
    const cur = this.deps.store.current(viewId);
    if (!cur) throw new IntakeError(`no view "${viewId}"`, 404);
    return { version: cur.version, problems: this.problems(viewId), unverified: this.unverified(viewId), params: { ...this.runtime(viewId).params }, events: this.log.stats(viewId) };
  }

  /** What the person did on screen since `after`. */
  events(viewId: string, after = 0): AuroraEvent[] {
    return this.log.since(viewId, after);
  }

  /** Like events, but waits up to `ms` for the first one (the caller blocks until the person acts). */
  waitEvents(viewId: string, after: number, ms: number): Promise<AuroraEvent[]> {
    if (!this.deps.store.current(viewId)) throw new IntakeError(`no view "${viewId}"`, 404);
    return this.log.wait(viewId, after, ms);
  }

  /** Shows 2–3 alternatives side by side; none becomes a version until the person picks one. */
  async variants(viewId: string, alts: { label: string; ops: PatchOp[] }[], baseVersion?: number): Promise<IntakeResult & { variants: { label: string; problems: Problem[] }[] }> {
    const out = await this.serial(viewId, async () => {
      const cur = this.deps.store.current(viewId);
      if (!cur) throw new IntakeError(`no view "${viewId}"; render it first`, 404);
      const built = buildVariants(cur.view, alts, (v) => this.validateOnly(v));
      if ("problem" in built) throw new IntakeError(built.problem);
      const r = this.runtime(viewId);
      r.variants = { baseVersion: cur.version, items: built.variants.map(({ label, view }) => ({ label, view })) };
      this.deps.emit({ t: "variants", viewId, baseVersion: cur.version, variants: r.variants.items });
      return { version: cur.version, variants: built.variants.map(({ label, problems }) => ({ label, problems })), rebased: baseVersion !== undefined && baseVersion < cur.version };
    });
    this.ensureScreen(viewId);
    return { viewId, version: out.version, url: this.url(viewId), problems: [], variants: out.variants, ...(out.rebased ? { rebased: true } : {}) };
  }

  /** The person chose a variant: it becomes the current version and the caller can read the choice from events. */
  async pickVariant(viewId: string, index: number): Promise<IntakeResult> {
    const v = await this.serial(viewId, async () => {
      const r = this.runtime(viewId);
      const item = r.variants?.items[index];
      if (!item) throw new IntakeError(r.variants ? `no variant ${index}` : `view "${viewId}" has no variants pending`, 404);
      const version = await this.commit(item.view, "screen", { note: `picked "${item.label}"` });
      this.log.add(viewId, { name: "aurora:variant-picked", payload: { index, label: item.label, version } });
      return version;
    });
    return this.finish(viewId, v, false);
  }

  /** Sets a filter value: validates it, re-runs only the queries that read its vars and broadcasts their results. */
  async setParam(viewId: string, name: string, value: unknown): Promise<{ ok: true } | { problem: Problem }> {
    return this.serial(viewId, async () => {
      const cur = this.deps.store.current(viewId);
      if (!cur) throw new IntakeError(`no view "${viewId}"`, 404);
      const r = this.runtime(viewId);
      if (!r.loaded) await this.evaluate(cur.view);
      const def = cur.view.params?.[name];
      if (!def) return { problem: { severity: "error", message: `no param "${name}" in view "${viewId}"`, hint: "add it with addParam" } };
      const v = validateParamValue(name, def, value, r.options[name]);
      if (!v.ok) return { problem: { severity: "error", message: `param "${name}": ${v.message}` } };
      r.params[name] = value;
      const fresh = await this.runQueries(cur.view, this.dependents(cur.view, paramVars(name, def)), false);
      this.resolveOptions(cur.view);
      this.check(cur.view);
      for (const id of fresh) {
        const q = r.results.get(id)!;
        if (q.result) this.deps.emit({ t: "result", viewId, queryId: id, result: q.result });
      }
      this.deps.emit(this.paramsEvent(viewId));
      this.deps.emit({ t: "problems", viewId, version: cur.version, problems: this.problems(viewId) });
      return { ok: true as const };
    });
  }

  /** Everything a screen needs to show the current version from scratch. */
  snapshot(viewId: string): ViewEvent[] {
    const cur = this.deps.store.current(viewId);
    if (!cur) return [];
    const r = this.runtime(viewId);
    const out: ViewEvent[] = [{ t: "media", viewId, urls: { ...r.media } }, this.paramsEvent(viewId), { t: "view", viewId, version: cur.version, view: cur.view, source: cur.source }];
    if (r.variants) out.push({ t: "variants", viewId, baseVersion: r.variants.baseVersion, variants: r.variants.items });
    for (const [queryId, q] of r.results) if (q.result) out.push({ t: "result", viewId, queryId, result: q.result });
    out.push({ t: "problems", viewId, version: cur.version, problems: this.problems(viewId) });
    return out;
  }

  /** After a restart a stored view has no results yet: load its data and re-check it, without a new version. */
  async refresh(viewId: string): Promise<void> {
    const r = this.runtime(viewId);
    if (r.loaded) return;
    await this.serial(viewId, async () => {
      const cur = this.deps.store.current(viewId);
      if (cur && !r.loaded) await this.evaluate(cur.view);
    });
  }

  /** Runs inside the view's queue. Returns the new version. */
  private async commit(view: View, source: VersionSource, how: { ops?: PatchOp[]; changed?: string[]; baseVersion?: number; note?: string }): Promise<number> {
    const { store, emit } = this.deps;
    const r = this.runtime(view.id);
    await this.deps.fonts?.prepare(view.fonts); // on disk before any screen asks for them
    const { checked, fresh } = await this.evaluate(view);

    const entry = await store.render(checked.view, source, how.note);
    if (r.variants) {
      r.variants = undefined; // the base moved on: pending alternatives no longer apply
      emit({ t: "variants", viewId: view.id, baseVersion: entry.version, variants: [] });
    }
    emit({ t: "media", viewId: view.id, urls: { ...r.media } });
    emit(this.paramsEvent(view.id));
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

  /** Loads data, settles param values, runs new or changed queries and validates. Sets the view's current problems. */
  private async evaluate(view: View): Promise<{ checked: ReturnType<typeof validateView>; fresh: string[] }> {
    const { data } = this.deps;
    const r = this.runtime(view.id);
    const loaded = await data.ensure(view);
    // Different data (or data that failed last time) makes every result stale, even where the SQL didn't change.
    const dataKey = JSON.stringify(loaded.datasets);
    const stale = loaded.problems.length > 0 || r.dataProblems.length > 0 || (r.dataKey !== undefined && r.dataKey !== dataKey);
    r.dataProblems = loaded.problems;
    r.dataKey = dataKey;
    if (view.datasets) view = { ...view, datasets: loaded.datasets }; // inline rows live in a file beside the view, not in every version
    if (stale) r.results.clear();

    // Values survive a new version while the param keeps its type and the value still fits.
    const defs = view.params ?? {};
    const params: Record<string, unknown> = {};
    for (const [name, p] of Object.entries(defs)) {
      const prev = r.paramDefs[name];
      const keep = prev?.type === p.type && name in r.params && (p.type === "select" || validateParamValue(name, p, r.params[name]).ok);
      params[name] = keep ? r.params[name] : paramDefault(p);
    }
    r.params = params;
    r.paramDefs = defs;

    const queries = view.queries ?? {};
    for (const id of r.results.keys()) if (!(id in queries)) r.results.delete(id);
    const fresh = await this.runQueries(view, undefined, stale);

    // A select whose value is no longer an option goes back to its default.
    this.resolveOptions(view);
    const reset: string[] = [];
    for (const [name, p] of Object.entries(defs)) {
      if (p.type !== "select" || validateParamValue(name, p, r.params[name], r.options[name]).ok) continue;
      r.params[name] = p.default != null && r.options[name]?.includes(p.default) ? p.default : null;
      reset.push(...paramVars(name, p));
    }
    if (reset.length) for (const id of await this.runQueries(view, this.dependents(view, reset), false)) if (!fresh.includes(id)) fresh.push(id);

    const checked = this.check(view);
    r.loaded = true;
    return { checked, fresh };
  }

  /** Runs the queries (all, or `ids`) whose SQL or var values changed since their last run. Returns the ids that ran. */
  private async runQueries(view: View, ids: string[] | undefined, force: boolean): Promise<string[]> {
    const r = this.runtime(view.id);
    const vars = this.vars(view.id);
    const fresh: string[] = [];
    for (const [id, q] of Object.entries(view.queries ?? {})) {
      if (ids && !ids.includes(id)) continue;
      const key = q.sql + "\0" + JSON.stringify(sqlVars(q.sql).map((n) => vars[n] ?? null));
      if (!force && r.results.get(id)?.key === key) continue;
      const out = await this.deps.data.run(view.id, id, q.sql, vars);
      r.results.set(id, "problem" in out ? { sql: q.sql, key, problem: out.problem } : { sql: q.sql, key, result: out });
      fresh.push(id);
    }
    return fresh;
  }

  private vars(viewId: string): Record<string, unknown> {
    const r = this.runtime(viewId);
    return Object.assign({}, ...Object.entries(r.paramDefs).map(([name, p]) => paramValueVars(name, p, r.params[name])));
  }

  private dependents(view: View, vars: string[]): string[] {
    const set = new Set(vars);
    return Object.entries(view.queries ?? {}).filter(([, q]) => sqlVars(q.sql).some((n) => set.has(n))).map(([id]) => id);
  }

  private resolveOptions(view: View): void {
    const r = this.runtime(view.id);
    r.options = {};
    for (const [name, p] of Object.entries(view.params ?? {})) {
      if (p.type !== "select") continue;
      if (Array.isArray(p.options)) {
        r.options[name] = p.options;
        continue;
      }
      const { query, field } = p.options;
      const values = new Set<string>();
      for (const row of r.results.get(query)?.result?.rows ?? []) {
        const v = row[field];
        if (v !== null && v !== undefined) values.add(String(v));
        if (values.size >= OPTIONS_CAP) break;
      }
      r.options[name] = [...values];
    }
  }

  /** Problems a view would have against the current results, without changing anything. */
  private validateOnly(view: View): Problem[] {
    const r = this.runtime(view.id);
    const queryRows = new Map<string, number>();
    const querySql = new Map<string, string>();
    for (const [id, q] of r.results) {
      querySql.set(id, q.sql);
      if (q.result) queryRows.set(id, q.result.rows.length);
    }
    return validateView(view, { queryRows, querySql }).problems;
  }

  /** Validates against the current results and collects media URLs. Sets the view's current problems. */
  private check(view: View): ReturnType<typeof validateView> {
    const r = this.runtime(view.id);
    const queryRows = new Map<string, number>();
    const querySql = new Map<string, string>();
    for (const [id, q] of r.results) {
      querySql.set(id, q.sql);
      if (q.result) queryRows.set(id, q.result.rows.length);
    }
    const checked = validateView(view, { queryRows, querySql });
    const problems = [...r.dataProblems, ...checked.problems];
    for (const [, q] of r.results) if (q.problem) problems.push(q.problem);
    // A story step has to fit on the screen beside or over its visual: two or three sentences.
    for (const s of view.sections) if (s.layout === "story") for (const it of s.items.slice(1)) {
      const md = it.c.type === "text" ? String((it.c as { md?: unknown }).md ?? "") : "";
      const words = md.split(/\s+/).filter(Boolean).length;
      if (words > 70) problems.push({ itemId: it.id, severity: "warning", message: `story step "${it.id}" is ${words} words; a step must fit on one screen`, hint: "keep each step to two or three sentences (about 50 words), and split a long one into two steps" });
    }
    for (const m of this.deps.fonts?.problems(view.fonts) ?? []) problems.push({ severity: "warning", message: m, hint: "use an exact Google Fonts family name" });
    // Colours the model chose that are hard to see on the stage (in either theme, when the view doesn't set its page).
    const seen = new Set<string>();
    for (const m of [...paletteWarnings("light", view.palette), ...paletteWarnings("dark", view.palette)])
      if (!seen.has(m)) { seen.add(m); problems.push({ severity: "warning", message: m, hint: "choose a colour with more contrast against the page, or leave it out" }); }
    const media: Record<string, string> = {};
    const lead = checked.view.sections[0]?.items[0]?.id;
    for (const s of checked.view.sections)
      for (const item of s.items) {
        if (checked.invalid.has(item.id)) continue;
        if ((item.c.type === "design" || item.c.type === "custom") && item.c.display === "hero" && item.id !== lead)
          problems.push({ itemId: item.id, severity: "warning", message: "hero only applies to the first item of the first section; shown as a card", hint: "move it to the top of the view, or use display \"card\"" });
        const def = getComponent(item.c.type);
        const failed = (def?.dataBound?.(item.c) ?? []).find((q) => r.results.get(q)?.problem);
        if (failed) problems.push({ itemId: item.id, severity: "error", message: `query "${failed}" failed; see its problem`, hint: "fix the query with addQuery" });
        for (const src of def?.media?.(item.c) ?? []) {
          const url = /^https?:\/\//i.test(src) ? src : this.deps.media?.register(src) ?? null;
          if (url) media[src] = url;
          else problems.push({ itemId: item.id, severity: "warning", message: `media file not found or not a supported image/video: ${src}`, hint: "use an absolute path to an existing png, jpg, gif, webp, avif, svg, mp4, webm, mov, m4v or ogg file, or an http(s) URL" });
        }
      }
    r.problems = problems;
    r.media = media;
    return checked;
  }

  private paramsEvent(viewId: string): ViewEvent {
    const r = this.runtime(viewId);
    return { t: "params", viewId, values: { ...r.params }, options: { ...r.options } };
  }

  /** Opens a screen if none is connected, waits briefly for its report, then answers with every known problem. */
  private async finish(viewId: string, version: number, wait = true): Promise<IntakeResult> {
    const url = this.url(viewId);
    this.ensureScreen(viewId);
    const r = this.runtime(viewId);
    if (wait && (!r.report || r.report.version < version)) {
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
      ? [
          ...r.report.failed.map((f): Problem => ({ itemId: f.itemId, severity: "error", message: `render failed: ${f.message}` })),
          ...r.report.warnings.map((w): Problem => ({ itemId: w.itemId, severity: "warning", message: `design: ${w.message}` })),
        ]
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
      r = { results: new Map(), dataProblems: [], params: {}, paramDefs: {}, options: {}, media: {}, problems: [], extra: [], waiters: [], queue: Promise.resolve() };
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
