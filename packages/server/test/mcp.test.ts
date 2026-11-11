import { expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAuroraMcpServer } from "../src/mcp.ts";

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

async function connect(reply: Parameters<typeof fakeFetch>[0], extra: { hosted?: boolean } = {}) {
  const { f, calls } = fakeFetch(reply);
  const server = createAuroraMcpServer({ baseUrl: "http://localhost:9", fetch: f, cwd: "/work/proj", ...extra });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "t", version: "1" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, calls };
}

const view = { v: 2, id: "demo", title: "Demo", sections: [{ id: "main", layout: "grid", items: [{ id: "a", c: { type: "text", md: "hi" } }] }] };

test("lists the nine tools", async () => {
  const { client } = await connect(() => ({ body: {} }));
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(["compose", "events", "look", "patch", "profile", "render", "status", "variants", "version"]);
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

test("hosted: no watch call (the server's disk is not the caller's)", async () => {
  const { calls } = await connect(() => ({ body: {} }), { hosted: true });
  await new Promise((r) => setTimeout(r, 10));
  expect(calls.find((c) => c.url.endsWith("/api/watch"))).toBeUndefined();
});

test("look returns each picture as an image the model sees, with its caption", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const file = `${mkdtempSync(`${tmpdir()}/look-`)}/desktop-00.jpg`;
  writeFileSync(file, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const { client, calls } = await connect(() => ({ body: { viewId: "demo", version: 3, shots: [{ size: "desktop", file, caption: "desktop 1440×900, 0–19% of the page" }] } }));
  const r = await client.callTool({ name: "look", arguments: { viewId: "demo", sizes: ["desktop", "phone"] } });
  expect(calls.find((c) => c.url.endsWith("/look"))).toMatchObject({ method: "POST", url: "http://localhost:9/api/views/demo/look", body: { sizes: ["desktop", "phone"] } });
  const content = r.content as { type: string; text?: string; data?: string; mimeType?: string }[];
  expect(content.map((c) => c.type)).toEqual(["text", "text", "image"]);
  expect(content[1].text).toContain("0–19%");
  expect(content[2]).toMatchObject({ mimeType: "image/jpeg", data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64") });
});
