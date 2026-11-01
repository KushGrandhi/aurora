import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createGenuiMcpServer } from "../src/mcp.ts";

type Call = { method: string; url: string; body?: unknown };

function fakeFetch(reply: (c: Call) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const c: Call = { method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    calls.push(c);
    const r = reply(c);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

async function connect(reply: Parameters<typeof fakeFetch>[0]) {
  const { f, calls } = fakeFetch(reply);
  const server = createGenuiMcpServer({ baseUrl: "http://localhost:9", fetch: f, cwd: "/work/proj" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
}

const view = { v: 2, id: "demo", title: "Demo", sections: [{ id: "main", layout: "grid", items: [{ id: "a", c: { type: "text", md: "hi" } }] }] };

test("lists the eight tools", async () => {
  const { client } = await connect(() => ({ body: {} }));
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(["compose", "events", "patch", "profile", "render", "status", "variants", "version"]);
  for (const t of tools) expect(t.description!.length).toBeGreaterThan(20);
});

test("render tool posts the view and returns the result", async () => {
  const { client, calls } = await connect((c) => ({ body: c.url.endsWith("/api/views") ? { viewId: "demo", version: 1, url: "http://localhost:9/#demo", problems: [] } : {} }));
  const r = await client.callTool({ name: "render", arguments: { view } });
  expect(r.isError).toBeFalsy();
  const post = calls.find((c) => c.url === "http://localhost:9/api/views")!;
  expect(post.method).toBe("POST");
  expect(post.body).toEqual({ view });
  expect(JSON.parse((r.content as { text: string }[])[0].text)).toMatchObject({ viewId: "demo", version: 1 });
});

test("patch, status and version map to their routes", async () => {
  const { client, calls } = await connect(() => ({ body: { ok: true } }));
  await client.callTool({ name: "patch", arguments: { viewId: "demo", ops: [{ op: "set", title: "X" }], baseVersion: 1 } });
  await client.callTool({ name: "status", arguments: { viewId: "demo" } });
  await client.callTool({ name: "version", arguments: { viewId: "demo", action: "history" } });
  await client.callTool({ name: "version", arguments: { viewId: "demo", action: "pick", version: 1 } });
  await client.callTool({ name: "version", arguments: { viewId: "demo", action: "revertItem", version: 1, itemId: "a" } });
  const seen = calls.filter((c) => !c.url.endsWith("/api/watch")).map((c) => `${c.method} ${c.url.replace("http://localhost:9", "")}`);
  expect(seen).toEqual(["POST /api/views/demo/patch", "GET /api/views/demo/status", "GET /api/views/demo/history", "POST /api/views/demo/pick", "POST /api/views/demo/revert"]);
  expect(calls.find((c) => c.url.endsWith("/revert"))!.body).toEqual({ itemId: "a", version: 1 });
});

test("http error becomes an error result", async () => {
  const { client } = await connect(() => ({ status: 400, body: { error: "invalid view: sections: required" } }));
  const r = await client.callTool({ name: "render", arguments: { view } });
  expect(r.isError).toBe(true);
  expect((r.content as { text: string }[])[0].text).toContain("sections: required");
});

test("registers cwd for watching on start", async () => {
  const { calls } = await connect(() => ({ body: { watching: ["/work/proj"] } }));
  await new Promise((r) => setTimeout(r, 10));
  const w = calls.find((c) => c.url.endsWith("/api/watch"));
  expect(w).toMatchObject({ method: "POST", body: { dir: "/work/proj" } });
});
