import { FontStore } from "./fonts.ts";
import { Looker } from "./look.ts";
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
import { PatchOpSchema, type ScreenMessage } from "@aurora/spec";
import { createComposeAdapter } from "./composeAdapter.ts";
import { galleryView } from "./gallery.ts";
import { createCore, send, type Core } from "./core.ts";
import { BodyTooLarge, MAX_BODY, bearer, readBody, sameSecret } from "./hosted/auth.ts";
import type { HostedConfig } from "./hosted/config.ts";
import { isWorkspaceId, mintKey, newWorkspaceId, verifyKey } from "./hosted/keys.ts";
import { Tenants } from "./hosted/tenants.ts";
import { IntakeError } from "./intake.ts";
import { MediaRegistry } from "./media.ts";
import { defaultViewsDir } from "./viewStore.ts";
import { ViewFileWatcher } from "./watcher.ts";

export type ServerOpts = {
  port: number;
  provider: LlmProvider;
  staticDir?: string;
  openBrowser?: (url: string) => void;
  viewsDir?: string; // default ~/.aurora/views
  waitMs?: number; // how long render/patch wait for a screen report (default 1500)
  secretFile?: string; // media token secret, default ~/.aurora/secret
  fontsDir?: string; // cached Google Fonts, default ~/.aurora/fonts
  fontsOffline?: boolean; // never fetch fonts from Google
  shotsDir?: string; // pictures from look, default ~/.aurora/shots
  hosted?: HostedConfig; // hosted mode: bearer workspace keys, one core per workspace under dataDir
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

/** A JSON request body; hosted mode caps it (413 before or while reading). */
async function jsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  if (Number(req.headers["content-length"]) > maxBytes) throw new BodyTooLarge(maxBytes);
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "content-type must be application/json");
  const buf = await readBody(req, maxBytes);
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const PatchBody = z.object({ ops: z.array(PatchOpSchema), baseVersion: z.number().int().optional() });
const PickBody = z.object({ version: z.number().int().min(1) });
const LookBody = z.object({ sizes: z.array(z.enum(["desktop", "phone"])).max(2).optional(), section: z.string().max(64).optional(), maxShots: z.number().int().min(1).max(12).optional() });
const RevertBody = z.object({ itemId: z.string(), version: z.number().int().min(1) });
const ParamBody = z.object({ name: z.string(), value: z.unknown() });
const VariantsBody = z.object({ variants: z.array(z.object({ label: z.string(), ops: z.array(PatchOpSchema) })), baseVersion: z.number().int().optional() });
const ScreenMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("rendered"), viewId: z.string(), version: z.number(), ok: z.array(z.string()), failed: z.array(z.object({ itemId: z.string(), message: z.string() })), warnings: z.array(z.object({ itemId: z.string(), message: z.string().max(400) })).max(200).optional() }),
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
  let base = "";
  const hosted = opts.hosted ? { ...opts.hosted, dataDir: path.resolve(opts.hosted.dataDir) } : undefined;
  const home = hosted ? hosted.dataDir : path.join(homedir(), ".aurora");
  const maxBody = hosted ? MAX_BODY : Infinity;
  // Shared across cores: fonts, media tokens and the headless browser for look. Hosted media is http(s) URLs only.
  const media = new MediaRegistry({ secretFile: opts.secretFile ?? path.join(home, "secret"), remoteOnly: !!hosted });
  const fonts = new FontStore({ dir: opts.fontsDir ?? path.join(home, "fonts"), libDir: opts.staticDir ? path.join(opts.staticDir, "lib") : undefined, offline: opts.fontsOffline });
  const looker = new Looker({ base: () => base, dir: opts.shotsDir ?? path.join(home, "shots") });
  // Local mode: exactly one core, in today's views folder. Hosted: one per workspace, made on first use.
  const core = hosted ? undefined : await createCore({ ws: "local", dir: opts.viewsDir ?? defaultViewsDir(), media, fonts, open, baseUrl: () => base, waitMs: opts.waitMs });
  const tenants = hosted
    ? new Tenants({ dataDir: hosted.dataDir, make: (ws, dir) => createCore({ ws, dir, media, fonts, open: () => {}, baseUrl: () => base, waitMs: opts.waitMs, hosted: true }) })
    : undefined;

  // File streaming reads the local disk: local mode only.
  const watcher = core ? new ViewFileWatcher(core.intake) : undefined;
  // A rebuilt screen (vite build) replaces the dist folder: tell open screens, so ones on the old build reload.
  let lastBuild = screenBuild();
  const buildCheck = setInterval(() => {
    const b = screenBuild();
    if (b !== lastBuild) core?.broadcast({ t: "hello", build: b });
    lastBuild = b;
  }, 1000);
  buildCheck.unref();

  /** Plan 1 entry: the built-in composer streams into a v2 view through the same intake. */
  function startCompose({ intake }: Core, input: DataInput | Record<string, DataInput>, intent: string | undefined): string {
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

  /** A view's fonts: /lib/fonts/family/<slug>.css (bundled, cached or a stand-in) and cached files under /lib/fonts/g/. */
  async function serveFont(raw: string, res: ServerResponse) {
    const head = (type: string) => res.writeHead(200, { "content-type": type, "access-control-allow-origin": "*", "x-content-type-options": "nosniff", "cache-control": "no-cache" });
    const fam = raw.split("?")[0].match(/^\/lib\/fonts\/family\/([a-z0-9-]+)\.css$/);
    if (fam) {
      const css = await fonts.css(fam[1]);
      if (css === undefined) return json(res, 404, { error: "not found" });
      head("text/css; charset=utf-8");
      return res.end(css);
    }
    const g = raw.split("?")[0].match(/^\/lib\/fonts\/g\/([a-z0-9-]+)\/([\w.-]+)$/);
    const file = g && fonts.file(g[1], g[2]);
    if (!file) return json(res, 404, { error: "not found" });
    head("font/woff2");
    res.end(await readFile(file));
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

  async function api(core: Core, req: IncomingMessage, url: URL): Promise<[number, unknown]> {
    const { store, data, intake, clients } = core;
    const method = req.method ?? "GET";
    const body: unknown = method === "POST" ? await jsonBody(req, maxBody) : undefined;
    const p = url.pathname;
    // Hosted workspaces never touch the server's disk or browser: no file streaming, composer, screenshots,
    // variants or event waits (the MCP drops those tools too). A 404 says the route doesn't exist here.
    if (core.hosted && (p === "/api/watch" || p === "/api/render" || /^\/api\/views\/[^/]+\/(look|variants|events)$/.test(p))) throw new HttpError(404, "not found");
    if (core.hosted && p === "/api/profile") throw new HttpError(400, "hosted aurora takes inline data only, so there is nothing to profile: put the rows in the view's datasets as { inline: [rows] }");
    if (p === "/api/health") return [200, { ok: true, provider: opts.provider.name, screens: clients.size }];
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
      if (!watcher) throw new HttpError(404, "not found");
      watcher.watch(d);
      return [200, { watching: watcher.dirs() }];
    }
    if (p === "/api/render" && method === "POST") {
      const b = body as { data?: unknown; intent?: unknown };
      if (!validData(b?.data)) throw new HttpError(400, "body.data must be a path, {path}, {inline:[...]}, or a map of those");
      if (b.intent !== undefined && typeof b.intent !== "string") throw new HttpError(400, "intent must be a string");
      const viewId = startCompose(core, b.data, b.intent);
      return [202, { renderId: viewId, url: intake.url(viewId) }];
    }
    const vm = p.match(/^\/api\/views\/([A-Za-z_]\w*)\/versions\/(\d+)$/);
    if (vm && method === "GET") {
      const e = store.get(vm[1], Number(vm[2]));
      if (!e) throw new HttpError(404, `view "${vm[1]}" has no version ${vm[2]}`);
      return [200, e];
    }
    const m = p.match(/^\/api\/views\/([A-Za-z_]\w*)(?:\/(patch|status|history|pick|revert|params|events|variants|look))?$/);
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
      if (action === "look" && method === "POST") {
        const cur = store.current(id);
        if (!cur) throw new HttpError(404, `no view "${id}"`);
        const b = parse(LookBody, body ?? {});
        try {
          return [200, { viewId: id, version: cur.version, shots: await looker.look(id, cur.version, b) }];
        } catch (e) {
          throw new HttpError(503, (e as Error).message);
        }
      }
      if (action === "pick" && method === "POST") return [200, await intake.pick(id, parse(PickBody, body).version)];
      if (action === "revert" && method === "POST") {
        const b = parse(RevertBody, body);
        return [200, await intake.revertItem(id, b.itemId, b.version)];
      }
    }
    throw new HttpError(404, "not found");
  }

  /**
   * Hosted API: /api/health and /api/keys are open; everything else needs `Authorization: Bearer <key>`, and the
   * key alone names the workspace (never the Host, address or a query string).
   */
  async function hostedApi(h: HostedConfig, t: Tenants, req: IncomingMessage, url: URL): Promise<[number, unknown]> {
    const p = url.pathname;
    if (p === "/api/health") return [200, { ok: true, provider: opts.provider.name, hosted: true }];
    if (p === "/api/keys") {
      if (req.method !== "POST") throw new HttpError(404, "not found");
      const b = await jsonBody(req, maxBody);
      if (!sameSecret((b as { invite?: unknown })?.invite, h.invite)) throw new HttpError(403, "a valid invite is required");
      const ws = newWorkspaceId();
      return [200, { key: mintKey(h.secret, ws), ws }];
    }
    const key = bearer(req);
    const claim = key ? verifyKey(h.secret, key) : null;
    if (!claim || !isWorkspaceId(claim.ws)) throw new HttpError(401, "a workspace key is required: Authorization: Bearer <key>");
    return api(await t.get(claim.ws), req, url);
  }

  function answerError(req: IncomingMessage, res: ServerResponse, e: unknown) {
    if (e instanceof BodyTooLarge) {
      // The body is no longer kept. Closing the socket mid-upload would cost the client the answer (EPIPE), so
      // the rest is drained and dropped, up to one more cap's worth; past that the connection is cut.
      json(res, 413, { error: e.message });
      let dropped = 0;
      req.on("data", (c: Buffer) => {
        dropped += c.length;
        if (dropped > MAX_BODY) req.destroy();
      });
      req.resume();
      return;
    }
    const status = e instanceof HttpError || e instanceof IntakeError ? e.status : 500;
    json(res, status, { error: (e as Error).message });
  }

  const server = createServer(async (req, res) => {
    // Local mode: only local pages may drive the server. Hosted: identity is the bearer key (or, later, a share token).
    if (!hosted && !allowed(req) && !sandboxRead(req)) return json(res, 403, { error: "forbidden origin" });
    const raw = req.url ?? "/";
    if (raw.startsWith("/media/")) {
      // Matched on the raw path: only /media/<32 hex> can ever resolve, and a 404 says nothing about why.
      const token = /^\/media\/([0-9a-f]{32})(?:\?.*)?$/.exec(raw)?.[1];
      if (req.method === "GET" && token && (await media.serve(token, req, res))) return;
      return json(res, 404, { error: "not found" });
    }
    if (raw.startsWith("/lib/fonts/family/") || raw.startsWith("/lib/fonts/g/")) return serveFont(raw, res);
    if (raw.startsWith("/lib/")) return serveLib(raw, res);
    const url = new URL(raw, base);
    if (!url.pathname.startsWith("/api/")) return serveStatic(req, res);
    try {
      const [status, out] = hosted && tenants ? await hostedApi(hosted, tenants, req, url) : await api(core!, req, url);
      json(res, status, out);
    } catch (e) {
      answerError(req, res, e);
    }
  });

  // Screens send small reports and events; a 1 MB cap keeps one bad message from tying the server up.
  // Hosted: a socket has no workspace without a share token (added with share links), so none are accepted yet.
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 1024 * 1024, verifyClient: ({ req }: { req: IncomingMessage }) => !hosted && allowed(req) });
  wss.on("connection", (ws, req: IncomingMessage) => {
    if (core) screen(core, ws, req);
    else ws.close(1008);
  });

  function screen({ store, intake, clients, captures }: Core, ws: WebSocket, req: IncomingMessage) {
    const capture = new URL(req.url ?? "/", "http://x").searchParams.get("role") === "capture";
    const set = capture ? captures : clients;
    set.add(ws);
    ws.on("close", () => set.delete(ws));
    ws.on("error", () => {}); // e.g. an oversized message: ws closes the socket (1009); unheard, the error would crash the process
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
      if (capture) return; // a capture page only reads: its reports never change a view's problems
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
  }

  await new Promise<void>((r) => server.listen(opts.port, hosted ? "0.0.0.0" : "127.0.0.1", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;

  return {
    url: base,
    intake: core?.intake,
    store: core?.store,
    async close() {
      watcher?.close();
      clearInterval(buildCheck);
      if (core) {
        for (const c of core.clients) c.terminate();
        for (const c of core.captures) c.terminate();
      }
      await looker.close();
      wss.close();
      await new Promise<void>((r) => server.close(() => r()));
      await core?.close();
      await tenants?.closeAll();
    },
  };
}
