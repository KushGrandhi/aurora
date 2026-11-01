import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { compose, SpecCache, type DataInput, type LlmProvider } from "@genui/engine";
import type { RenderEvent } from "@genui/spec";

export type ServerOpts = {
  port: number;
  provider: LlmProvider;
  staticDir?: string;
  openBrowser?: (url: string) => void;
};

const KEEP_RENDERS = 20;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2",
};

const defaultOpen = (url: string) => {
  spawn("open", [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
};

function isInput(v: unknown): v is DataInput {
  if (typeof v === "string") return v.length > 0;
  if (!v || typeof v !== "object") return false;
  return (typeof (v as { path?: unknown }).path === "string") || Array.isArray((v as { inline?: unknown }).inline);
}
function validData(v: unknown): v is DataInput | Record<string, DataInput> {
  if (isInput(v)) return true;
  return !!v && typeof v === "object" && Object.keys(v).length > 0 && Object.values(v).every(isInput);
}

// Only local pages may drive the server: blocks websites (CSRF / cross-site WebSocket) and DNS rebinding.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  try {
    return LOCAL_HOSTS.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}
function isLocalOrigin(origin: string | undefined): boolean {
  if (origin === undefined) return true; // non-browser clients (CLI, curl) send no Origin
  try {
    const u = new URL(origin);
    return (u.protocol === "http:" || u.protocol === "https:") && LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}
const allowed = (req: IncomingMessage) => isLocalHost(req.headers.host) && isLocalOrigin(req.headers.origin);

async function readBody(req: IncomingMessage): Promise<unknown> {
  let s = "";
  for await (const c of req) s += c;
  return JSON.parse(s);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

export async function startServer(opts: ServerOpts) {
  const cache = new SpecCache();
  const open = opts.openBrowser ?? defaultOpen;
  const events = new Map<string, RenderEvent[]>(); // insertion order = render order
  const clients = new Set<WebSocket>();
  let base = "";

  const broadcast = (e: RenderEvent) => {
    let list = events.get(e.renderId);
    if (!list) {
      list = [];
      events.set(e.renderId, list);
      while (events.size > KEEP_RENDERS) events.delete(events.keys().next().value!);
    }
    list.push(e);
    const msg = JSON.stringify(e);
    for (const c of clients) if (c.readyState === c.OPEN) c.send(msg);
  };

  async function serveStatic(req: IncomingMessage, res: ServerResponse) {
    if (!opts.staticDir) return json(res, 404, { error: "renderer not built" });
    const urlPath = decodeURIComponent(new URL(req.url ?? "/", base).pathname);
    let file = path.join(opts.staticDir, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(opts.staticDir)) return json(res, 403, { error: "forbidden" });
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    } catch {
      file = path.join(opts.staticDir, "index.html");
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      json(res, 404, { error: "not found" });
    }
  }

  const server = createServer(async (req, res) => {
    if (!allowed(req)) return json(res, 403, { error: "forbidden origin" });
    const url = new URL(req.url ?? "/", base);
    if (url.pathname === "/api/health") return json(res, 200, { ok: true, provider: opts.provider.name });
    if (url.pathname === "/api/render" && req.method === "POST") {
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) {
        return json(res, 415, { error: "content-type must be application/json" });
      }
      let body: { data?: unknown; intent?: unknown };
      try {
        body = (await readBody(req)) as typeof body;
      } catch {
        return json(res, 400, { error: "invalid JSON body" });
      }
      if (!validData(body?.data)) return json(res, 400, { error: "body.data must be a path, {path}, {inline:[...]}, or a map of those" });
      if (body.intent !== undefined && typeof body.intent !== "string") return json(res, 400, { error: "intent must be a string" });
      const renderId = randomUUID().slice(0, 8);
      const renderUrl = `${base}/#${renderId}`;
      if (clients.size === 0) open(renderUrl);
      void compose({ renderId, input: body.data, intent: body.intent, provider: opts.provider, cache, emit: broadcast }).catch((e) =>
        broadcast({ t: "error", renderId, message: String(e) }),
      );
      return json(res, 202, { renderId, url: renderUrl });
    }
    if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });
    return serveStatic(req, res);
  });

  const wss = new WebSocketServer({ server, path: "/ws", verifyClient: ({ req }: { req: IncomingMessage }) => allowed(req) });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    for (const list of events.values()) for (const e of list) ws.send(JSON.stringify(e));
  });

  await new Promise<void>((r) => server.listen(opts.port, "127.0.0.1", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;

  return {
    url: base,
    history: (): RenderEvent[] => [...events.values()].flat(),
    async close() {
      for (const c of clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
