// Turns a design project (files) into modules the sandbox runtime can link: Sucrase strips TypeScript and JSX,
// es-module-lexer finds imports, relative imports become `__genui__/<path>` tokens the runtime swaps for blob URLs.
import { init, parse } from "es-module-lexer";
import { transform } from "sucrase";
import { IMPORT_MAP } from "./libs.ts";

export type CompiledProject = { entry: string; modules: Record<string, { code: string }>; order: string[]; html?: string; css: string[] };
type Input = { framework: "react" | "html"; files: Record<string, string>; entry?: string };

export const DEP_TOKEN = "__genui__/";
const LIBRARIES = "react, react-dom, motion, lucide-react, three, d3, gsap";
const EXTS = [".tsx", ".ts", ".jsx", ".js"];
const SYNTHETIC_ENTRY = "__entry__.js";

class CompileError extends Error {}

const dirname = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
function join(base: string, rel: string): string {
  const out: string[] = base ? base.split("/") : [];
  for (const part of rel.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function resolve(files: Record<string, string>, from: string, spec: string): string {
  const base = join(dirname(from), spec);
  for (const c of [base, ...EXTS.map((e) => base + e), ...EXTS.map((e) => `${base}/index${e}`)]) if (c in files) return c;
  throw new CompileError(`cannot find "${spec}" imported in ${from}`);
}

function transpile(path: string, code: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  const transforms: ("typescript" | "jsx")[] = ext === ".tsx" ? ["typescript", "jsx"] : ext === ".ts" ? ["typescript"] : ["jsx"];
  try {
    return transform(code, { transforms, jsxRuntime: "automatic", production: true, filePath: path }).code;
  } catch (e) {
    const msg = String((e as Error).message);
    const loc = msg.match(/\((\d+):(\d+)\)/);
    throw new CompileError(`${path}:${loc ? `${loc[1]}:${loc[2]}` : "1:1"} ${msg.replace(/\s*\(\d+:\d+\)\s*$/, "")}`);
  }
}

/** A non-JS file as a module: CSS injects itself, JSON is data, SVG/Markdown/HTML are strings. */
function assetModule(path: string, content: string): string {
  if (path.endsWith(".css")) return `const s = document.createElement("style");\ns.textContent = ${JSON.stringify(content)};\ndocument.head.appendChild(s);\nexport default ${JSON.stringify(content)};\n`;
  if (path.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (e) {
      throw new CompileError(`${path}: invalid JSON (${(e as Error).message})`);
    }
    return `export default ${content};\n`;
  }
  return `export default ${JSON.stringify(content)};\n`;
}

/** The module's code with relative imports rewritten to tokens, plus the files it depends on. */
function compileModule(files: Record<string, string>, path: string): { code: string; deps: string[] } {
  if (!/\.(tsx|ts|jsx|js)$/.test(path)) return { code: assetModule(path, files[path]), deps: [] };
  const code = transpile(path, files[path]);
  let imports: readonly { n?: string; s: number; e: number; d: number }[];
  try {
    [imports] = parse(code);
  } catch (e) {
    throw new CompileError(`${path}: ${(e as Error).message}`);
  }
  const deps: string[] = [];
  const edits: { s: number; e: number; text: string }[] = [];
  for (const im of imports) {
    if (im.d === -2 || im.n === undefined) continue; // import.meta, or a dynamic import of a computed value
    if (im.n.startsWith("./") || im.n.startsWith("../")) {
      const dep = resolve(files, path, im.n);
      deps.push(dep);
      edits.push({ s: im.s, e: im.e, text: DEP_TOKEN + dep });
    } else if (!(im.n in IMPORT_MAP)) {
      throw new CompileError(`cannot import "${im.n}" in ${path}: available libraries are ${LIBRARIES}`);
    }
  }
  let out = code;
  for (const ed of edits.sort((a, b) => b.s - a.s)) {
    // Static imports point s..e at the specifier text; dynamic ones include the quotes.
    const quoted = out[ed.s] === "'" || out[ed.s] === '"' || out[ed.s] === "`";
    out = out.slice(0, ed.s) + (quoted ? JSON.stringify(ed.text) : ed.text) + out.slice(ed.e);
  }
  return { code: out, deps };
}

/** Dependency-first order of everything reachable from the entries; a cycle is an error naming it. */
function link(files: Record<string, string>, entries: string[]): { order: string[]; modules: CompiledProject["modules"] } {
  const modules: CompiledProject["modules"] = {};
  const order: string[] = [];
  const done = new Set<string>();
  const stack: string[] = [];
  const visit = (p: string) => {
    if (done.has(p)) return;
    if (stack.includes(p)) throw new CompileError(`circular import: ${[...stack.slice(stack.indexOf(p)), p].join(" → ")}`);
    stack.push(p);
    const m = compileModule(files, p);
    for (const d of m.deps) visit(d);
    stack.pop();
    done.add(p);
    modules[p] = { code: m.code };
    order.push(p);
  };
  for (const e of entries) visit(e);
  return { order, modules };
}

/** Pulls local `<script src>` and stylesheet links out of the entry document. */
function splitHtml(files: Record<string, string>, entry: string): { html: string; scripts: string[]; css: string[] } {
  const scripts: string[] = [];
  const css: string[] = [];
  const local = (ref: string) => !/^[a-z]+:|^\/\//i.test(ref);
  let html = files[entry].replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (all, _a, src: string) => {
    if (!local(src)) return all;
    scripts.push(resolve(files, entry, src.startsWith(".") ? src : `./${src}`));
    return "";
  });
  html = html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, (tag) => {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !local(href)) return tag;
    css.push(files[resolve(files, entry, href.startsWith(".") ? href : `./${href}`)]);
    return "";
  });
  return { html, scripts, css };
}

export async function compileProject(c: Input): Promise<CompiledProject | { error: string }> {
  await init;
  try {
    if (c.framework === "react") {
      const entry = c.entry ?? "App.tsx";
      if (!(entry in c.files)) throw new CompileError(`entry file "${entry}" is missing`);
      return { entry, ...link(c.files, [entry]), css: [] };
    }
    const doc = c.entry ?? "index.html";
    if (!(doc in c.files)) throw new CompileError(`entry file "${doc}" is missing`);
    const { html, scripts, css } = splitHtml(c.files, doc);
    if (scripts.length <= 1) return { entry: scripts[0] ?? "", ...link(c.files, scripts), html, css };
    // Several module scripts: one synthetic entry imports them in document order.
    const files = { ...c.files, [SYNTHETIC_ENTRY]: scripts.map((s) => `import "./${s}";`).join("\n") };
    return { entry: SYNTHETIC_ENTRY, ...link(files, [SYNTHETIC_ENTRY]), html, css };
  } catch (e) {
    if (e instanceof CompileError) return { error: e.message };
    throw e;
  }
}
