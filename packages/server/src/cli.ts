#!/usr/bin/env -S npx tsx
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeProvider, createOllamaProvider, type DataInput } from "@genui/engine";
import { loadConfig } from "./config.ts";
import { fakeSalesDoc } from "./fakeDoc.ts";
import { startServer } from "./server.ts";

const STATIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../renderer/dist");
const USAGE = `usage:
  genui serve
  genui render <path | name=path>... [--intent "what you want to see"]`;

async function serve() {
  const cfg = loadConfig();
  const provider = process.env.GENUI_FAKE_PROVIDER === "1"
    ? createFakeProvider(fakeSalesDoc, { chunkSize: 24, delayMs: 5 })
    : createOllamaProvider({ url: cfg.ollamaUrl, model: cfg.model });
  const openBrowser = process.env.GENUI_NO_OPEN === "1" ? () => {} : undefined;
  const srv = await startServer({ port: cfg.port, provider, staticDir: STATIC_DIR, openBrowser });
  console.log(`genui screen: ${srv.url}  (provider ${provider.name})`);
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

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "serve") await serve();
  else if (cmd === "render") await render(rest);
  else console.log(USAGE);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
