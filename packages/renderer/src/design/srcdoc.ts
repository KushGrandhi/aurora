import type { CompiledProject } from "./compile.ts";
import { auroraBootstrap } from "./bootstrap.ts";
import { IMPORT_MAP } from "./libs.ts";
import { TOKEN_CSS, TOKEN_THEME } from "./tokens.ts";

export type SrcdocOpts = { origin: string; framework: "react" | "html"; mode: "light" | "dark"; data: Record<string, unknown[]>; assets: Record<string, string>; display?: "card" | "page" | "hero"; palette?: { accent?: string; series?: string[] }; params?: Record<string, unknown>; story?: { index: number; state: unknown } | null };

/** No network, nothing but aurora's own libraries and media: the sandbox's whole outside world. */
export function sandboxCsp(origin: string): string {
  const lib = `${origin}/lib/`;
  const media = `${origin}/media/`;
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' 'unsafe-eval' blob: ${lib}`,
    `style-src 'unsafe-inline' ${lib}`,
    `font-src ${lib} data:`,
    `img-src ${media} data: blob:`,
    `media-src ${media} data: blob:`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
    "worker-src blob:",
  ].join("; ");
}

// JSON inside a <script> must not contain "</script>" (or any "<"), or the author's text could end it.
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

const HEX = /^#[0-9a-fA-F]{6}$/;
const paletteCss = (p: { accent?: string; series?: string[] }) =>
  [...(p.accent && HEX.test(p.accent) ? [`--accent: ${p.accent};`] : []), ...(p.series ?? []).filter((c) => HEX.test(c)).map((c, i) => `--s${i + 1}: ${c};`)].join(" ");

/** The frame's whole document: CSP, import map, Tailwind, the font, the project and the runtime that links it. */
export function buildSrcdoc(p: CompiledProject, o: SrcdocOpts): string {
  const imports = Object.fromEntries(Object.entries(IMPORT_MAP).map(([k, f]) => [k, `${o.origin}/lib/${f}`]));
  const project = { framework: o.framework, entry: p.entry, order: p.order, modules: p.modules, data: o.data, assets: o.assets, mode: o.mode, display: o.display ?? "card", params: o.params ?? {}, story: o.story ?? null };
  const head = [
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${attr(sandboxCsp(o.origin))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<script type="importmap">${safeJson({ imports })}</script>`,
    `<link rel="stylesheet" href="${o.origin}/lib/fonts/aurora.css">`,
    `<script type="application/json" id="aurora-project">${safeJson(project)}</script>`,
    `<script id="aurora-bootstrap">(${String(auroraBootstrap).replace(/<\/script/gi, "<\\/script")})()</script>`,
    `<script src="${o.origin}/lib/tailwind.js"></script>`,
    // Tailwind's `dark:` follows aurora's theme (a class on <html>), not the OS setting.
    `<style id="aurora-tokens">${TOKEN_CSS}</style>`,
    // The view's own palette overrides the accent and series colours in both themes.
    ...(o.palette ? [`<style id="aurora-palette">:root, .dark { ${paletteCss(o.palette)} }</style>`] : []),
    `<style type="text/tailwindcss">@custom-variant dark (&:where(.dark, .dark *));\n${TOKEN_THEME}</style>`,
    "<style>html,body{margin:0}body{font-family:'Hanken Grotesk Variable','Hanken Grotesk',system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style>",
    ...p.css.map((c) => `<style>${c.replace(/<\/style/gi, "<\\/style")}</style>`),
    `<script type="module" src="${o.origin}/lib/runtime.js"></script>`,
  ].join("\n");
  const cls = o.mode === "dark" ? ' class="dark"' : "";

  const open = `<!doctype html>\n<html${cls}>\n<head>\n${head}\n</head>\n<body>\n`;
  if (o.framework === "react") return `${open}<div id="root"></div>\n</body>\n</html>`;
  // aurora's head always comes first, so its CSP and bootstrap precede every byte of the author's markup (a CSP <meta>
  // outside the real <head>, or after a script, is ignored). The author's own <html>, <head> and <body> tags then
  // merge into the open document the way a browser handles any repeated tag; their contents still apply.
  return open + (p.html ?? "").replace(/^\s*<!doctype[^>]*>/i, "");
}
