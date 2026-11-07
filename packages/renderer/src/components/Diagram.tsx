import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Diagram as DiagramC } from "@aurora/spec";
import { mermaidEngine } from "../engines/mermaid.ts";
import type { RenderCtx } from "../registry.tsx";
import { FallbackCard } from "./FallbackCard.tsx";

let seq = 0;
const NODES = ".node, .actor, .cluster, .statediagram-state, .note";
const EDGES = ".flowchart-link, .edgePath path, .transition, .messageLine0, .messageLine1, .relation";

/** A key for an element that survives re-renders (Mermaid prefixes ids with the render id). */
function keyOf(el: Element, renderId: string): string {
  return el.getAttribute("data-id") ?? (el.id ? el.id.replace(renderId, "") : `${el.getAttribute("class")}|${el.textContent?.trim()}`);
}

/** Mermaid source rendered as inline SVG; on update only new nodes and edges animate in. */
export default function Diagram({ c, ctx }: { c: DiagramC; ctx: RenderCtx }) {
  const [out, setOut] = useState<{ svg: string; id: string } | { error: string }>();
  const box = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>();

  useEffect(() => {
    let live = true;
    const id = `mmd${++seq}`;
    void mermaidEngine.render(id, c.source, ctx.theme.stage).then((r) => {
      if (!live) return;
      setOut("svg" in r ? { svg: r.svg, id } : r);
      if ("error" in r) ctx.report(false, `mermaid: ${r.error}`);
    });
    return () => { live = false; };
  }, [c.source, ctx.theme.stage]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !out || !("svg" in out)) return;
    el.innerHTML = out.svg;
    const before = seen.current;
    const now = new Set<string>();
    let i = 0;
    el.querySelectorAll(NODES).forEach((n) => {
      const k = keyOf(n, out.id);
      now.add(k);
      if (before?.has(k)) return;
      n.classList.add("enter");
      (n as SVGElement).style.animationDelay = `${i++ * 30}ms`;
    });
    el.querySelectorAll(EDGES).forEach((p) => {
      const k = "e:" + keyOf(p, out.id);
      now.add(k);
      if (before?.has(k) || !(p instanceof SVGGeometryElement)) return;
      const len = p.getTotalLength();
      if (!len) return;
      p.style.setProperty("--len", String(len));
      p.classList.add("draw");
      p.style.animationDelay = `${Math.min(i, 20) * 30}ms`;
    });
    seen.current = now;
    ctx.report(true);
  }, [out]);

  if (out && "error" in out) return <FallbackCard reason={`mermaid: ${out.error}`} />;
  return (
    <figure className="diagram">
      {!out && <div className="skeleton" />}
      <div ref={box} className="diagram-svg" />
      {c.caption && <figcaption>{c.caption}</figcaption>}
    </figure>
  );
}
