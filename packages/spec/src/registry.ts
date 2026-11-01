import type { ZodType } from "zod";

export type ComponentDef<C = any> = {
  type: string;
  schema: ZodType<C>;
  doc: {
    summary: string;
    example: C;
    guidance: string;
    /** Datasets and queries the example reads. Names are prefixed with the component type. */
    fixture?: { datasets: Record<string, { inline: unknown[] }>; queries: Record<string, { sql: string }> };
  };
  /** Query ids the component reads. Non-empty → data-bound: Plan 1 number rules apply. */
  dataBound?: (c: C) => string[];
  /** Prose fields that may hold `{query.field|format}` placeholders. */
  placeholders?: (c: C) => string[];
  /** Semantic error beyond the schema (dangling ids, cycles, unparseable dates), or null. */
  check?: (c: C) => string | null;
  /** Local paths or URLs the component displays. */
  media?: (c: C) => string[];
};

const defs = new Map<string, ComponentDef>();

export function registerComponent<C>(def: ComponentDef<C>): void {
  if (defs.has(def.type)) throw new Error(`component type "${def.type}" is already registered`);
  defs.set(def.type, def);
}

export function getComponent(type: string): ComponentDef | undefined {
  return defs.get(type);
}

export function allComponents(): ComponentDef[] {
  return [...defs.values()];
}
