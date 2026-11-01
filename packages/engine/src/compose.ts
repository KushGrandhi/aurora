import { itemQueries, llmDocJsonSchema, partJsonSchema, type Item, type Part, type RenderEvent, type Spec } from "@genui/spec";
import type { SpecCache } from "./cache.ts";
import { openDb, type Db } from "./db.ts";
import { defaultSpec } from "./defaultSpec.ts";
import { ingest, type DataInput } from "./ingest.ts";
import type { LlmProvider } from "./llm/types.ts";
import { createPartsParser } from "./partsParser.ts";
import { profileDatasets, type Profile } from "./profile.ts";
import { buildPrompt, buildRepairPrompt } from "./prompt.ts";
import { explainQuery, referencesData, runQuery } from "./sql.ts";
import { checkProse, normalizeProse, validatePart, type ValidateCtx } from "./validate.ts";

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
        const result = await runQuery(db!, sql);
        emit({ t: "result", queryId, result, sql });
        return result.rows.length;
      } catch (e) {
        emit({ t: "queryError", queryId, message: (e as Error).message });
        return false as const;
      }
    });

  emit({ t: "start", title: undefined });
  let profile: Profile;
  let names: string[];
  try {
    db = await openDb();
    names = await ingest(db, opts.input);
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

    await streamComposed(profile, defaultDone);
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
      return JSON.parse(await collectText(provider.stream({ system, user, schema: partJsonSchema(), signal, task: "repair" })));
    } catch {
      return undefined;
    }
  }

  async function streamComposed(profile: Profile, defaultDone: Promise<unknown>): Promise<void> {
    const ctx: ValidateCtx = { knownQueries: new Set(), intent: opts.intent ?? "", queryLimits: new Map(), querySql: new Map(), queryRows: new Map() };
    const failed = new Set<string>();
    const held: { raw: unknown; waitingOn: string; order: number }[] = []; // items whose queries have not arrived yet
    const accepted: Part[] = [];
    let title = "";
    let summary: string | undefined;
    // Parts are handled concurrently so a slow repair never blocks later parts; DuckDB work stays ordered via serial().
    const inflight = new Set<Promise<void>>();
    const track = (p: Promise<void>) => {
      inflight.add(p);
      p.finally(() => inflight.delete(p));
    };

    const acceptedItems: { item: Item; order: number }[] = [];
    let seq = 0;
    const emitItem = (item: Item, order: number) => {
      emit({ t: "item", item, order });
      mark("firstComponent");
      acceptedItems.push({ item, order });
    };

    // Re-validate held items in full once their dependencies settle; never emit them unchecked.
    const releaseHeld = () => {
      for (let i = 0; i < held.length; ) {
        const h = held[i];
        if (failed.has(h.waitingOn)) {
          held.splice(i, 1);
          continue;
        }
        if (!ctx.knownQueries.has(h.waitingOn)) {
          i++;
          continue;
        }
        held.splice(i, 1);
        track(handle(h.raw, h.order));
      }
    };

    const acceptQuery = async (id: string, sql: string) => {
      const rows = await execute(id, sql);
      if (rows === false) {
        failed.add(id);
      } else {
        ctx.knownQueries.add(id);
        ctx.querySql!.set(id, sql);
        ctx.queryRows!.set(id, rows);
        const lim = sql.match(/\bLIMIT\s+(\d+)/i);
        if (lim) ctx.queryLimits.set(id, Number(lim[1]));
        accepted.push({ kind: "query", id, sql });
      }
      releaseHeld();
    };

    const handleQuery = async (part: Extract<Part, { kind: "query" }>, repaired = false): Promise<void> => {
      const ex = referencesData(part.sql, names)
        ? await serial(() => explainQuery(db!, part.sql))
        : { ok: false as const, message: `query must read from a dataset table (${names.join(", ")}), not constants` };
      if (ex.ok) return acceptQuery(part.id, part.sql);
      if (!repaired) {
        const fixed = validatePart(await repair(part, ex.message), ctx);
        if (fixed.ok && fixed.part.kind === "query") return handleQuery({ ...fixed.part, id: part.id }, true);
      }
      failed.add(part.id);
      emit({ t: "queryError", queryId: part.id, message: ex.message });
      releaseHeld();
    };

    const handle = async (raw: unknown, order: number, repaired = false): Promise<void> => {
      const r = validatePart(raw, ctx);
      if (r.ok) {
        if (r.part.kind === "query") return handleQuery(r.part);
        return emitItem(r.part.item, order);
      }
      if (r.reason.startsWith("pending:")) {
        const waitingOn = r.reason.slice("pending:".length);
        if (failed.has(waitingOn)) return;
        held.push({ raw, waitingOn, order });
        return;
      }
      if (!repaired) {
        const fixed = await repair(raw, r.reason);
        if (fixed !== undefined) return handle(fixed, order, true);
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
        track(handle(raw, seq++));
      },
      onBadPart(text) {
        const order = seq++;
        track(
          (async () => {
            const fixed = await repair(text, "malformed JSON");
            if (fixed !== undefined) await handle(fixed, order, true);
          })(),
        );
      },
    });

    const { system, user } = buildPrompt(profile, opts.intent);
    let complete = false;
    let raw = "";
    try {
      for await (const chunk of provider.stream({ system, user, schema: llmDocJsonSchema(), signal, task: "compose" })) {
        parser.push(chunk);
        raw += chunk;
      }
      complete = parser.end().complete;
      if (!complete) console.warn(`[genui] ${provider.name} output incomplete (${raw.length} chars); tail: ${JSON.stringify(raw.slice(-300))}`);
      if (!complete && process.env.GENUI_DEBUG_DIR) {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(`${process.env.GENUI_DEBUG_DIR}/incomplete-${renderId}.txt`, raw);
      }
    } finally {
      while (inflight.size) await Promise.all([...inflight]);
    }

    if (summary !== undefined) {
      const invalid = !validatePart({ kind: "item", item: { id: "s", span: 12, c: { type: "text", md: summary } } }, ctx).ok;
      summary = invalid || checkProse(summary, ctx) ? undefined : normalizeProse(summary, ctx);
    }
    emit({ t: "meta", title: title || defaultSpec(profile).title, summary });

    if (complete && acceptedItems.length) {
      const spec: Spec = { v: 1, title: title || "Overview", queries: {}, layout: { type: "grid", cols: 12, items: [] } };
      if (summary) spec.summary = summary;
      for (const p of accepted) if (p.kind === "query") spec.queries[p.id] = { sql: p.sql };
      spec.layout.items = acceptedItems.sort((a, b) => a.order - b.order).map((x) => x.item);
      cache.set(cacheKey, spec);
    }
    if (!complete) emit({ t: "error", message: "model output truncated; showing the parts that arrived" });
    await defaultDone;
    emit({ t: "done", timings: { ...timings, total: mark("total") }, cached: false });
  }
}
