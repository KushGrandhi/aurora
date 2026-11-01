import { z } from "zod";
import { IdSchema } from "./base.ts";
import { ParamSchema } from "./params.ts";
import type { Problem } from "./problems.ts";
import { DataInputJsonSchema, SectionSchema, ViewItemSchema, type Section, type View, type ViewItem } from "./view.ts";

const After = z.union([IdSchema, z.null()]).optional(); // null = first position, absent = append

export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), title: z.string().optional(), summary: z.string().optional() }),
  z.object({ op: z.literal("addSection"), section: SectionSchema, after: After }),
  z.object({ op: z.literal("removeSection"), id: IdSchema }),
  z.object({ op: z.literal("moveSection"), id: IdSchema, after: After }),
  z.object({ op: z.literal("add"), section: IdSchema, item: ViewItemSchema, after: After }),
  z.object({
    op: z.literal("update"),
    id: IdSchema,
    item: z.object({ span: z.number().int().min(1).max(12).optional(), title: z.string().optional(), c: z.record(z.string(), z.unknown()).optional() }),
  }),
  z.object({ op: z.literal("replace"), id: IdSchema, item: ViewItemSchema }),
  z.object({ op: z.literal("remove"), id: IdSchema }),
  z.object({ op: z.literal("move"), id: IdSchema, section: IdSchema, after: After }),
  z.object({ op: z.literal("addQuery"), id: IdSchema, sql: z.string().min(1) }),
  z.object({ op: z.literal("addDataset"), name: IdSchema, input: DataInputJsonSchema }),
  z.object({ op: z.literal("addParam"), name: IdSchema, param: ParamSchema }),
  z.object({ op: z.literal("removeParam"), name: IdSchema }),
  z.object({ op: z.literal("editFile"), id: IdSchema, path: z.string().min(1), content: z.string().optional(), edits: z.array(z.object({ find: z.string().min(1), replace: z.string() })).optional() }),
  z.object({ op: z.literal("deleteFile"), id: IdSchema, path: z.string().min(1) }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export type ApplyResult = { ok: true; view: View; changed: string[] } | { ok: false; problem: Problem };

export function allIds(view: View): string[] {
  return view.sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
}

class OpError extends Error {
  itemId?: string;
  constructor(message: string, itemId?: string) {
    super(message);
    this.itemId = itemId;
  }
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...target };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k] as Record<string, unknown>, v) : v;
  return out;
}

/** Insert at the position `after` names: null → first, undefined → last. */
function insert<T extends { id: string }>(list: T[], value: T, after: string | null | undefined, where: string): void {
  if (after === undefined) list.push(value);
  else if (after === null) list.unshift(value);
  else {
    const i = list.findIndex((x) => x.id === after);
    if (i < 0) throw new OpError(`no "${after}" in ${where} to place after`);
    list.splice(i + 1, 0, value);
  }
}

const count = (hay: string, needle: string) => hay.split(needle).length - 1;

/** File edits on a design (files) or custom (its one file, index.html) item. */
function editFiles(c: ViewItem["c"], op: Extract<PatchOp, { op: "editFile" | "deleteFile" }>): ViewItem["c"] {
  const isCustom = c.type === "custom";
  if (c.type !== "design" && !isCustom) throw new OpError(`item "${op.id}" is a ${c.type}; file edits apply to design and custom items`);
  const files: Record<string, string> = isCustom ? { "index.html": String(c.html ?? "") } : { ...(c.files as Record<string, string>) };
  const entry = isCustom ? "index.html" : (c.entry as string | undefined) ?? (c.framework === "react" ? "App.tsx" : "index.html");
  if (op.op === "deleteFile") {
    if (!(op.path in files)) throw new OpError(`no file "${op.path}" in "${op.id}"`);
    if (op.path === entry) throw new OpError(`"${op.path}" is the entry file and can't be deleted`);
    delete files[op.path];
  } else if (op.content !== undefined) {
    files[op.path] = op.content;
  } else if (op.edits) {
    if (!(op.path in files)) throw new OpError(`no file "${op.path}" in "${op.id}"`);
    let text = files[op.path];
    for (const e of op.edits) {
      const n = count(text, e.find);
      if (n !== 1) throw new OpError(`edit in ${op.path}: find text occurs ${n} times (it must occur exactly once; include more surrounding text)`);
      text = text.replace(e.find, () => e.replace);
    }
    files[op.path] = text;
  } else throw new OpError("editFile needs content or edits");
  if (isCustom) {
    if (Object.keys(files).some((p) => p !== "index.html")) throw new OpError("a custom item has one file, index.html; use a design for more");
    return { ...c, html: files["index.html"] };
  }
  return { ...c, files };
}

/** Applies ops atomically: every op succeeds or the original view is returned untouched with the first problem. */
export function applyOps(view: View, ops: PatchOp[]): ApplyResult {
  const v: View = structuredClone(view);
  const changed = new Set<string>();
  const used = new Set(allIds(v));
  const section = (id: string): Section => {
    const s = v.sections.find((x) => x.id === id);
    if (!s) throw new OpError(`no section "${id}"`);
    return s;
  };
  const locate = (id: string): { s: Section; i: number } => {
    for (const s of v.sections) {
      const i = s.items.findIndex((x) => x.id === id);
      if (i >= 0) return { s, i };
    }
    throw new OpError(`no item "${id}"`);
  };
  const claim = (id: string) => {
    if (used.has(id)) throw new OpError(`id "${id}" is already used in this view`);
    used.add(id);
  };

  try {
    ops.forEach((op, n) => {
      try {
        switch (op.op) {
          case "set":
            if (op.title !== undefined) v.title = op.title;
            if (op.summary !== undefined) v.summary = op.summary;
            break;
          case "addSection":
            claim(op.section.id);
            for (const item of op.section.items) claim(item.id);
            insert(v.sections, structuredClone(op.section), op.after, "sections");
            changed.add(op.section.id);
            for (const item of op.section.items) changed.add(item.id);
            break;
          case "removeSection": {
            const s = section(op.id);
            v.sections.splice(v.sections.indexOf(s), 1);
            used.delete(s.id);
            for (const item of s.items) used.delete(item.id);
            changed.add(op.id);
            break;
          }
          case "moveSection": {
            const s = section(op.id);
            v.sections.splice(v.sections.indexOf(s), 1);
            insert(v.sections, s, op.after, "sections");
            changed.add(op.id);
            break;
          }
          case "add":
            section(op.section);
            claim(op.item.id);
            insert(section(op.section).items, structuredClone(op.item), op.after, `section "${op.section}"`);
            changed.add(op.item.id);
            break;
          case "update": {
            const { s, i } = locate(op.id);
            const cur = s.items[i];
            const next: ViewItem = { ...cur };
            if (op.item.span !== undefined) next.span = op.item.span;
            if (op.item.title !== undefined) next.title = op.item.title;
            if (op.item.c) next.c = deepMerge(cur.c, op.item.c) as ViewItem["c"];
            s.items[i] = next;
            changed.add(op.id);
            break;
          }
          case "replace": {
            const { s, i } = locate(op.id);
            if (op.item.id !== op.id) {
              claim(op.item.id);
              used.delete(op.id);
            }
            s.items[i] = structuredClone(op.item);
            changed.add(op.item.id);
            break;
          }
          case "remove": {
            const { s, i } = locate(op.id);
            s.items.splice(i, 1);
            used.delete(op.id);
            changed.add(op.id);
            break;
          }
          case "move": {
            const target = section(op.section);
            const { s, i } = locate(op.id);
            const [item] = s.items.splice(i, 1);
            insert(target.items, item, op.after, `section "${op.section}"`);
            changed.add(op.id);
            break;
          }
          case "addQuery":
            v.queries = { ...v.queries, [op.id]: { sql: op.sql } };
            break;
          case "addDataset":
            v.datasets = { ...v.datasets, [op.name]: structuredClone(op.input) };
            break;
          case "editFile":
          case "deleteFile": {
            const { s, i } = locate(op.id);
            s.items[i] = { ...s.items[i], c: editFiles(s.items[i].c, op) };
            changed.add(op.id);
            break;
          }
          case "addParam":
            v.params = { ...v.params, [op.name]: structuredClone(op.param) };
            break;
          case "removeParam": {
            if (!v.params || !(op.name in v.params)) throw new OpError(`no param "${op.name}"`);
            const { [op.name]: _gone, ...rest } = v.params;
            v.params = rest;
            break;
          }
        }
      } catch (e) {
        if (e instanceof OpError) throw new OpError(`op ${n + 1} (${op.op}): ${e.message}`, "id" in op ? op.id : "item" in op ? op.item.id : undefined);
        throw e;
      }
    });
  } catch (e) {
    if (!(e instanceof OpError)) throw e;
    const problem: Problem = { severity: "error", message: `patch rejected, nothing applied: ${e.message}`, hint: "check ids with status; every op must name an existing item or section and new ids must be unused" };
    if (e.itemId) problem.itemId = e.itemId;
    return { ok: false, problem };
  }
  return { ok: true, view: v, changed: [...changed] };
}
