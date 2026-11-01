// Many JSON-schema→grammar converters reject `pattern` (Ollama fails with "failed to load model vocabulary required
// for format"). Constraints dropped here are still enforced by Zod when each part is validated.
const UNSUPPORTED = new Set(["pattern", "$schema"]);

export function portableSchema(o: unknown): unknown {
  if (Array.isArray(o)) return o.map(portableSchema);
  if (o && typeof o === "object") {
    return Object.fromEntries(Object.entries(o).filter(([k]) => !UNSUPPORTED.has(k)).map(([k, v]) => [k, portableSchema(v)]));
  }
  return o;
}
