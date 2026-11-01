import type { CompiledProject } from "./compile.ts";
import { IMPORT_MAP } from "./libs.ts";

export type SrcdocOpts = { origin: string; framework: "react" | "html"; mode: "light" | "dark"; data: Record<string, unknown[]>; assets: Record<string, string> };

/** No network, nothing but genui's own libraries and media: the sandbox's whole outside world. */
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

/** The frame's whole document: CSP, import map, Tailwind, the font, the project and the runtime that links it. */
export function buildSrcdoc(p: CompiledProject, o: SrcdocOpts): string {
  const imports = Object.fromEntries(Object.entries(IMPORT_MAP).map(([k, f]) => [k, `${o.origin}/lib/${f}`]));
  const project = { framework: o.framework, entry: p.entry, order: p.order, modules: p.modules, data: o.data, assets: o.assets, mode: o.mode };
  const head = [
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${attr(sandboxCsp(o.origin))}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<script type="importmap">${safeJson({ imports })}</script>`,
    `<link rel="stylesheet" href="${o.origin}/lib/fonts/inter.css">`,
    `<script src="${o.origin}/lib/tailwind.js"></script>`,
    // Tailwind's `dark:` follows genui's theme (a class on <html>), not the OS setting.
    '<style type="text/tailwindcss">@custom-variant dark (&:where(.dark, .dark *));</style>',
    "<style>html,body{margin:0}body{font-family:'Inter Variable',Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}</style>",
    ...p.css.map((c) => `<style>${c.replace(/<\/style/gi, "<\\/style")}</style>`),
    `<script type="application/json" id="genui-project">${safeJson(project)}</script>`,
    `<script type="module" src="${o.origin}/lib/runtime.js"></script>`,
  ].join("\n");
  const cls = o.mode === "dark" ? ' class="dark"' : "";

  if (o.framework === "react") return `<!doctype html>\n<html${cls}>\n<head>\n${head}\n</head>\n<body>\n<div id="root"></div>\n</body>\n</html>`;

  let html = p.html ?? "";
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${head}\n`);
  else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>\n${head}\n</head>\n`);
  else html = `<!doctype html>\n<html>\n<head>\n${head}\n</head>\n<body>\n${html}\n</body>\n</html>`;
  if (cls && /<html(?![^>]*\bclass=)[^>]*>/i.test(html)) html = html.replace(/<html/i, `<html${cls}`);
  return html;
}
