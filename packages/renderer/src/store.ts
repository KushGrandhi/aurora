import { applyOps, type ListEntry, type Problem, type QueryResult, type ScreenMessage, type View, type ViewEvent } from "@genui/spec";

export type ViewState = {
  view: View;
  version: number;
  problems: Problem[];
  changed: Record<string, number>; // item id → version it last changed
  source: string;
};

export type State = {
  views: Record<string, ViewState>;
  results: Record<string, Record<string, QueryResult>>; // view id → query id → result (results can precede their view)
  activity: Record<string, string>;
  list: ListEntry[];
};

export const emptyState = (): State => ({ views: {}, results: {}, activity: {}, list: [] });

const itemsById = (v: View) => new Map(v.sections.flatMap((s) => s.items.map((i) => [i.id, JSON.stringify(i)] as const)));

/** Pure reducer. A patch that doesn't follow the version we hold asks the server for a fresh snapshot (`need`). */
export function reduce(state: State, e: ViewEvent): { state: State; need?: ScreenMessage } {
  switch (e.t) {
    case "view": {
      const prev = state.views[e.viewId];
      if (prev && prev.version > e.version) return { state };
      const changed = { ...prev?.changed };
      if (prev) {
        const before = itemsById(prev.view);
        for (const [id, json] of itemsById(e.view)) if (before.get(id) !== json) changed[id] = e.version;
      }
      const next: ViewState = { view: e.view, version: e.version, problems: prev?.problems ?? [], changed, source: e.source };
      return { state: { ...state, views: { ...state.views, [e.viewId]: next } } };
    }
    case "patch": {
      const prev = state.views[e.viewId];
      if (prev && e.version <= prev.version) return { state };
      if (!prev || prev.version !== e.baseVersion) return { state, need: { t: "sync", viewId: e.viewId } };
      const r = applyOps(prev.view, e.ops);
      if (!r.ok) return { state, need: { t: "sync", viewId: e.viewId } };
      const changed = { ...prev.changed };
      for (const id of e.changed) changed[id] = e.version;
      return { state: { ...state, views: { ...state.views, [e.viewId]: { ...prev, view: r.view, version: e.version, changed, source: e.source } } } };
    }
    case "result":
      return { state: { ...state, results: { ...state.results, [e.viewId]: { ...state.results[e.viewId], [e.queryId]: e.result } } } };
    case "problems": {
      const prev = state.views[e.viewId];
      if (!prev) return { state };
      return { state: { ...state, views: { ...state.views, [e.viewId]: { ...prev, problems: e.problems } } } };
    }
    case "activity":
      return { state: { ...state, activity: { ...state.activity, [e.viewId]: e.text } } };
    case "list":
      return { state: { ...state, list: e.views } };
  }
}
