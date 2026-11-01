import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { Code as CodeC } from "@aurora/spec";
import { diffLineKind, highlight } from "../engines/highlight.ts";
import type { RenderCtx } from "../registry.tsx";

const COLLAPSE_AT = 40;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
const plain = (code: string) => `<pre class="shiki plain"><code>${code.split("\n").map((l) => `<span class="line">${esc(l)}</span>`).join("\n")}</code></pre>`;

/** Highlighted code or diff with line numbers, highlighted lines, a copy button and a collapse for long excerpts. */
export default function Code({ c, ctx }: { c: CodeC; ctx: RenderCtx }) {
  const [html, setHtml] = useState<string>();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const lines = c.code.split("\n");

  useEffect(() => {
    let live = true;
    highlight(c.code, c.diff ? "diff" : c.lang, ctx.mode)
      .catch(() => plain(c.code)) // the engine failed to load: the code is still readable
      .then((h) => { if (live) setHtml(h); });
    return () => { live = false; };
  }, [c.code, c.lang, c.diff, ctx.mode]);

  // Mark highlighted and diff lines on the engine's output, then report.
  useLayoutEffect(() => {
    if (!html || !body.current) return;
    const marks = new Set(c.highlight ?? []);
    body.current.querySelectorAll(".line").forEach((el, i) => {
      if (marks.has(i + 1)) el.classList.add("hl");
      if (c.diff) el.classList.add(diffLineKind(lines[i] ?? ""));
    });
    ctx.report(true);
  }, [html]);

  const copy = () => {
    void navigator.clipboard?.writeText(c.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };
  const long = lines.length > COLLAPSE_AT;

  return (
    <div className={`code${c.diff ? " diff" : ""}${long && !open ? " collapsed" : ""}`}>
      <div className="code-head">
        <span className="code-name">{c.filename ?? c.lang ?? (c.diff ? "diff" : "code")}</span>
        <button className="copy" onClick={copy} aria-label="Copy code">{copied ? <Check size={14} /> : <Copy size={14} />}<span>{copied ? "Copied" : "Copy"}</span></button>
      </div>
      {html ? <div ref={body} className="code-body" style={long && !open ? { maxHeight: `${COLLAPSE_AT * 1.6}em` } : undefined} dangerouslySetInnerHTML={{ __html: html }} /> : <div className="skeleton" />}
      {long && <button className="expand" onClick={() => setOpen((o) => !o)}>{open ? "Show less" : `Show all ${lines.length} lines`}</button>}
    </div>
  );
}
