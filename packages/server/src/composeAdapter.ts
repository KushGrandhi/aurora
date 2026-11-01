import { fromPlan1, type DataInputJson, type PatchOp, type Problem, type RenderEvent, type View, type ViewItem } from "@aurora/spec";
import type { DataInput } from "@aurora/engine";

export type ComposeAction =
  | { kind: "render"; view: View }
  | { kind: "patch"; ops: PatchOp[] }
  | { kind: "activity"; text: string }
  | { kind: "problem"; problem: Problem }
  | null;

const SECTION = "main";

/**
 * Turns Plan 1 compose events into v2 view actions for one view. The default view renders first; the first composed
 * item removes the `d_` default items in the same patch; items are placed by their stream `order`. Queries arrive as
 * addQuery ops (the intake re-runs them against the view's own datasets, so the view outlives the composer).
 */
export function createComposeAdapter(viewId: string, input: DataInput | Record<string, DataInput>): (e: RenderEvent) => ComposeAction {
  const datasets: Record<string, DataInputJson> =
    typeof input === "string" || "path" in input || "inline" in input ? { data: input as DataInputJson } : (input as Record<string, DataInputJson>);
  // The adapter's own model of the view, so it can render a frame when the first event isn't `default` (cache hits).
  let model: View = { v: 2, id: viewId, title: "Composing…", datasets, queries: {}, sections: [{ id: SECTION, layout: "grid", items: [] }] };
  let rendered = false;
  let defaults: string[] = [];
  const placed: { id: string; order: number }[] = [];

  const items = () => model.sections[0].items;
  const step = (ops: PatchOp[]): ComposeAction => {
    for (const op of ops) {
      if (op.op === "addQuery") model.queries = { ...model.queries, [op.id]: { sql: op.sql } };
      else if (op.op === "set") model = { ...model, ...(op.title !== undefined ? { title: op.title } : {}), ...(op.summary !== undefined ? { summary: op.summary } : {}) };
      else if (op.op === "remove") model.sections[0].items = items().filter((i) => i.id !== op.id);
      else if (op.op === "replace") model.sections[0].items = items().map((i) => (i.id === op.id ? op.item : i));
      else if (op.op === "add") {
        const list = items();
        const at = op.after === null ? 0 : op.after === undefined ? list.length : list.findIndex((i) => i.id === op.after) + 1;
        list.splice(at, 0, op.item);
      }
    }
    if (rendered) return { kind: "patch", ops };
    rendered = true;
    return { kind: "render", view: structuredClone(model) };
  };

  return (e) => {
    switch (e.t) {
      case "start":
        return { kind: "activity", text: "Composing…" };
      case "default": {
        const v = fromPlan1(e.spec, viewId);
        model = { ...v, datasets };
        defaults = v.sections[0].items.map((i) => i.id);
        rendered = true;
        return { kind: "render", view: structuredClone(model) };
      }
      case "meta":
        return step([{ op: "set", title: e.title, ...(e.summary !== undefined ? { summary: e.summary } : {}) }]);
      case "result":
        if (!e.sql || model.queries?.[e.queryId]?.sql === e.sql) return null;
        return step([{ op: "addQuery", id: e.queryId, sql: e.sql }]);
      case "item": {
        const item: ViewItem = e.item;
        const order = e.order ?? placed.length;
        if (placed.some((p) => p.id === item.id)) return step([{ op: "replace", id: item.id, item }]);
        const ops: PatchOp[] = defaults.map((id) => ({ op: "remove", id }) as PatchOp);
        defaults = [];
        const before = placed.filter((p) => p.order <= order).sort((a, b) => b.order - a.order)[0];
        ops.push({ op: "add", section: SECTION, item, after: before ? before.id : null });
        placed.push({ id: item.id, order });
        return step(ops);
      }
      case "queryError":
        return { kind: "problem", problem: { severity: "warning", message: `composer query "${e.queryId}" failed: ${e.message}` } };
      case "error":
        return { kind: "problem", problem: { severity: "error", message: `composer: ${e.message}` } };
      case "done":
        return { kind: "activity", text: "" };
    }
  };
}
