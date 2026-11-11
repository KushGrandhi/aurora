import { afterEach, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { startHosted as start, v, type Hosted } from "./hosted-helpers.ts";

let servers: Hosted[] = [];
let clients: Client[] = [];
const startHosted = async (opts?: Parameters<typeof start>[0]) => {
  const s = await start(opts);
  servers.push(s);
  return s;
};
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await Promise.all(servers.map((s) => s.close()));
  clients = [];
  servers = [];
});

test("an MCP client over HTTP renders with a bearer key and gets a share link", async () => {
  const s = await startHosted(); const key = await s.mint();
  const client = new Client({ name: "t", version: "1" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(s.base + "/mcp"), { requestInit: { headers: { authorization: `Bearer ${key}` } } }));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["render", "patch", "status"]));
  for (const off of ["compose", "look", "variants", "events"]) expect(tools).not.toContain(off);
  const r = await client.callTool({ name: "render", arguments: { view: v("m1") } });
  expect(JSON.stringify(r.content)).toContain("/v/");
});

test("/mcp: no key 401; GET and DELETE 405", async () => {
  const s = await startHosted();
  expect((await s.fetch("/mcp", { method: "POST", body: "{}" })).status).toBe(401);
  expect((await s.fetch("/mcp", { method: "GET" })).status).toBe(405);
  expect((await s.fetch("/mcp", { method: "DELETE" })).status).toBe(405);
});

test("/mcp: a bad key is 401; a body over 4 MB is 413", async () => {
  const s = await startHosted(); const key = await s.mint();
  const headers = (k: string) => ({ authorization: `Bearer ${k}`, "content-type": "application/json", accept: "application/json, text/event-stream" });
  expect((await s.fetch("/mcp", { method: "POST", headers: headers(key + "x"), body: "{}" })).status).toBe(401);
  expect((await s.fetch("/mcp", { method: "POST", headers: headers(key), body: "x".repeat(4 * 1024 * 1024 + 1) })).status).toBe(413);
});
