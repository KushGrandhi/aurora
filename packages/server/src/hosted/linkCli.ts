import { stat } from "node:fs/promises";
import path from "node:path";
import { isWorkspaceId, newWorkspaceId } from "./keys.ts";
import { hashSecret, LINK_NAME, newSecret, readLinks, writeLinks, type Link } from "./links.ts";

/** `aurora link new`: a link to `ws` (a fresh workspace when left out). The secret exists only in the returned URL. */
export async function newLink(dataDir: string, publicUrl: string, name: string, ws?: string): Promise<{ url: string; link: Link }> {
  if (!LINK_NAME.test(name)) throw new Error("a link name is 1-32 chars of a-z, 0-9, _ and -, starting with a letter or digit");
  if (ws !== undefined && !isWorkspaceId(ws)) throw new Error("not a workspace id (16 chars of a-z and 0-9)");
  // A typo must not quietly start a new, empty workspace.
  if (ws !== undefined && !(await stat(path.join(dataDir, "ws", ws)).then((s) => s.isDirectory(), () => false))) throw new Error(`no workspace ${ws} on this server`);
  const links = await readLinks(dataDir);
  if (links.some((l) => l.name === name)) throw new Error(`a link named ${name} already exists (revoke it first)`);
  const secret = newSecret();
  const link: Link = { name, ws: ws ?? newWorkspaceId(), hash: hashSecret(secret), created: new Date().toISOString() };
  await writeLinks(dataDir, [...links, link]);
  return { url: `${publicUrl.replace(/\/+$/, "")}/mcp/${secret}`, link };
}

/** `aurora link list`: never the secrets (they aren't stored). */
export async function listLinks(dataDir: string): Promise<Omit<Link, "hash">[]> {
  return (await readLinks(dataDir)).map(({ name, ws, created }) => ({ name, ws, created }));
}

/** `aurora link revoke`: the link stops working at once; the workspace and its pages stay. */
export async function revokeLink(dataDir: string, name: string): Promise<void> {
  const links = await readLinks(dataDir);
  if (!links.some((l) => l.name === name)) throw new Error(`no link named ${name}`);
  await writeLinks(dataDir, links.filter((l) => l.name !== name));
}

export async function linkCommand(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const dataDir = env.AURORA_DATA_DIR || "/data";
  const [sub, ...args] = argv;
  const flag = (f: string) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (sub === "new") {
    const publicUrl = env.AURORA_PUBLIC_URL;
    if (!publicUrl) throw new Error("aurora link new needs AURORA_PUBLIC_URL");
    const name = flag("--name");
    if (!name) throw new Error("usage: aurora link new --name <name> [--workspace <id>]");
    const { url, link } = await newLink(dataDir, publicUrl, name, flag("--workspace"));
    console.error(`link ${link.name} → workspace ${link.ws}. Paste this URL as the MCP server (no authentication); it is not shown again:`);
    console.log(url);
  } else if (sub === "list") {
    const all = await listLinks(dataDir);
    if (!all.length) console.log("no links");
    for (const l of all) console.log(`${l.name}\t${l.ws}\t${l.created}`);
  } else if (sub === "revoke" && args[0]) {
    await revokeLink(dataDir, args[0]);
    console.log(`revoked ${args[0]}`);
  } else {
    throw new Error("usage: aurora link new --name <name> [--workspace <id>] | aurora link list | aurora link revoke <name>");
  }
}
