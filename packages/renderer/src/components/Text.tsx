import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RenderCtx } from "../registry.tsx";
import { ProseControl } from "./ProseControl.tsx";
import { useFocus } from "../focus.tsx";
import type { Component, QueryResult } from "@aurora/spec";
import { fillPlaceholders } from "../format.ts";
import { renderMarkdown } from "../markdown.ts";

type TextC = Extract<Component, { type: "text" }>;

export function Text({ c, results, ctx }: { c: TextC; results: Record<string, QueryResult>; ctx?: RenderCtx }) {
  const html = useMemo(() => {
    const src = "md" in c ? fillPlaceholders(c.md, results) : String(results[c.doc.query]?.rows[0]?.[c.doc.field] ?? "");
    return renderMarkdown(src);
  }, [c, results]);
  const ref = useRef<HTMLDivElement>(null);
  const focus = useFocus();
  // `{{name}}` becomes an inline control for the view's param `name`: find the tokens in the drawn text, put a slot
  // there, and render the control into it.
  const [slots, setSlots] = useState<{ name: string; el: HTMLElement }[]>([]);
  useLayoutEffect(() => setSlots(ctx?.paramDefs ? mountSlots(ref.current, ctx.paramDefs) : []), [html, ctx?.paramDefs]);
  useEffect(() => highlight(ref.current, focus.value), [focus.value, html]);
  return (
    <>
      <div className="md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />
      {slots.map((s, i) => createPortal(
        <ProseControl name={s.name} def={ctx!.paramDefs![s.name]} value={ctx!.params?.[s.name]} options={ctx!.paramOptions?.[s.name] ?? []} onChange={(v) => ctx!.setParam?.(s.name, v)} />,
        s.el, `${s.name}:${i}`))}
    </>
  );
}

function mountSlots(root: HTMLElement | null, defs: Record<string, unknown>): { name: string; el: HTMLElement }[] {
  if (!root) return [];
  // Slots already in the text (the view changed but this text didn't, so React kept its DOM): keep them, or the
  // controls would vanish, since their `{{name}}` tokens were replaced the first time.
  const out: { name: string; el: HTMLElement }[] = [...root.querySelectorAll<HTMLElement>(".prose-slot")]
    .filter((el) => (el.dataset.name ?? "") in defs).map((el) => ({ name: el.dataset.name!, el }));
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\{\{[A-Za-z_]\w*\}\}/.test(n.textContent ?? "")) nodes.push(n as Text);
  for (const node of nodes) {
    const parts = (node.textContent ?? "").split(/(\{\{[A-Za-z_]\w*\}\})/);
    const frag = document.createDocumentFragment();
    for (const part of parts) {
      const m = part.match(/^\{\{([A-Za-z_]\w*)\}\}$/);
      if (m && m[1] in defs) {
        const el = document.createElement("span");
        el.className = "prose-slot";
        el.dataset.name = m[1];
        frag.append(el);
        out.push({ name: m[1], el });
      } else frag.append(part);
    }
    node.replaceWith(frag);
  }
  return out;
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
