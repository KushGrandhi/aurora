import type { Item, Spec } from "./spec.ts";

export type QueryResult = {
  columns: { name: string; type: string }[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  ms: number;
};

type E<T> = T & { renderId: string };

export type RenderEvent =
  | E<{ t: "start"; title?: string }>
  | E<{ t: "default"; spec: Spec }>
  | E<{ t: "meta"; title: string; summary?: string }>
  | E<{ t: "item"; item: Item; order?: number }> // order = position in the model's stream; display sorts by it
  | E<{ t: "result"; queryId: string; result: QueryResult }>
  | E<{ t: "queryError"; queryId: string; message: string }>
  | E<{ t: "error"; message: string }>
  | E<{ t: "done"; timings: Record<string, number>; cached: boolean }>;
