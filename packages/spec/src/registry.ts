import type { ZodType } from "zod";

export type ComponentDef<C = any> = {
  type: string;
  schema: ZodType<C>;
  doc: { summary: string; example: C; guidance: string };
  /** Query ids the component reads. Non-empty → data-bound: Plan 1 number rules apply. */
  dataBound?: (c: C) => string[];
  /** Prose fields that may hold `{query.field|format}` placeholders. */
  placeholders?: (c: C) => string[];
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
