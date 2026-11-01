import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PatchOpSchema, ViewSchema } from "@genui/spec";

const DataSchema = z.union([
  z.string(),
  z.object({ path: z.string(), format: z.string().optional() }),
  z.object({ inline: z.array(z.unknown()) }),
  z.record(z.string(), z.union([z.string(), z.object({ path: z.string(), format: z.string().optional() }), z.object({ inline: z.array(z.unknown()) })])),
]).describe("An absolute file path, {path}, {inline: [rows]}, or a map of dataset name → one of those");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

/** genui's tools for any MCP harness. Each call forwards to the shared local server's HTTP API. */
export function createGenuiMcpServer(opts: { baseUrl: string; fetch?: typeof fetch; cwd: string }): McpServer {
  const f = opts.fetch ?? fetch;
  const call = async (method: "GET" | "POST", path: string, body?: unknown): Promise<ToolResult> => {
    try {
      const res = await f(opts.baseUrl + path, {
        method,
        ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      if (!res.ok) {
        let message = text;
        try {
          message = JSON.parse(text).error ?? text;
        } catch {}
        return { content: [{ type: "text", text: `genui error (${res.status}): ${message}` }], isError: true };
      }
      return { content: [{ type: "text", text }] };
    } catch (e) {
      return { content: [{ type: "text", text: `genui server unreachable at ${opts.baseUrl}: ${(e as Error).message}` }], isError: true };
    }
  };
  const id = (s: string) => encodeURIComponent(s);

  const server = new McpServer({ name: "genui", version: "0.2.0" });
  server.registerTool("render", {
    description: "Show a view on the genui screen (creates it, or replaces it entirely when the id exists). Returns {viewId, version, url, problems}. For a live build-up, render the frame (title + sections) first, then add components one patch at a time.",
    inputSchema: { view: ViewSchema },
  }, ({ view }) => call("POST", "/api/views", { view }));
  server.registerTool("patch", {
    description: "Change a view in place by id: an ordered list of ops (set, addSection, removeSection, moveSection, add, update, replace, remove, move, addQuery, addDataset, addParam, removeParam, editFile, deleteFile), applied all-or-nothing. For designs, editFile with edits [{find, replace}] changes a few lines without resending files. Pass baseVersion (the version you last saw); if the person picked another version on screen the result says rebased: true.",
    inputSchema: { viewId: z.string(), ops: z.array(PatchOpSchema), baseVersion: z.number().int().optional() },
  }, ({ viewId, ops, baseVersion }) => call("POST", `/api/views/${id(viewId)}/patch`, { ops, ...(baseVersion !== undefined ? { baseVersion } : {}) }));
  server.registerTool("status", {
    description: "Current version of a view, its problems (validation, data and screen render errors) and items no screen has confirmed yet (unverified). Check after render/patch when problems were reported.",
    inputSchema: { viewId: z.string() },
  }, ({ viewId }) => call("GET", `/api/views/${id(viewId)}/status`));
  server.registerTool("profile", {
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
  server.registerTool("variants", {
    description: "Offer 2 or 3 alternatives side by side on the screen (e.g. three hero designs). Each is a label plus patch ops applied to the current view; none becomes a version until the person picks one. Then call events (with waitMs) to learn which they chose: a \"genui:variant-picked\" event.",
    inputSchema: { viewId: z.string(), variants: z.array(z.object({ label: z.string(), ops: z.array(PatchOpSchema) })), baseVersion: z.number().int().optional() },
  }, ({ viewId, variants, baseVersion }) => call("POST", `/api/views/${id(viewId)}/variants`, { variants, ...(baseVersion !== undefined ? { baseVersion } : {}) }));
  server.registerTool("events", {
    description: "What the person did on screen: clicks your design sent with genui.send(name, payload), and variant picks. Pass after (the last seq you saw) and waitMs (up to 60000) to wait until they act.",
    inputSchema: { viewId: z.string(), after: z.number().int().optional(), waitMs: z.number().int().min(0).max(60_000).optional() },
  }, ({ viewId, after, waitMs }) => call("GET", `/api/views/${id(viewId)}/events?after=${after ?? 0}&wait=${waitMs ?? 0}`));
  server.registerTool("compose", {
    description: "Fallback for callers that want genui's built-in composer: give data and an intent; genui's own model designs the view. Prefer composing the view yourself with render/patch.",
    inputSchema: { data: DataSchema, intent: z.string().optional() },
  }, ({ data, intent }) => call("POST", "/api/render", { data, ...(intent ? { intent } : {}) }));

  void call("POST", "/api/watch", { dir: opts.cwd }); // file streaming in this harness's working folder
  return server;
}

async function healthy(baseUrl: string): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

/** `genui mcp`: make sure the shared server runs (start it detached if not), then serve MCP over stdio. */
export async function runMcp(opts: { baseUrl: string; cwd: string }): Promise<void> {
  if (!(await healthy(opts.baseUrl))) {
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    spawn(process.execPath, [...process.execArgv, cli, "serve"], { detached: true, stdio: "ignore", env: process.env }).unref();
    const t = Date.now();
    while (!(await healthy(opts.baseUrl))) {
      if (Date.now() - t > 10_000) throw new Error(`genui server did not start at ${opts.baseUrl}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  const server = createGenuiMcpServer(opts);
  await server.connect(new StdioServerTransport());
}
