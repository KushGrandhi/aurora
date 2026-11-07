import type { PatchOp } from "./ops.ts";
import type { Problem } from "./problems.ts";
import type { Item, Spec } from "./spec.ts";
import type { View } from "./view.ts";

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
  | E<{ t: "result"; queryId: string; result: QueryResult; sql?: string }>
  | E<{ t: "queryError"; queryId: string; message: string }>
  | E<{ t: "error"; message: string }>
  | E<{ t: "done"; timings: Record<string, number>; cached: boolean }>;

export type ListEntry = { id: string; title: string; version: number; at: string };

/** Server → screen (v2). */
export type ViewEvent =
  | { t: "view"; viewId: string; version: number; view: View; source: string }
  | { t: "patch"; viewId: string; version: number; baseVersion: number; ops: PatchOp[]; changed: string[]; source: string }
  | { t: "result"; viewId: string; queryId: string; result: QueryResult }
  | { t: "problems"; viewId: string; version: number; problems: Problem[] }
  | { t: "activity"; viewId: string; text: string }
  | { t: "list"; views: ListEntry[] }
  | { t: "variants"; viewId: string; baseVersion: number; variants: { label: string; view: View }[] } // [] = none pending
  | { t: "hello"; build: string } // first message on connect: the screen build the server is serving now
  | { t: "params"; viewId: string; values: Record<string, unknown>; options: Record<string, string[]> } // values by param name
  | { t: "media"; viewId: string; urls: Record<string, string> };

/** Screen → server. */
export type ScreenMessage =
  | { t: "rendered"; viewId: string; version: number; ok: string[]; failed: { itemId: string; message: string }[]; warnings?: { itemId: string; message: string }[] }
  | { t: "pick"; viewId: string; version: number }
  | { t: "sync"; viewId: string }
  | { t: "revertItem"; viewId: string; itemId: string; version: number }
  | { t: "param"; viewId: string; name: string; value: unknown }
  | { t: "event"; viewId: string; itemId: string; name: string; payload: unknown } // aurora.send from a design
  | { t: "pickVariant"; viewId: string; index: number };

/** Something the person did on screen, kept for the caller (not versioned). */
export type AuroraEvent = { seq: number; at: string; itemId?: string; name: string; payload: unknown };
