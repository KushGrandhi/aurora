import { useEffect, useMemo, useRef } from "react";
import type { Graph as GraphC } from "@genui/spec";
import { cytoscapeEngine, graphData, groupLegend } from "../engines/graph.ts";
import type { RenderCtx } from "../registry.tsx";

/** An interactive network: zoom, pan, hover to see a node's neighbourhood. */
export default function Graph({ c, ctx }: { c: GraphC; ctx: RenderCtx }) {
  const box = useRef<HTMLDivElement>(null);
  const inst = useRef<ReturnType<typeof cytoscapeEngine.mount>>();
  const data = useMemo(() => graphData(c, ctx.results), [c, ctx.results]);
  const key = JSON.stringify(data);
  const reported = useRef(false);

  // (Re)mount when the look changes; data changes go through update so unchanged nodes stay put.
  useEffect(() => {
    if (!box.current) return;
    const el = box.current;
    reported.current = false;
    inst.current = cytoscapeEngine.mount(el, data, {
      layout: c.layout ?? "force",
      theme: ctx.theme,
      reduced: ctx.motion.reduced,
      onReady: () => { if (!reported.current) { reported.current = true; ctx.report(true); } },
      onPositions: (p) => { el.dataset.positions = JSON.stringify(p); },
    });
    return () => { inst.current?.destroy(); inst.current = undefined; };
  }, [ctx.theme, c.layout, ctx.motion.reduced]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    inst.current?.update(data);
    ctx.report(true);
  }, [key]);

  const legend = groupLegend(data, ctx.theme);
  return (
    <div className="graph">
      <div ref={box} className="graph-canvas" role="img" aria-label={`network of ${data.nodes.length} nodes and ${data.edges.length} links`} />
      {legend.length >= 2 && (
        <div className="legend">{legend.map((l) => <span key={l.label} className="chip"><i style={{ background: l.color }} />{l.label}</span>)}</div>
      )}
    </div>
  );
}
