import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { listLinks, newLink, revokeLink } from "../src/hosted/linkCli.ts";
import { startHosted as start, v, type Hosted } from "./hosted-helpers.ts";

let servers: Hosted[] = [];
let clients: Client[] = [];
const startHosted = async () => {
  const s = await start();
  servers.push(s);
  return s;
};
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close().catch(() => {})));
  await Promise.all(servers.map((s) => s.close()));
  clients = [];
  servers = [];
});

/** The server-local URL for a link (the CLI prints it under the public URL). */
const local = (s: Hosted, url: string) => s.base + new URL(url).pathname;
const connect = async (url: string) => {
  const client = new Client({ name: "t", version: "1" });
  clients.push(client);
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  return client;
};
/** The workspace a share link belongs to. */
const wsOf = (text: string) => /\/v\/([a-z0-9]{16})_/.exec(text)?.[1];

test("a personal link renders with no Authorization header, into the workspace it names", async () => {
  const s = await startHosted();
  const { url, link } = await newLink(s.dataDir, "https://aurora.test", "claude");
  expect(url).toMatch(/^https:\/\/aurora\.test\/mcp\/[A-Za-z0-9_-]{43}$/);
  const client = await connect(local(s, url));
  const tools = (await client.listTools()).tools.map((t) => t.name);
  expect(tools).toEqual(expect.arrayContaining(["render", "patch", "status"]));
  const r = await client.callTool({ name: "render", arguments: { view: v("p1") } });
  expect(wsOf(JSON.stringify(r.content))).toBe(link.ws);
});

test("two links to one workspace see the same views; a link can't reach another workspace", async () => {
  const s = await startHosted();
  const a = await newLink(s.dataDir, "https://aurora.test", "claude");
  await expect(newLink(s.dataDir, "https://aurora.test", "chatgpt", a.link.ws)).rejects.toThrow(/no workspace/); // not used yet
  await (await connect(local(s, a.url))).callTool({ name: "render", arguments: { view: v("shared") } });
  const b = await newLink(s.dataDir, "https://aurora.test", "chatgpt", a.link.ws);
  const other = await newLink(s.dataDir, "https://aurora.test", "friend");
  expect(other.link.ws).not.toBe(a.link.ws);
  const seen = await (await connect(local(s, b.url))).callTool({ name: "status", arguments: { viewId: "shared" } });
  expect(seen.isError).toBeFalsy();
  const hidden = await (await connect(local(s, other.url))).callTool({ name: "status", arguments: { viewId: "shared" } });
  expect(JSON.stringify(hidden.content)).toMatch(/not found|no view|unknown/i);
});

test("an unknown or revoked link is 404, with no restart; GET is 405; plain /mcp still wants a key", async () => {
  const s = await startHosted();
  const { url } = await newLink(s.dataDir, "https://aurora.test", "claude");
  const p = new URL(url).pathname;
  const init = { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) };
  expect((await s.fetch(p, init)).status).toBe(200);
  expect((await s.fetch("/mcp/" + "A".repeat(43), init)).status).toBe(404);
  expect((await s.fetch("/mcp/short", init)).status).toBe(404);
  expect((await s.fetch(p + "/", init)).status).toBe(200); // a pasted URL often ends in a slash
  expect((await s.fetch(p + "x", init)).status).toBe(404);
  expect((await s.fetch(p, { method: "GET" })).status).toBe(405);
  expect((await s.fetch("/mcp", init)).status).toBe(401);
  await revokeLink(s.dataDir, "claude");
  expect((await s.fetch(p, init)).status).toBe(404);
});

test("links.json keeps only hashes; list never shows a secret; names are unique and checked", async () => {
  const s = await startHosted();
  const { url } = await newLink(s.dataDir, "https://aurora.test/", "claude");
  const secret = url.split("/mcp/")[1]!;
  const file = await readFile(path.join(s.dataDir, "links.json"), "utf8");
  expect(file).not.toContain(secret);
  expect(JSON.stringify(await listLinks(s.dataDir))).not.toContain(secret);
  await expect(newLink(s.dataDir, "https://aurora.test", "claude")).rejects.toThrow(/already exists/);
  await expect(newLink(s.dataDir, "https://aurora.test", "Bad Name")).rejects.toThrow(/name/);
  await expect(newLink(s.dataDir, "https://aurora.test", "x", "../etc")).rejects.toThrow(/workspace/);
  await expect(revokeLink(s.dataDir, "nope")).rejects.toThrow(/no link/);
});

test("with the screen served (as in production), every /.well-known/ probe is a JSON 404, so Claude.ai doesn't try OAuth", async () => {
  const { mkdtemp, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const staticDir = await mkdtemp(path.join(tmpdir(), "aurora-static-"));
  await writeFile(path.join(staticDir, "index.html"), "<!doctype html><p>screen</p>");
  const s = await start({ staticDir });
  servers.push(s);
  const { url } = await newLink(s.dataDir, "https://aurora.test", "claude");
  const secret = url.split("/mcp/")[1]!;
  for (const p of ["/.well-known/oauth-protected-resource", `/.well-known/oauth-protected-resource/mcp/${secret}`, "/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
    const r = await s.fetch(p);
    expect(r.status, p).toBe(404);
    expect(r.headers.get("content-type"), p).toMatch(/json/);
  }
  // and the link still works with the screen on
  const client = await connect(local(s, url));
  expect((await client.listTools()).tools.length).toBeGreaterThan(0);
});
