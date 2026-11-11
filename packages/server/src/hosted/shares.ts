import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ViewEvent } from "@aurora/spec";
import { isWorkspaceId } from "./keys.ts";

const TOKEN = /^([a-z0-9]{16})_([0-9a-f]{32})$/;

/** The workspace a share token names (`<wsId>_<32 hex>`), or null when it isn't one. Lookup only: never an identity. */
export function wsOfToken(token: string): string | null {
  const m = typeof token === "string" ? TOKEN.exec(token) : null;
  return m ? m[1]! : null;
}

/** What a share socket pinned to `viewId` may receive: that view's events only (never the list of views). */
export function shareOutgoing(viewId: string, e: ViewEvent): boolean {
  if (e.t === "hello") return true; // the screen build, so an open link reloads onto a new build
  return "viewId" in e && e.viewId === viewId;
}

/**
 * One view-only share link per view, kept in `<wsDir>/shares.json` as viewId → 32 hex. The token is
 * `<wsId>_<hex>`; the workspace id is the folder's name. Resolving compares the random part in constant time.
 */
export class Shares {
  private ws: string;
  private file: string;
  private links?: Promise<Map<string, string>>;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(wsDir: string) {
    const ws = path.basename(wsDir);
    if (!isWorkspaceId(ws)) throw new Error("a share folder must be named by its workspace id");
    this.ws = ws;
    this.file = path.join(wsDir, "shares.json");
  }

  /** The view's link, minted on first ask. */
  linkFor(viewId: string): Promise<string> {
    return this.serial(async (links) => {
      let hex = links.get(viewId);
      if (!hex) {
        hex = randomBytes(16).toString("hex");
        await this.save(links, viewId, hex);
      }
      return `${this.ws}_${hex}`;
    });
  }

  /** A new link for the view; the old one stops resolving. */
  rotate(viewId: string): Promise<string> {
    return this.serial(async (links) => {
      const hex = randomBytes(16).toString("hex");
      await this.save(links, viewId, hex);
      return `${this.ws}_${hex}`;
    });
  }

  /** The view a token shows, or null (malformed, another workspace's, rotated or unknown). */
  async resolve(token: string): Promise<string | null> {
    const m = typeof token === "string" ? TOKEN.exec(token) : null;
    if (!m || m[1] !== this.ws) return null;
    const given = Buffer.from(m[2]!, "hex");
    const links = await this.load();
    let found: string | null = null;
    for (const [viewId, hex] of links) {
      const want = Buffer.from(hex, "hex");
      if (want.length === given.length && timingSafeEqual(want, given) && found === null) found = viewId;
    }
    return found;
  }

  private load(): Promise<Map<string, string>> {
    this.links ??= readFile(this.file, "utf8").then(
      (s) => {
        let raw: Record<string, unknown>;
        try {
          raw = JSON.parse(s) as Record<string, unknown>;
          if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("not an object");
        } catch (e) {
          // A torn or hand-edited file: not cached, so the next call reads it again (a fixed file works without a restart).
          console.error(`aurora: ${this.file} could not be read: ${(e as Error).message}`);
          this.links = undefined;
          throw e;
        }
        return new Map(Object.entries(raw).filter((kv): kv is [string, string] => typeof kv[1] === "string" && /^[0-9a-f]{32}$/.test(kv[1])));
      },
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return new Map<string, string>();
        this.links = undefined; // a read error is retried next time
        throw e;
      },
    );
    return this.links;
  }

  private serial<T>(fn: (links: Map<string, string>) => Promise<T>): Promise<T> {
    const run = this.chain.then(async () => fn(await this.load()));
    this.chain = run.catch(() => {});
    return run;
  }

  /** Writes the links with viewId → hex, then (only once it's on disk) holds it in memory. */
  private async save(links: Map<string, string>, viewId: string, hex: string): Promise<void> {
    const next = new Map(links).set(viewId, hex);
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(Object.fromEntries(next), null, 2));
    await rename(tmp, this.file);
    links.set(viewId, hex);
  }
}
