#!/usr/bin/env -S npx tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeProvider, type DataInput } from "@aurora/engine";
import { loadConfig, providerFromConfig } from "./config.ts";
import { loadHostedConfig } from "./hosted/config.ts";
import { linkCommand } from "./hosted/linkCli.ts";
import { fakeSalesDoc } from "./fakeDoc.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { runMcp } from "./mcp.ts";
import { generateSkillFiles } from "./skill.ts";
import { startServer } from "./server.ts";

const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../renderer/dist");
const USAGE = `usage:
  aurora serve                 start the shared server and screen
  aurora mcp                   MCP server over stdio (starts the shared server if needed; watches ./.aurora/views)
  aurora watch <dir>           stream views from <dir>/.aurora/views/*.ndjson
  aurora skill [--out <dir>]   write the skill folder (default ~/.claude/skills/aurora)
  aurora gallery               show every component on the screen
  aurora render <path | name=path>... [--intent "what you want to see"]
  aurora link new --name <n> [--workspace <id>]   hosted: a secret MCP URL for Claude.ai / ChatGPT (no auth)
  aurora link list | aurora link revoke <n>       hosted: list or revoke links (uses AURORA_DATA_DIR)`;

async function serve() {
  const cfg = loadConfig();
  const provider = process.env.AURORA_FAKE_PROVIDER === "1"
    ? createFakeProvider(fakeSalesDoc, { chunkSize: 24, delayMs: 5 })
    : providerFromConfig(cfg);
  const hosted = loadHostedConfig(process.env); // AURORA_MODE=hosted; throws when a required variable is missing
  const openBrowser = hosted || process.env.AURORA_NO_OPEN === "1" ? () => {} : undefined;
  const srv = await startServer({ port: cfg.port, provider, staticDir: STATIC_DIR, openBrowser, hosted, viewsDir: process.env.AURORA_VIEWS_DIR || undefined, fontsDir: process.env.AURORA_FONTS_DIR || undefined, shotsDir: process.env.AURORA_SHOTS_DIR || undefined, fontsOffline: cfg.fonts === "offline" || process.env.AURORA_FONTS_OFFLINE === "1" });
  console.log(hosted ? `aurora hosted: listening on port ${new URL(srv.url).port}, public at ${hosted.publicUrl}` : `aurora screen: ${srv.url}  (provider ${provider.name})`);
  return srv;
}

function parseInputs(args: string[]): DataInput | Record<string, DataInput> {
  const abs = (p: string) => (/^https?:\/\//.test(p) ? p : path.resolve(p));
  const named = args.filter((a) => /^[A-Za-z_]\w*=/.test(a));
  if (named.length === 0 && args.length === 1) return abs(args[0]);
  return Object.fromEntries(args.map((a, i) => {
    const eq = a.indexOf("=");
    return /^[A-Za-z_]\w*=/.test(a) ? [a.slice(0, eq), abs(a.slice(eq + 1))] : [`data${i + 1}`, abs(a)];
  }));
}

async function render(argv: string[]) {
  const i = argv.indexOf("--intent");
  const intent = i >= 0 ? argv[i + 1] : undefined;
  const inputs = argv.filter((_, k) => i < 0 || (k !== i && k !== i + 1));
  if (inputs.length === 0) throw new Error(USAGE);
  const cfg = loadConfig();
  const base = `http://localhost:${cfg.port}`;
  let ownServer = false;
  try {
    await fetch(`${base}/api/health`);
  } catch {
    await serve();
    ownServer = true;
  }
  const res = await fetch(`${base}/api/render`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: parseInputs(inputs), intent }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  console.log(body.url);
  if (ownServer) console.log("server running in this process; Ctrl-C to stop");
}

async function watchDir(dir: string | undefined) {
  if (!dir) throw new Error(USAGE);
  const res = await fetch(`http://localhost:${loadConfig().port}/api/watch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dir: path.resolve(dir) }),
  }).catch(() => {
    throw new Error("aurora server is not running; start it with `aurora serve`");
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  console.log(`watching: ${body.watching.join(", ")}`);
}

async function gallery() {
  const res = await fetch(`http://localhost:${loadConfig().port}/api/gallery`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {
    throw new Error("aurora server is not running; start it with `aurora serve`");
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  console.log(body.url);
}

async function writeSkill(argv: string[]) {
  const i = argv.indexOf("--out");
  // --out names the skill folder; a path ending in SKILL.md (the old form) means its folder.
  const given = i >= 0 && argv[i + 1] ? path.resolve(argv[i + 1]) : path.join(homedir(), ".claude", "skills", "aurora");
  const dir = path.basename(given) === "SKILL.md" ? path.dirname(given) : given;
  for (const [rel, text] of Object.entries(generateSkillFiles())) {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
  }
  console.log(`wrote ${dir}`);
}

// A backstop: a promise nobody awaited must not take the server down. Only the error is logged, never a request.
process.on("unhandledRejection", (e) => {
  console.error("aurora: unhandled rejection:", e instanceof Error ? (e.stack ?? e.message) : String(e));
});

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "serve") await serve();
  else if (cmd === "render") await render(rest);
  else if (cmd === "mcp") await runMcp({ baseUrl: `http://localhost:${loadConfig().port}`, cwd: process.cwd() });
  else if (cmd === "watch") await watchDir(rest[0]);
  else if (cmd === "skill") await writeSkill(rest);
  else if (cmd === "gallery") await gallery();
  else if (cmd === "link") await linkCommand(rest, process.env);
  else console.log(USAGE);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
