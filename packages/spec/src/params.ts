import { z } from "zod";
import { IdSchema } from "./base.ts";

export const ParamSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("select"), label: z.string(), options: z.union([z.array(z.string()), z.object({ query: IdSchema, field: z.string() })]), default: z.string().nullable().optional() }),
  z.object({ type: z.literal("range"), label: z.string(), min: z.number(), max: z.number(), step: z.number().positive().optional(), default: z.tuple([z.number(), z.number()]).optional() }),
  z.object({ type: z.literal("daterange"), label: z.string(), default: z.tuple([z.string().nullable(), z.string().nullable()]).optional() }),
  z.object({ type: z.literal("search"), label: z.string(), default: z.string().optional() }),
]);
export type Param = z.infer<typeof ParamSchema>;

/** SQL variable names a param provides: `$name`, `$name_min/$name_max` or `$name_from/$name_to`. */
export function paramVars(name: string, param: Param): string[] {
  if (param.type === "range") return [`${name}_min`, `${name}_max`];
  if (param.type === "daterange") return [`${name}_from`, `${name}_to`];
  return [name];
}

/** The SQL var values one param value provides. */
export function paramValueVars(name: string, param: Param, value: unknown): Record<string, unknown> {
  const names = paramVars(name, param);
  if (names.length === 1) return { [names[0]]: value };
  const [a, b] = value as [unknown, unknown];
  return { [names[0]]: a, [names[1]]: b };
}

/** The value a param starts with (by param name, not by var). */
export function paramDefault(param: Param): unknown {
  switch (param.type) {
    case "select": return param.default ?? null;
    case "range": return param.default ?? [param.min, param.max];
    case "daterange": return param.default ?? [null, null];
    case "search": return param.default ?? "";
  }
}

/** Values for every SQL var the params provide. */
export function paramDefaults(params: Record<string, Param>): Record<string, unknown> {
  return Object.assign({}, ...Object.entries(params).map(([name, p]) => paramValueVars(name, p, paramDefault(p))));
}

const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) && !isNaN(Date.parse(v));

/** Checks a value the screen or caller sets. `options` are the resolved select options (from the list or the options query). */
export function validateParamValue(name: string, param: Param, value: unknown, options?: string[]): { ok: true; vars: Record<string, unknown> } | { ok: false; message: string } {
  const fail = (message: string) => ({ ok: false as const, message });
  switch (param.type) {
    case "select": {
      if (value === null) break;
      const opts = options ?? (Array.isArray(param.options) ? param.options : []);
      if (typeof value !== "string" || !opts.includes(value)) return fail(`"${String(value)}" is not one of the options for ${param.label}`);
      break;
    }
    case "range": {
      if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === "number" && Number.isFinite(n))) return fail(`${param.label} takes two numbers [low, high]`);
      const [a, b] = value as [number, number];
      if (!(param.min <= a && a <= b && b <= param.max)) return fail(`${param.label} must satisfy ${param.min} ≤ low ≤ high ≤ ${param.max}`);
      break;
    }
    case "daterange": {
      if (!Array.isArray(value) || value.length !== 2 || !value.every((d) => d === null || isDate(d))) return fail(`${param.label} takes two ISO dates (or null) [from, to]`);
      const [a, b] = value as [string | null, string | null];
      if (a && b && Date.parse(a) > Date.parse(b)) return fail(`${param.label}: from is after to`);
      break;
    }
    case "search":
      if (typeof value !== "string" || value.length > 200) return fail(`${param.label} takes text of at most 200 characters`);
      break;
  }
  return { ok: true, vars: paramValueVars(name, param, value) };
}

/** Remove string literals, quoted identifiers and comments so scans only see SQL structure. */
export function stripSqlLiterals(sql: string): string {
  return sql
    .replace(/\$(\w*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/[Ee]'(?:[^'\\]|\\.|'')*'/g, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/** `$name` variables a query references, outside literals, in first-use order. */
export function sqlVars(sql: string): string[] {
  return [...new Set([...stripSqlLiterals(sql).matchAll(/\$([A-Za-z_]\w*)/g)].map((m) => m[1]))];
}
