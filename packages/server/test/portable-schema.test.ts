import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAuroraMcpServer } from "../src/mcp.ts";
import { portableSchema } from "../src/portableSchema.ts";

test("tuples, propertyNames, $schema and empty schemas become the portable subset; property names are untouched", () => {
  const out = portableSchema({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    propertyNames: { pattern: "^a" },
    additionalProperties: {},
    properties: {
      items: { type: "array", items: {} },
      pair: { type: "array", items: [{ type: "number" }, { type: "number" }], additionalItems: false, minItems: 2, maxItems: 2 },
      mixed: { type: "array", items: [{ type: "string" }, { type: "number" }] },
    },
  });
  expect(out).toEqual({
    type: "object",
    additionalProperties: true,
    properties: {
      items: { type: "array" },
      pair: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
      mixed: { type: "array", items: { anyOf: [{ type: "string" }, { type: "number" }] }, minItems: 2, maxItems: 2 },
    },
  });
});

/** Every keyword a strict client may refuse, anywhere in the schema (outside property names). */
function offenders(s: unknown, path = "$"): string[] {
  if (Array.isArray(s)) return s.flatMap((x, i) => offenders(x, `${path}[${i}]`));
  if (!s || typeof s !== "object") return [];
  const o = s as Record<string, unknown>;
  const bad = [
    ...("$schema" in o ? [`${path}.$schema`] : []),
    ...("propertyNames" in o ? [`${path}.propertyNames`] : []),
    ...("additionalItems" in o ? [`${path}.additionalItems`] : []),
    ...(Array.isArray(o.items) ? [`${path}.items (tuple)`] : []),
  ];
  return [...bad, ...Object.entries(o).flatMap(([k, v]) => (k === "properties" && v && typeof v === "object" ? Object.entries(v).flatMap(([n, p]) => offenders(p, `${path}.properties.${n}`)) : offenders(v, `${path}.${k}`)))];
}

test("the tools aurora lists (local and hosted) carry no tuple, propertyNames or $schema", async () => {
  for (const hosted of [false, true]) {
    const server = createAuroraMcpServer({ baseUrl: "http://127.0.0.1:9", cwd: "/", hosted, fetch: (async () => new Response("{}")) as typeof fetch });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "t", version: "1" });
    await client.connect(b);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("render");
    for (const t of tools) expect(offenders(t.inputSchema), t.name).toEqual([]);
    await client.close();
    await server.close();
  }
});
