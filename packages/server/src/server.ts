import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { compose, SpecCache, type DataInput, type LlmProvider } from "@aurora/engine";
import { PatchOpSchema, type ScreenMessage, type ViewEvent } from "@aurora/spec";
import { createComposeAdapter } from "./composeAdapter.ts";
import { galleryView } from "./gallery.ts";
import { DataRuntime } from "./dataRuntime.ts";
import { Intake, IntakeError } from "./intake.ts";
import { MediaRegistry } from "./media.ts";
import { defaultViewsDir, ViewStore } from "./viewStore.ts";
import { ViewFileWatcher } from "./watcher.ts";

export type ServerOpts = {
  port: number;
  provider: LlmProvider;
  staticDir?: string;
  openBrowser?: (url: string) => void;
  viewsDir?: string; // default ~/.aurora/views
  waitMs?: number; // how long render/patch wait for a screen report (default 1500)
  secretFile?: string; // media token secret, default ~/.aurora/secret
};

const REPLAY_VIEWS = 20;
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff": "font/woff",
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
// Sandboxed design frames have an opaque origin and send `Origin: null`: they may load libraries and media, nothing else.
const sandboxRead = (req: IncomingMessage) => req.method === "GET" && req.headers.origin === "null" && isLocalHost(req.headers.host) && /^\/(lib|media)\//.test(req.url ?? "");

async function readBody(req: IncomingMessage): Promise<unknown> {
  let s = "";
  for await (const c of req) s += c;
  return JSON.parse(s);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const PatchBody = z.object({ ops: z.array(PatchOpSchema), baseVersion: z.number().int().optional() });
const PickBody = z.object({ version: z.number().int().min(1) });
const RevertBody = z.object({ itemId: z.string(), version: z.number().int().min(1) });
const ParamBody = z.object({ name: z.string(), value: z.unknown() });
const VariantsBody = z.object({ variants: z.array(z.object({ label: z.string(), ops: z.array(PatchOpSchema) })), baseVersion: z.number().int().optional() });
const ScreenMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("rendered"), viewId: z.string(), version: z.number(), ok: z.array(z.string()), failed: z.array(z.object({ itemId: z.string(), message: z.string() })) }),
  z.object({ t: z.literal("pick"), viewId: z.string(), version: z.number() }),
  z.object({ t: z.literal("sync"), viewId: z.string() }),
  z.object({ t: z.literal("revertItem"), viewId: z.string(), itemId: z.string(), version: z.number() }),
  z.object({ t: z.literal("param"), viewId: z.string(), name: z.string(), value: z.unknown() }),
  z.object({ t: z.literal("event"), viewId: z.string(), itemId: z.string(), name: z.string(), payload: z.unknown() }),
  z.object({ t: z.literal("pickVariant"), viewId: z.string(), index: z.number().int().min(0) }),
]);

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const i = r.error.issues[0];
  throw new HttpError(400, `${i?.path.map(String).join(".") || "body"}: ${i?.message ?? "invalid"}`);
}

export async function startServer(opts: ServerOpts) {
  const cache = new SpecCache();
  const open = opts.openBrowser ?? defaultOpen;
  const clients = new Set<WebSocket>();
  let base = "";
  const viewsDir = opts.viewsDir ?? defaultViewsDir();
  const store = new ViewStore(viewsDir);
  await store.load();
  await store.prune();
  const data = new DataRuntime({ inlineDir: viewsDir });
  const media = new MediaRegistry({ secretFile: opts.secretFile ?? path.join(homedir(), ".aurora", "secret") });

  const send = (ws: WebSocket, e: ViewEvent) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(e));
  };
  const broadcast = (e: ViewEvent) => {
    for (const c of clients) send(c, e);
  };
  const intake = new Intake({
    store, data, emit: broadcast, baseUrl: () => base, screens: () => clients.size, openScreen: open, waitMs: opts.waitMs, media,
  });

  const watcher = new ViewFileWatcher(intake);
  // A rebuilt screen (vite build) replaces the dist folder: tell open screens, so ones on the old build reload.
  let lastBuild = screenBuild();
  const buildCheck = setInterval(() => {
    const b = screenBuild();
    if (b !== lastBuild) broadcast({ t: "hello", build: b });
    lastBuild = b;
  }, 1000);
  buildCheck.unref();

  /** Plan 1 entry: the built-in composer streams into a v2 view through the same intake. */
  function startCompose(input: DataInput | Record<string, DataInput>, intent: string | undefined): string {
    const viewId = `r_${randomUUID().slice(0, 8)}`;
    const adapt = createComposeAdapter(viewId, input);
    intake.ensureScreen(viewId);
    let chain: Promise<unknown> = Promise.resolve();
    const run = (fn: () => Promise<unknown> | void) => {
      chain = chain.then(fn).catch((e) => intake.note(viewId, { severity: "error", message: `composer: ${(e as Error).message}` }));
    };
    void compose({
      renderId: viewId, input, intent, provider: opts.provider, cache,
      emit: (e) => {
        const a = adapt(e);
        if (!a) return;
        if (a.kind === "render") run(() => intake.render(a.view, "compose", { wait: false }));
        else if (a.kind === "patch") run(() => intake.patch(viewId, a.ops, "compose", undefined, { wait: false }));
        else if (a.kind === "activity") run(() => intake.activity(viewId, a.text));
        else run(() => intake.note(viewId, a.problem));
      },
    }).catch((e) => run(() => intake.note(viewId, { severity: "error", message: `composer: ${String(e)}` })));
    return viewId;
  }

  function screenBuild(): string {
    try {
      return createHash("sha256").update(readFileSync(path.join(opts.staticDir ?? "", "index.html"))).digest("hex").slice(0, 12);
    } catch {
      return "dev";
    }
  }

  /** Libraries, fonts and the runtime for sandboxed design frames (cross-origin: frames have an opaque origin). */
  async function serveLib(raw: string, res: ServerResponse) {
    const libDir = path.join(opts.staticDir ?? "", "lib");
    let rel: string;
    try {
      rel = decodeURIComponent(raw.split("?")[0].slice("/lib/".length));
    } catch {
      return json(res, 404, { error: "not found" });
    }
    const file = path.resolve(libDir, rel);
    if (!opts.staticDir || !file.startsWith(libDir + path.sep)) return json(res, 404, { error: "not found" });
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
        "access-control-allow-origin": "*",
        "x-content-type-options": "nosniff",
        "cache-control": "public, max-age=3600",
      });
      res.end(body);
    } catch {
      json(res, 404, { error: "not found" });
    }
  }

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
      // index.html names the current build's hashed assets: always revalidate it; the hashed assets never change.
      const cache = file.endsWith(".html") ? "no-cache" : file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
      res.writeHead(200, { "content-type": MIME[path.extname(file)] ?? "application/octet-stream", "cache-control": cache });
      res.end(body);
    } catch {
      json(res, 404, { error: "not found" });
    }
  }

  async function api(req: IncomingMessage, url: URL): Promise<[number, unknown]> {
    const method = req.method ?? "GET";
    let body: unknown;
    if (method === "POST") {
      if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "content-type must be application/json");
      try {
        body = await readBody(req);
      } catch {
        throw new HttpError(400, "invalid JSON body");
      }
    }
    const p = url.pathname;
    if (p === "/api/health") return [200, { ok: true, provider: opts.provider.name }];
    if (p === "/api/views" && method === "GET") return [200, store.list()];
    if (p === "/api/views" && method === "POST") {
      const view = (body as { view?: unknown })?.view;
      if (!view || typeof view !== "object") throw new HttpError(400, "body.view must be a view document");
      return [200, await intake.render(view as never, "caller")];
    }
    if (p === "/api/gallery" && method === "POST") return [200, await intake.render(galleryView(), "caller")];
    if (p === "/api/profile" && method === "POST") {
      const d = (body as { data?: unknown })?.data;
      if (!validData(d)) throw new HttpError(400, "body.data must be a path, {path}, {inline:[...]}, or a map of those");
      return [200, await data.profile(d)];
    }
    if (p === "/api/watch" && method === "POST") {
      const d = (body as { dir?: unknown })?.dir;
      if (typeof d !== "string" || !path.isAbsolute(d)) throw new HttpError(400, "body.dir must be an absolute path");
      watcher.watch(d);
      return [200, { watching: watcher.dirs() }];
    }
    if (p === "/api/render" && method === "POST") {
      const b = body as { data?: unknown; intent?: unknown };
      if (!validData(b?.data)) throw new HttpError(400, "body.data must be a path, {path}, {inline:[...]}, or a map of those");
      if (b.intent !== undefined && typeof b.intent !== "string") throw new HttpError(400, "intent must be a string");
      const viewId = startCompose(b.data, b.intent);
      return [202, { renderId: viewId, url: intake.url(viewId) }];
    }
    const vm = p.match(/^\/api\/views\/([A-Za-z_]\w*)\/versions\/(\d+)$/);
    if (vm && method === "GET") {
      const e = store.get(vm[1], Number(vm[2]));
      if (!e) throw new HttpError(404, `view "${vm[1]}" has no version ${vm[2]}`);
      return [200, e];
    }
    const m = p.match(/^\/api\/views\/([A-Za-z_]\w*)(?:\/(patch|status|history|pick|revert|params|events|variants))?$/);
    if (m) {
      const [, id, action] = m;
      if (!action && method === "GET") {
        const cur = store.current(id);
        if (!cur) throw new HttpError(404, `no view "${id}"`);
        return [200, cur];
      }
      if (action === "status" && method === "GET") {
        if (store.current(id)) await intake.refresh(id);
        return [200, intake.status(id)];
      }
      if (action === "history" && method === "GET") {
        if (!store.current(id)) throw new HttpError(404, `no view "${id}"`);
        return [200, store.history(id)];
      }
      if (action === "patch" && method === "POST") {
        const b = parse(PatchBody, body);
        return [200, await intake.patch(id, b.ops, "caller", b.baseVersion)];
      }
      if (action === "events" && method === "GET") {
        const after = Number(url.searchParams.get("after") ?? 0) || 0;
        const wait = Math.min(Number(url.searchParams.get("wait") ?? 0) || 0, 60_000);
        return [200, { events: await intake.waitEvents(id, after, wait) }];
      }
      if (action === "variants" && method === "POST") {
        const b = parse(VariantsBody, body);
        return [200, await intake.variants(id, b.variants, b.baseVersion)];
      }
      if (action === "params" && method === "POST") {
        const b = parse(ParamBody, body);
        const r = await intake.setParam(id, b.name, b.value);
        return "problem" in r ? [400, { error: r.problem.message, problem: r.problem }] : [200, r];
      }
      if (action === "pick" && method === "POST") return [200, await intake.pick(id, parse(PickBody, body).version)];
      if (action === "revert" && method === "POST") {
        const b = parse(RevertBody, body);
        return [200, await intake.revertItem(id, b.itemId, b.version)];
      }
    }
    throw new HttpError(404, "not found");
  }

  const server = createServer(async (req, res) => {
    if (!allowed(req) && !sandboxRead(req)) return json(res, 403, { error: "forbidden origin" });
    const raw = req.url ?? "/";
    if (raw.startsWith("/media/")) {
      // Matched on the raw path: only /media/<32 hex> can ever resolve, and a 404 says nothing about why.
      const token = /^\/media\/([0-9a-f]{32})(?:\?.*)?$/.exec(raw)?.[1];
      if (req.method === "GET" && token && (await media.serve(token, req, res))) return;
      return json(res, 404, { error: "not found" });
    }
    if (raw.startsWith("/lib/")) return serveLib(raw, res);
    const url = new URL(raw, base);
    if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);
    try {
      const [status, out] = await api(req, url);
      json(res, status, out);
    } catch (e) {
      const status = e instanceof HttpError || e instanceof IntakeError ? e.status : 500;
      json(res, status, { error: (e as Error).message });
    }
  });

  // Screens send small reports and events; a 1 MB cap keeps one bad message from tying the server up.
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 * 1024, verifyClient: ({ req }: { req: IncomingMessage }) => allowed(req) });
  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    ws.on("message", (raw) => {
      let msg: ScreenMessage;
      try {
        const r = ScreenMessageSchema.safeParse(JSON.parse(String(raw)));
        if (!r.success) return;
        msg = r.data;
      } catch {
        return;
      }
      if (msg.t === "sync") {
        void intake.refresh(msg.viewId).catch(() => {}).then(() => { for (const e of intake.snapshot(msg.viewId)) send(ws, e); });
        return;
      }
      intake.screenMessage(msg).catch(() => {}); // e.g. a pick of a version that doesn't exist: nothing to do
    });
    // A screen loaded from an older build (the server was restarted on a new one) reloads when it sees this change.
    send(ws, { t: "hello", build: screenBuild() });
    const list = store.list();
    send(ws, { t: "list", views: list });
    void (async () => {
      for (const v of list.slice(0, REPLAY_VIEWS)) {
        await intake.refresh(v.id).catch(() => {});
        for (const e of intake.snapshot(v.id)) send(ws, e);
      }
    })();
  });

  await new Promise<void>((r) => server.listen(opts.port, "127.0.0.1", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;

  return {
    url: base,
    intake,
    store,
    async close() {
      watcher.close();
      clearInterval(buildCheck);
      for (const c of clients) c.terminate();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      await data.closeAll();
    },
  };
}
