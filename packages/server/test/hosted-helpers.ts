import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFakeProvider } from "@aurora/engine";
import type { View, ViewEvent } from "@aurora/spec";
import WebSocket from "ws";
import { startServer } from "../src/server.ts";

export const TEST_SECRET = "test-secret-0123456789abcdef0123456789";
export const TEST_INVITE = "test-invite";

export type Hosted = Awaited<ReturnType<typeof startHosted>>;

/** A hosted server on a free port with a temp data dir. `close()` stops it and removes the dir. */
export async function startHosted(opts: { invite?: string; waitMs?: number; publicUrl?: string } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "aurora-hosted-"));
  const invite = opts.invite ?? TEST_INVITE;
  const srv = await startServer({
    port: 0,
    provider: createFakeProvider({ title: "T", parts: [] }),
    openBrowser: () => {},
    waitMs: opts.waitMs ?? 20,
    fontsOffline: true,
    hosted: { secret: TEST_SECRET, publicUrl: opts.publicUrl ?? "https://aurora.test", dataDir, invite },
  });
  const base = srv.url;
  const auth = (key?: string): Record<string, string> => (key ? { authorization: `Bearer ${key}` } : {});
  const req = (p: string, init: RequestInit = {}) => fetch(base + p, init);
  const get = (p: string, key?: string) => req(p, { headers: auth(key) });
  const post = (p: string, body: unknown, key?: string) =>
    req(p, { method: "POST", headers: { "content-type": "application/json", ...auth(key) }, body: JSON.stringify(body) });
  /** A fresh workspace key, minted through the invite. */
  const mint = async (): Promise<string> => {
    const r = await post("/api/keys", { invite });
    if (r.status !== 200) throw new Error(`mint failed: ${r.status}`);
    return (await r.json()).key;
  };
  const sockets: WebSocket[] = [];
  /** A share socket on `/ws?share=<token>`: resolves once open (an unknown link opens, then closes with 4401). */
  const viewer = async (token: string) => {
    const ws = new WebSocket(`${base.replace("http", "ws")}/ws?share=${encodeURIComponent(token)}`);
    sockets.push(ws);
    const sock = {
      events: [] as ViewEvent[],
      closedWith: undefined as number | undefined,
      send: (m: unknown) => ws.send(JSON.stringify(m)),
      /** Waits for an event that matches. */
      until: (pred: (e: ViewEvent) => boolean, ms = 2000) =>
        new Promise<ViewEvent>((resolve, reject) => {
          const hit = sock.events.find(pred);
          if (hit) return resolve(hit);
          const t = setTimeout(() => { ws.off("message", on); reject(new Error("timed out waiting for an event")); }, ms);
          const on = (raw: WebSocket.RawData) => {
            const e = JSON.parse(String(raw)) as ViewEvent;
            if (pred(e)) { clearTimeout(t); ws.off("message", on); resolve(e); }
          };
          ws.on("message", on);
        }),
      close: () => ws.close(),
    };
    ws.on("message", (raw) => sock.events.push(JSON.parse(String(raw))));
    ws.on("close", (code) => { sock.closedWith = code; });
    await new Promise<void>((resolve, reject) => { ws.once("open", () => resolve()); ws.once("error", reject); });
    return sock;
  };
  /** True when the server refuses the WebSocket upgrade at this path. */
  const refused = (p: string) =>
    new Promise<boolean>((resolve) => {
      const ws = new WebSocket(base.replace("http", "ws") + p);
      ws.once("open", () => { ws.terminate(); resolve(false); });
      ws.once("error", () => { ws.terminate(); resolve(true); });
    });
  return {
    base,
    dataDir,
    srv,
    fetch: req,
    req,
    get,
    post,
    mint,
    viewer,
    refused,
    async close() {
      for (const ws of sockets) ws.terminate();
      await srv.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** A minimal valid view with one text item. */
export const v = (id: string): View => ({ v: 2, id, title: id, sections: [{ id: "s", layout: "grid", items: [{ id: "t", c: { type: "text", md: "hi" } }] }] } as View);

/** The share token in a `<publicUrl>/v/<token>` link. */
export function tokenOf(url: string): string {
  const m = /\/v\/([^/?#]+)$/.exec(new URL(url).pathname);
  if (!m) throw new Error(`not a share link: ${url}`);
  return decodeURIComponent(m[1]!);
}
