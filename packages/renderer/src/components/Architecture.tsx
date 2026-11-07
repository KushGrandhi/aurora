import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Architecture as ArchC } from "@aurora/spec";
import { edgeKey, layoutArchitecture, type ArchLayout } from "../engines/elk.ts";
import { SPRING, STAGGER_S } from "../motion.tsx";
import type { RenderCtx } from "../registry.tsx";
import { ARCH_ICONS, DEFAULT_ICON } from "./archIcons.ts";

const R = 8; // corner radius on routed edges

/** Orthogonal polyline with rounded corners. */
function roundedPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    const r = Math.min(R, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const ax = x - Math.sign(x - px) * r, ay = y - Math.sign(y - py) * r;
    const bx = x + Math.sign(nx - x) * r, by = y + Math.sign(ny - y) * r;
    d += `L${ax},${ay}Q${x},${y} ${bx},${by}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + `L${lx},${ly}`;
}

const clip = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

/** A system picture: ELK lays it out, React draws it, Motion moves nodes to their new places on every patch. */
export default function Architecture({ c, ctx }: { c: ArchC; ctx: RenderCtx }) {
  const [layout, setLayout] = useState<ArchLayout>();
  const [hover, setHover] = useState<string>();
  const known = useRef(new Set<string>());
  const uid = useRef(`arch${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    let live = true;
    layoutArchitecture(c)
      .then((l) => { if (live) setLayout(l); })
      .catch((e) => { if (live) ctx.report(false, `architecture: ${String((e as Error)?.message ?? e)}`); });
    return () => { live = false; };
  }, [c]);
  useEffect(() => {
    if (!layout) return;
    ctx.report(true);
    known.current = new Set(c.nodes.map((n) => n.id));
  }, [layout]);

  if (!layout) return <div className="skeleton" style={{ height: 220 }} />;
  const nodes = c.nodes.filter((n) => layout.nodes[n.id]);
  const fresh = nodes.filter((n) => !known.current.has(n.id)).sort((a, b) => layout.nodes[a.id].x - layout.nodes[b.id].x || layout.nodes[a.id].y - layout.nodes[b.id].y);
  const order = new Map(fresh.map((n, i) => [n.id, i]));
  const related = hover ? new Set([hover, ...c.edges.flatMap((e) => (e.from === hover ? [e.to] : e.to === hover ? [e.from] : []))]) : undefined;
  const dim = (on: boolean) => ({ opacity: related && !on ? 0.25 : 1, transition: "opacity 200ms" });
  const t = ctx.theme;

  return (
    <div className="arch">
      <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" style={{ maxWidth: layout.width }} role="img" aria-label="architecture diagram">
        <defs>
          <marker id={`${uid}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M1,1 L9,5 L1,9" fill="none" stroke={t.muted} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <filter id={`${uid}-shadow`} x="-20%" y="-20%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000" floodOpacity={ctx.mode === "dark" ? 0.35 : 0.07} />
          </filter>
        </defs>

        {(c.groups ?? []).filter((g) => layout.groups[g.id]).map((g) => {
          const b = layout.groups[g.id];
          return (
            <motion.g key={g.id} className="arch-group" initial={{ opacity: 0 }} animate={{ opacity: related ? 0.6 : 1 }} transition={SPRING}>
              <motion.rect initial={false} animate={{ x: b.x, y: b.y, width: b.w, height: b.h }} transition={SPRING} rx={16} fill={ctx.mode === "dark" ? "rgba(255,255,255,0.02)" : "rgba(11,11,11,0.015)"} stroke={t.axis} strokeDasharray="5 5" />
              <motion.text initial={false} animate={{ x: b.x + 16, y: b.y + 23 }} transition={SPRING} className="arch-group-label" fill={t.ink2}>{g.label}</motion.text>
            </motion.g>
          );
        })}

        {c.edges.map((e, i) => {
          const k = edgeKey(e, i);
          const g = layout.edges[k];
          if (!g) return null;
          const d = roundedPath(g.points);
          const on = !related || (related.has(e.from) && related.has(e.to) && (e.from === hover || e.to === hover));
          return (
            <g key={k} className="arch-edge" style={dim(on)}>
              <motion.path
                d={d}
                style={{ d: `path("${d}")` } as never}
                fill="none" stroke={t.muted} strokeWidth={1.5} markerEnd={`url(#${uid}-arrow)`}
                strokeDasharray={e.style === "dashed" ? "6 5" : e.style === "dotted" ? "1.5 4" : undefined}
                strokeLinecap="round"
                initial={e.style ? { opacity: 0 } : { pathLength: 0 }}
                animate={e.style ? { opacity: 1 } : { pathLength: 1 }}
                transition={{ duration: ctx.motion.reduced ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
              />
              {e.flow && <path className="flow" d={d} style={{ d: `path("${d}")` } as never} fill="none" stroke={t.categorical[0]} strokeWidth={2} strokeDasharray="3 13" strokeLinecap="round" />}
              {e.label && g.label && (
                <g transform={`translate(${g.label[0]},${g.label[1]})`} className="arch-edge-label">
                  <rect x={-(e.label.length * 6.4 + 12) / 2} y={-10} width={e.label.length * 6.4 + 12} height={20} rx={10} fill={t.surface} stroke={t.hair} />
                  <text textAnchor="middle" dy="0.35em" fill={t.ink2}>{e.label}</text>
                </g>
              )}
            </g>
          );
        })}

        <AnimatePresence>
          {nodes.map((n) => {
            const b = layout.nodes[n.id];
            const Icon = (n.kind && ARCH_ICONS[n.kind]) || DEFAULT_ICON;
            const isNew = order.has(n.id);
            const maxChars = Math.floor((b.w - 66) / 7.3);
            return (
              <motion.g
                key={n.id}
                data-node={n.id}
                className="arch-node"
                initial={{ x: b.x, y: b.y, opacity: 0, scale: 0.9 }}
                animate={{ x: b.x, y: b.y, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ ...SPRING, delay: isNew ? order.get(n.id)! * STAGGER_S : 0 }}
                style={{ transformBox: "fill-box", transformOrigin: "center", ...dim(!related || related.has(n.id)) }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(undefined)}
              >
                <rect width={b.w} height={b.h} rx={14} fill={t.stage.raised} stroke={t.hair} filter={`url(#${uid}-shadow)`} />
                <rect x={12} y={(b.h - 32) / 2} width={32} height={32} rx={9} fill={t.categorical[0]} fillOpacity={0.12} />
                <Icon x={18} y={(b.h - 20) / 2} width={20} height={20} color={t.categorical[0]} strokeWidth={1.9} />
                <text x={54} y={n.note ? b.h / 2 - 3 : b.h / 2} dy={n.note ? 0 : "0.35em"} className="arch-label" fill={t.ink}>{clip(n.label, maxChars)}</text>
                {n.note && <text x={54} y={b.h / 2 + 15} className="arch-note" fill={t.ink2}>{clip(n.note, maxChars + 2)}</text>}
                <title>{n.note ? `${n.label} — ${n.note}` : n.label}</title>
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>
    </div>
  );
}
