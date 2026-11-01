// Adapter for syntax highlighting. Only this file knows the engine (Shiki); it loads on first use.
import type { Highlighter } from "shiki";

const LANGS = ["ts", "tsx", "js", "json", "python", "sql", "bash", "yaml", "toml", "go", "rust", "java", "css", "html", "markdown", "diff"] as const;
const ALIASES: Record<string, string> = { typescript: "ts", javascript: "js", jsx: "tsx", py: "python", sh: "bash", shell: "bash", zsh: "bash", yml: "yaml", md: "markdown", rs: "rust", patch: "diff" };

let engine: Promise<Highlighter> | undefined;

function load(): Promise<Highlighter> {
  engine ??= import("shiki").then(({ createHighlighter }) => createHighlighter({ themes: ["github-light", "github-dark"], langs: [...LANGS] }));
  return engine;
}

/** Highlighted HTML for the code; an unknown or missing language renders as plain text. */
export async function highlight(code: string, lang: string | undefined, mode: "light" | "dark"): Promise<string> {
  const h = await load();
  const l = lang ? (ALIASES[lang.toLowerCase()] ?? lang.toLowerCase()) : "text";
  return h.codeToHtml(code, { lang: (LANGS as readonly string[]).includes(l) ? l : "text", theme: mode === "dark" ? "github-dark" : "github-light" });
}

export type DiffLineKind = "add" | "del" | "hunk" | "meta" | "ctx";

export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("diff ") || line.startsWith("index ")) return "meta";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}
