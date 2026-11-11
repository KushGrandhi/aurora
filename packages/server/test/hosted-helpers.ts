import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFakeProvider } from "@aurora/engine";
import type { View } from "@aurora/spec";
import { startServer } from "../src/server.ts";

export const TEST_SECRET = "test-secret-0123456789abcdef0123456789";
export const TEST_INVITE = "test-invite";

export type Hosted = Awaited<ReturnType<typeof startHosted>>;

/** A hosted server on a free port with a temp data dir. `close()` stops it and removes the dir. */
export async function startHosted(opts: { invite?: string; waitMs?: number } = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "aurora-hosted-"));
  const invite = opts.invite ?? TEST_INVITE;
  const srv = await startServer({
    port: 0,
    provider: createFakeProvider({ title: "T", parts: [] }),
    openBrowser: () => {},
    waitMs: opts.waitMs ?? 20,
    fontsOffline: true,
    hosted: { secret: TEST_SECRET, publicUrl: "https://aurora.test", dataDir, invite },
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
  return {
    base,
    dataDir,
    srv,
    fetch: req,
    req,
    get,
    post,
    mint,
    async close() {
      await srv.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** A minimal valid view with one text item. */
export const v = (id: string): View => ({ v: 2, id, title: id, sections: [{ id: "s", layout: "grid", items: [{ id: "t", c: { type: "text", md: "hi" } }] }] } as View);
