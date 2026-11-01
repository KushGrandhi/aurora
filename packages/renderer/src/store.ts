import type { Item, QueryResult, RenderEvent } from "@genui/spec";

export type RenderState = {
  id: string;
  title?: string;
  summary?: string;
  items: Item[];
  results: Record<string, QueryResult>;
  errors: string[];
  done: boolean;
  composed: boolean; // a non-default item has arrived
  order: Record<string, number>; // item id → stream position
  startedAt: number;
  timings?: Record<string, number>;
  cached?: boolean;
};

const isDefault = (i: Item) => i.id.startsWith("d_");

function blank(id: string): RenderState {
  return { id, items: [], results: {}, errors: [], done: false, composed: false, order: {}, startedAt: Date.now() };
}

export function reduce(state: Record<string, RenderState>, e: RenderEvent): Record<string, RenderState> {
  const prev = state[e.renderId] ?? blank(e.renderId);
  let next: RenderState = prev;
  switch (e.t) {
    case "start":
      next = { ...prev, title: e.title ?? prev.title };
      break;
    case "default":
      next = prev.composed ? { ...prev, title: prev.title ?? e.spec.title } : { ...prev, title: prev.title ?? e.spec.title, items: e.spec.layout.items };
      break;
    case "meta":
      next = { ...prev, title: e.title, summary: e.summary };
      break;
    case "item": {
      const base = !prev.composed && !isDefault(e.item) ? prev.items.filter((i) => !isDefault(i)) : prev.items;
      const order = e.order === undefined ? prev.order : { ...prev.order, [e.item.id]: e.order };
      const at = base.findIndex((i) => i.id === e.item.id);
      let items = at >= 0 ? base.map((i, k) => (k === at ? e.item : i)) : [...base, e.item];
      if (e.order !== undefined) {
        const pos = (i: Item) => order[i.id] ?? Infinity;
        items = items.map((i, k) => ({ i, k })).sort((a, b) => pos(a.i) - pos(b.i) || a.k - b.k).map((x) => x.i);
      }
      next = { ...prev, items, order, composed: prev.composed || !isDefault(e.item) };
      break;
    }
    case "result":
      next = { ...prev, results: { ...prev.results, [e.queryId]: e.result } };
      break;
    case "queryError":
      next = { ...prev, errors: [...prev.errors, `${e.queryId}: ${e.message}`] };
      break;
    case "error":
      next = { ...prev, errors: [...prev.errors, e.message] };
      break;
    case "done":
      next = { ...prev, done: true, timings: e.timings, cached: e.cached };
      break;
  }
  return { ...state, [e.renderId]: next };
}
