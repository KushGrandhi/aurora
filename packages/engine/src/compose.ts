import { itemQueries, llmDocJsonSchema, partJsonSchema, type Item, type Part, type RenderEvent, type Spec } from "@genui/spec";
import type { SpecCache } from "./cache.ts";
import { openDb, type Db } from "./db.ts";
import { defaultSpec } from "./defaultSpec.ts";
import { ingest, type DataInput } from "./ingest.ts";
import type { LlmProvider } from "./llm/types.ts";
import { createPartsParser } from "./partsParser.ts";
import { profileDatasets, type Profile } from "./profile.ts";
import { buildPrompt, buildRepairPrompt } from "./prompt.ts";
import { explainQuery, runQuery } from "./sql.ts";
import { checkProse, validatePart, type ValidateCtx } from "./validate.ts";

export type ComposeOpts = {
  renderId: string;
  input: DataInput | Record<string, DataInput>;
  intent?: string;
  provider: LlmProvider;
  cache: SpecCache;
  emit(e: RenderEvent): void;
  signal?: AbortSignal;
};

async function collectText(it: AsyncIterable<string>): Promise<string> {
  let s = "";
  for await (const x of it) s += x;
  return s;
}

export async function compose(opts: ComposeOpts): Promise<void> {
  const { renderId, provider, cache, signal } = opts;
  const emit = (e: Record<string, unknown> & { t: RenderEvent["t"] }) => opts.emit({ ...e, renderId } as RenderEvent);
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  const mark = (k: string) => (timings[k] ??= Math.round(performance.now() - t0));
  let db: Db | undefined;

  // One DuckDB connection: run queries strictly one after another.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.then(fn);
    chain = p.catch(() => undefined);
    return p;
  };
  const execute = (queryId: string, sql: string) =>
    serial(async () => {
      try {
        emit({ t: "result", queryId, result: await runQuery(db!, sql) });
        return true;
      } catch (e) {
        emit({ t: "queryError", queryId, message: (e as Error).message });
        return false;
      }
    });

  emit({ t: "start", title: undefined });
  let profile: Profile;
  try {
    db = await openDb();
    const names = await ingest(db, opts.input);
    mark("ingest");
    profile = await profileDatasets(db, names);
    mark("profile");
  } catch (e) {
    emit({ t: "error", message: (e as Error).message });
    emit({ t: "done", timings: { total: mark("total") }, cached: false });
    await db?.close();
    return;
  }

  const cacheKey = cache.key(profile.fingerprint, opts.intent);
  let defaultDone: Promise<unknown> = Promise.resolve();
  try {
    const hit = cache.get(cacheKey);
    if (hit) {
      emit({ t: "meta", title: hit.title, summary: hit.summary });
      for (const item of hit.layout.items) emit({ t: "item", item });
      await Promise.all(Object.entries(hit.queries).map(([id, q]) => execute(id, q.sql)));
      emit({ t: "done", timings: { ...timings, total: mark("total") }, cached: true });
      return;
    }

    const def = defaultSpec(profile);
    emit({ t: "default", spec: def });
    defaultDone = Promise.all(Object.entries(def.queries).map(([id, q]) => execute(id, q.sql))).then(() => mark("default"));

    await streamComposed(profile);
    await defaultDone;
  } catch (e) {
    emit({ t: "error", message: (e as Error).message });
    await defaultDone;
    emit({ t: "done", timings: { ...timings, total: mark("total") }, cached: false });
  } finally {
    await chain;
    await db.close();
  }

  async function repair(part: unknown, reason: string): Promise<unknown> {
    const { system, user } = buildRepairPrompt(part, reason, profile);
    try {
      return JSON.parse(await collectText(provider.stream({ system, user, schema: partJsonSchema(), signal })));
    } catch {
      return undefined;
    }
  }

  async function streamComposed(profile: Profile): Promise<void> {
    const ctx: ValidateCtx = { knownQueries: new Set(), intent: opts.intent ?? "", queryLimits: new Map() };
    const failed = new Set<string>();
    const held: Item[] = [];
    const accepted: Part[] = [];
    let title = "";
    let summary: string | undefined;
    let work: Promise<void> = Promise.resolve();

    const emitItem = (item: Item) => {
      emit({ t: "item", item });
      mark("firstComponent");
      accepted.push({ kind: "item", item });
    };

    const releaseHeld = () => {
      for (let i = 0; i < held.length; ) {
        const deps = itemQueries(held[i]);
        if (deps.some((d) => failed.has(d))) held.splice(i, 1);
        else if (deps.every((d) => ctx.knownQueries.has(d))) emitItem(held.splice(i, 1)[0]);
        else i++;
      }
    };

    const acceptQuery = async (id: string, sql: string) => {
      const ok = await execute(id, sql);
      if (!ok) {
        failed.add(id);
      } else {
        ctx.knownQueries.add(id);
        const lim = sql.match(/\bLIMIT\s+(\d+)/i);
        if (lim) ctx.queryLimits.set(id, Number(lim[1]));
        accepted.push({ kind: "query", id, sql });
      }
      releaseHeld();
    };

    const handleQuery = async (part: Extract<Part, { kind: "query" }>, repaired = false): Promise<void> => {
      const ex = await serial(() => explainQuery(db!, part.sql));
      if (ex.ok) return acceptQuery(part.id, part.sql);
      if (!repaired) {
        const fixed = validatePart(await repair(part, ex.message), ctx);
        if (fixed.ok && fixed.part.kind === "query") return handleQuery({ ...fixed.part, id: part.id }, true);
      }
      failed.add(part.id);
      emit({ t: "queryError", queryId: part.id, message: ex.message });
      releaseHeld();
    };

    const handle = async (raw: unknown, repaired = false): Promise<void> => {
      const r = validatePart(raw, ctx);
      if (r.ok) {
        if (r.part.kind === "query") return handleQuery(r.part);
        return emitItem(r.part.item);
      }
      if (r.reason.startsWith("pending:")) {
        const item = (raw as { item: Item }).item;
        if (itemQueries(item).some((d) => failed.has(d))) return;
        held.push(item);
        return;
      }
      if (!repaired) {
        const fixed = await repair(raw, r.reason);
        if (fixed !== undefined) return handle(fixed, true);
      }
      console.warn(`[genui] dropped part: ${r.reason}`);
    };

    const parser = createPartsParser({
      onMeta(m) {
        if (m.title !== undefined && m.title !== title) {
          title = checkProse(m.title, ctx) ? "" : m.title;
          if (title) emit({ t: "meta", title });
        }
        if (m.summary !== undefined) summary = m.summary;
      },
      onPart(raw) {
        work = work.then(() => handle(raw));
      },
    });

    const { system, user } = buildPrompt(profile, opts.intent);
    let complete = false;
    try {
      for await (const chunk of provider.stream({ system, user, schema: llmDocJsonSchema(), signal })) parser.push(chunk);
      complete = parser.end().complete;
    } finally {
      await work;
    }

    if (summary !== undefined) {
      const invalid = !validatePart({ kind: "item", item: { id: "s", span: 12, c: { type: "text", md: summary } } }, ctx).ok;
      if (invalid || checkProse(summary, ctx)) summary = undefined;
    }
    emit({ t: "meta", title: title || defaultSpec(profile).title, summary });

    const items = accepted.filter((p) => p.kind === "item");
    if (complete && items.length) {
      const spec: Spec = { v: 1, title: title || "Overview", queries: {}, layout: { type: "grid", cols: 12, items: [] } };
      if (summary) spec.summary = summary;
      for (const p of accepted) {
        if (p.kind === "query") spec.queries[p.id] = { sql: p.sql };
        else spec.layout.items.push(p.item);
      }
      cache.set(cacheKey, spec);
    }
    emit({ t: "done", timings: { ...timings, total: mark("total") }, cached: false });
  }
}
