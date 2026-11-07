import { useEffect, useMemo, useRef } from "react";
import { useFocus } from "../focus.tsx";
import type { Component, QueryResult } from "@aurora/spec";
import { fillPlaceholders } from "../format.ts";
import { renderMarkdown } from "../markdown.ts";

type TextC = Extract<Component, { type: "text" }>;

export function Text({ c, results }: { c: TextC; results: Record<string, QueryResult> }) {
  const html = useMemo(() => {
    const src = "md" in c ? fillPlaceholders(c.md, results) : String(results[c.doc.query]?.rows[0]?.[c.doc.field] ?? "");
    return renderMarkdown(src);
  }, [c, results]);
  const ref = useRef<HTMLDivElement>(null);
  const focus = useFocus();
  useEffect(() => highlight(ref.current, focus.value), [focus.value, html]);
  return <div className="md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Every text item adds its matches to one shared highlight, named "aurora-focus" (styled in CSS: no DOM changes).
const mine = new WeakMap<HTMLElement, Range[]>();
function highlight(el: HTMLElement | null, value: string | null) {
  const reg = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;
  const H = (window as unknown as { Highlight?: new () => Set<Range> }).Highlight;
  if (!el || !reg || !H) return;
  const set = reg.get("aurora-focus") ?? new H();
  reg.set("aurora-focus", set);
  for (const r of mine.get(el) ?? []) set.delete(r);
  const ranges: Range[] = [];
  if (value) {
    const re = new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const m of (n.textContent ?? "").matchAll(re)) {
        const r = new Range();
        r.setStart(n, m.index!);
        r.setEnd(n, m.index! + m[0].length);
        ranges.push(r);
        set.add(r);
      }
    }
  }
  mine.set(el, ranges);
}
