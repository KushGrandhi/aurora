type Json = unknown;
type Obj = Record<string, Json>;
const isObj = (v: Json): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * A tool's JSON Schema rewritten to the subset strict MCP clients accept. ChatGPT refuses aurora's `render` schema
 * ("Invalid MCP tool schema") while Claude takes it; the schema only guides the model (every call is still checked
 * against the full zod schema on the server), so the rewrite may loosen, never tighten:
 * - tuple `items: [a, b]` (+ `additionalItems`) becomes `items: a` (or `anyOf` of the distinct entries) with
 *   min/maxItems of the tuple's length;
 * - `propertyNames` and `$schema` are dropped; empty `items: {}` is dropped; `additionalProperties: {}` becomes `true`.
 * Names under `properties` are left alone (a property may be called "items").
 */
export function portableSchema(schema: Json): Json {
  if (Array.isArray(schema)) return schema.map(portableSchema);
  if (!isObj(schema)) return schema;
  const out: Obj = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "$schema" || k === "propertyNames" || k === "additionalItems") continue;
    if (k === "properties" && isObj(v)) out[k] = Object.fromEntries(Object.entries(v).map(([name, s]) => [name, portableSchema(s)]));
    else if (k === "items" && Array.isArray(v)) {
      const distinct = [...new Map(v.map((s) => [JSON.stringify(s), portableSchema(s)])).values()];
      if (distinct.length) out.items = distinct.length === 1 ? distinct[0] : { anyOf: distinct };
      out.minItems ??= v.length;
      out.maxItems ??= v.length;
    } else if (k === "items" && isObj(v) && Object.keys(v).length === 0) continue;
    else if (k === "additionalProperties" && isObj(v) && Object.keys(v).length === 0) out[k] = true;
    else out[k] = portableSchema(v);
  }
  return out;
}
