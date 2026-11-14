import { createHash, randomBytes } from "node:crypto";
import { readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { isWorkspaceId } from "./keys.ts";

/**
 * Personal MCP links: `POST /mcp/<secret>` acts as the workspace the secret names, for clients that can't send an
 * Authorization header (Claude.ai and ChatGPT connectors offer only OAuth or no auth). A deliberate exception to
 * "keys never in a URL": the link is shown once, stored only as a sha256 hash, and revoked by deleting its entry.
 */
export type Link = { name: string; ws: string; hash: string; created: string };

export const LINK_NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
/** 32 random bytes in base64url: exactly 43 chars of [A-Za-z0-9_-]. */
export const SECRET_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");
export const newSecret = () => randomBytes(32).toString("base64url");
export const linksFile = (dataDir: string) => path.join(dataDir, "links.json");

export async function readLinks(dataDir: string): Promise<Link[]> {
  let raw: string;
  try {
    raw = await readFile(linksFile(dataDir), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const list = JSON.parse(raw) as unknown;
  if (!Array.isArray(list)) throw new Error("links.json must be a list");
  return list.filter((l): l is Link => !!l && typeof l.hash === "string" && /^[0-9a-f]{64}$/.test(l.hash) && isWorkspaceId(l.ws) && typeof l.name === "string");
}

/** Atomic: written to a temp file beside it, then renamed over it, so the server never reads half a file. */
export async function writeLinks(dataDir: string, links: Link[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${linksFile(dataDir)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(links, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, linksFile(dataDir));
}

/** Server side: secret → workspace, reloaded whenever links.json changes, so new and revoked links apply at once. */
export class LinkTable {
  private byHash = new Map<string, Link>();
  private stamp = "";
  private badStamp = "";
  constructor(private dataDir: string) {}

  async resolve(secret: string): Promise<string | null> {
    if (!SECRET_SHAPE.test(secret)) return null;
    await this.refresh();
    return this.byHash.get(hashSecret(secret))?.ws ?? null;
  }

  private async refresh(): Promise<void> {
    const st = await stat(linksFile(this.dataDir)).catch(() => null);
    const stamp = st ? `${st.mtimeMs}:${st.size}:${st.ino}` : "none";
    if (stamp === this.stamp) return;
    try {
      const links = await readLinks(this.dataDir);
      this.byHash = new Map(links.map((l) => [l.hash, l]));
      this.stamp = stamp;
    } catch (e) {
      // A broken file must not open anything: no links until it parses again (and keep trying).
      if (this.badStamp !== stamp) console.error("aurora: links.json unreadable, no personal links work until it is fixed:", (e as Error).message);
      this.badStamp = stamp;
      this.byHash = new Map();
      this.stamp = "";
    }
  }
}
