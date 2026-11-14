import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { portableSchema } from "./portableSchema.ts";
import { PatchOpSchema, ViewSchema } from "@aurora/spec";

const DataSchema = z.union([
  z.string(),
  z.object({ path: z.string(), format: z.string().optional() }),
  z.object({ inline: z.array(z.unknown()) }),
  z.record(z.string(), z.union([z.string(), z.object({ path: z.string(), format: z.string().optional() }), z.object({ inline: z.array(z.unknown()) })])),
]).describe("An absolute file path, {path}, {inline: [rows]}, or a map of dataset name → one of those");

type ToolResult = { content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[]; isError?: boolean };

/** aurora's tools for any MCP harness. Each call forwards to the shared local server's HTTP API. */
/**
 * `hosted`: the tools for hosted aurora over HTTP: no compose, look, variants, events or profile (off or file-only
 * there), and the descriptions say datasets are inline only. `headers` go on every forwarded call (the bearer key).
 */
export function createAuroraMcpServer(opts: { baseUrl: string; fetch?: typeof fetch; cwd: string; hosted?: boolean; headers?: Record<string, string> }): McpServer {
  const f = opts.fetch ?? fetch;
  const call = async (method: "GET" | "POST", path: string, body?: unknown): Promise<ToolResult> => {
    try {
      const res = await f(opts.baseUrl + path, {
        method,
        headers: { ...opts.headers, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      if (!res.ok) {
        let message = text;
        try {
          message = JSON.parse(text).error ?? text;
        } catch {}
        return { content: [{ type: "text", text: `aurora error (${res.status}): ${message}` }], isError: true };
      }
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `aurora server unreachable at ${opts.baseUrl}: ${(e as Error).message}` }], isError: true };
    }
  };
  const id = (s: string) => encodeURIComponent(s);

  const hosted = !!opts.hosted;
  const HOSTED_DATA = " Hosted aurora: datasets are inline only, {inline: [rows]} with the rows in the view; file paths and URLs are not read. Media must be http(s) URLs.";

  const server = new McpServer({ name: "aurora", version: "0.2.0" });
  server.registerTool("render", {
    description: hosted
      ? "Create a view (or replace it entirely when the id exists). Returns {viewId, version, url, problems}; url is the view's view-only share link, so give it to the person." + HOSTED_DATA
      : "Show a view on the aurora screen (creates it, or replaces it entirely when the id exists). Returns {viewId, version, url, problems}. For a live build-up, render the frame (title + sections) first, then add components one patch at a time.",
    inputSchema: { view: ViewSchema },
  }, ({ view }) => call("POST", "/api/views", { view }));
  server.registerTool("patch", {
    description: "Change a view in place by id: an ordered list of ops (set, addSection, removeSection, moveSection, add, update, replace, remove, move, addQuery, addDataset, addParam, removeParam, editFile, deleteFile), applied all-or-nothing. For designs, editFile with edits [{find, replace}] changes a few lines without resending files. Pass baseVersion (the version you last saw); if the person picked another version on screen the result says rebased: true." + (hosted ? HOSTED_DATA : ""),
    inputSchema: { viewId: z.string(), ops: z.array(PatchOpSchema), baseVersion: z.number().int().optional() },
  }, ({ viewId, ops, baseVersion }) => call("POST", `/api/views/${id(viewId)}/patch`, { ops, ...(baseVersion !== undefined ? { baseVersion } : {}) }));
  server.registerTool("status", {
    description: "Current version of a view, its problems (validation, data and screen render errors) and items no screen has confirmed yet (unverified). Check after render/patch when problems were reported.",
    inputSchema: { viewId: z.string() },
  }, ({ viewId }) => call("GET", `/api/views/${id(viewId)}/status`));
  // Local only: look, profile, variants, events and compose (screenshots, files, a watching screen, the composer).
  if (!hosted) server.registerTool("look", {
    description: "See the view as a person sees it: screenshots from a headless browser, top to bottom, one per story step. Default: desktop only (about 6 pictures, ~7k tokens); add \"phone\" to sizes to check the phone layout, or pass a section id to look at just that part. Use it after building and after big changes; compare what you see with your story outline and the look you chose, then fix what's off.",
    inputSchema: { viewId: z.string(), sizes: z.array(z.enum(["desktop", "phone"])).max(2).optional(), section: z.string().optional(), maxShots: z.number().int().min(1).max(12).optional() },
  }, async ({ viewId, sizes, section, maxShots }) => {
    const r = await call("POST", `/api/views/${id(viewId)}/look`, { sizes, section, maxShots });
    if (r.isError) return r;
    const out = JSON.parse((r.content[0] as { text: string }).text) as { version: number; shots: { file: string; caption: string }[] };
    const content: ToolResult["content"] = [{ type: "text", text: `v${out.version}: ${out.shots.length} pictures` }];
    for (const s of out.shots) {
      content.push({ type: "text", text: s.caption });
      content.push({ type: "image", data: (await readFile(s.file)).toString("base64"), mimeType: "image/jpeg" });
    }
    return { content };
  });
  if (!hosted) server.registerTool("profile", {
    description: "Profile data files before writing queries: column names, types, summary stats and sample rows. Data never needs to pass through your context.",
    inputSchema: { data: DataSchema },
  }, ({ data }) => call("POST", "/api/profile", { data }));
  server.registerTool("version", {
    description: "Version history of a view: action 'history' lists versions; 'pick' makes an older version current (as a new version); 'revertItem' restores one item from an older version.",
    inputSchema: { viewId: z.string(), action: z.enum(["history", "pick", "revertItem"]), version: z.number().int().optional(), itemId: z.string().optional() },
  }, ({ viewId, action, version, itemId }) => {
    if (action === "history") return call("GET", `/api/views/${id(viewId)}/history`);
    if (action === "pick") return call("POST", `/api/views/${id(viewId)}/pick`, { version });
    return call("POST", `/api/views/${id(viewId)}/revert`, { itemId, version });
  });
  if (!hosted) server.registerTool("variants", {
    description: "Offer 2 or 3 alternatives side by side on the screen (e.g. three hero designs). Each is a label plus patch ops applied to the current view; none becomes a version until the person picks one. Then call events (with waitMs) to learn which they chose: a \"aurora:variant-picked\" event.",
    inputSchema: { viewId: z.string(), variants: z.array(z.object({ label: z.string(), ops: z.array(PatchOpSchema) })), baseVersion: z.number().int().optional() },
  }, ({ viewId, variants, baseVersion }) => call("POST", `/api/views/${id(viewId)}/variants`, { variants, ...(baseVersion !== undefined ? { baseVersion } : {}) }));
  if (!hosted) server.registerTool("events", {
    description: "What the person did on screen: clicks your design sent with aurora.send(name, payload), and variant picks. Pass after (the last seq you saw) and waitMs (up to 60000) to wait until they act.",
    inputSchema: { viewId: z.string(), after: z.number().int().optional(), waitMs: z.number().int().min(0).max(60_000).optional() },
  }, ({ viewId, after, waitMs }) => call("GET", `/api/views/${id(viewId)}/events?after=${after ?? 0}&wait=${waitMs ?? 0}`));
  if (!hosted) server.registerTool("compose", {
    description: "Fallback for callers that want aurora's built-in composer: give data and an intent; aurora's own model designs the view. Prefer composing the view yourself with render/patch.",
    inputSchema: { data: DataSchema, intent: z.string().optional() },
  }, ({ data, intent }) => call("POST", "/api/render", { data, ...(intent ? { intent } : {}) }));

  // tools/list goes out in the portable subset strict clients accept (ChatGPT rejects tuple schemas); calls are
  // still validated against the full zod schemas. The SDK keeps one handler per method: wrap the one it set.
  const handlers = (server.server as unknown as { _requestHandlers: Map<string, (req: unknown, extra: unknown) => Promise<{ tools: { inputSchema: unknown }[] }>> })._requestHandlers;
  const list = handlers.get("tools/list");
  if (!list) throw new Error("aurora: the MCP SDK no longer keeps a tools/list handler where expected");
  handlers.set("tools/list", async (req, extra) => {
    const r = await list(req, extra);
    return { ...r, tools: r.tools.map((t) => ({ ...t, inputSchema: portableSchema(t.inputSchema) })) };
  });

  if (!opts.hosted) void call("POST", "/api/watch", { dir: opts.cwd }); // file streaming in this harness's working folder
  return server;
}

async function healthy(baseUrl: string): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** `aurora mcp`: make sure the shared server runs (start it detached if not), then serve MCP over stdio. */
export async function runMcp(opts: { baseUrl: string; cwd: string }): Promise<void> {
  if (!(await healthy(opts.baseUrl))) {
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    spawn(process.execPath, [...process.execArgv, cli, "serve"], { detached: true, stdio: "ignore", env: process.env }).unref();
    const t = Date.now();
    while (!(await healthy(opts.baseUrl))) {
      if (Date.now() - t > 10_000) throw new Error(`aurora server did not start at ${opts.baseUrl}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const server = createAuroraMcpServer(opts);
  await server.connect(new StdioServerTransport());
}
