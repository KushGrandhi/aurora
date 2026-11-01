import { useState } from "react";
import { motion } from "motion/react";
import type { Timeline as TimelineC } from "@aurora/spec";
import { SPRING, STAGGER_S } from "../motion.tsx";
import type { RenderCtx } from "../registry.tsx";
import { timeScale } from "../timeScale.ts";
import { useWidth } from "../useWidth.ts";

type Ev = { date: string; end?: string; title: string; detail?: string; group: string };

const NARROW = 560;
const ROW = 30;
const LABEL_COL = 104;
const DAY_FMT = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const fmt = (d: string) => (isNaN(Date.parse(d)) ? d : DAY_FMT.format(new Date(d)));
const asDate = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? undefined : String(v));

function eventsOf(c: TimelineC, ctx: RenderCtx): Ev[] {
  if (c.events) return c.events.map((e) => ({ ...e, group: e.group ?? "" }));
  const q = c.query!;
  return (ctx.results[q.id]?.rows ?? []).flatMap((r) => {
    const date = asDate(r[q.date]);
    if (!date || isNaN(Date.parse(date))) return [];
    return [{ date, end: q.end ? asDate(r[q.end]) : undefined, title: String(r[q.title] ?? ""), group: q.group ? String(r[q.group] ?? "") : "" }];
  });
}

/** Lanes by group; dots for moments, rounded bars for spans. A vertical list below 560px. */
export default function Timeline({ c, ctx }: { c: TimelineC; ctx: RenderCtx }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number>();
  const events = eventsOf(c, ctx).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const groups = [...new Set(events.map((e) => e.group))];
  const labelled = groups.some((g) => g !== "");
  const color = (g: string) => ctx.theme.categorical[groups.indexOf(g) % ctx.theme.categorical.length];

  if (width > 0 && width < NARROW) {
    return (
      <div ref={ref} className="timeline list">
        {events.map((e, i) => (
          <motion.div key={i} className="tl-row" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: Math.min(i, 12) * STAGGER_S }}>
            <span className="tl-dot" style={{ background: color(e.group) }} />
            <div>
              <div className="tl-date">{fmt(e.date)}{e.end ? ` – ${fmt(e.end)}` : ""}{e.group ? ` · ${e.group}` : ""}</div>
              <div className="tl-title">{e.title}</div>
              {e.detail && <div className="tl-detail">{e.detail}</div>}
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  const plot = Math.max(0, width - (labelled ? LABEL_COL : 0) - 8);
  const scale = timeScale(events.flatMap((e) => (e.end ? [e.date, e.end] : [e.date])), plot);
  // Greedy rows inside each lane so labels don't collide.
  const placed = events.map((e) => {
    const x = scale.x(e.date);
    const x2 = e.end ? scale.x(e.end) : undefined;
    const labelW = 18 + e.title.length * 6.8;
    const flip = x2 === undefined && x + labelW > plot && x - labelW >= 0; // label left of the dot near the right edge
    return { e, x, x2, row: 0, flip, start: flip ? x - labelW : x, end: flip ? x + 6 : Math.max(x + labelW, x2 ?? 0) };
  });
  const lanes = groups.map((g) => {
    const ends: number[] = [];
    for (const p of placed.filter((p) => p.e.group === g)) {
      let row = ends.findIndex((end) => end < p.start - 6);
      if (row < 0) row = ends.length;
      ends[row] = p.end;
      p.row = row;
    }
    return { g, rows: Math.max(1, ends.length) };
  });
  const top = (g: string) => lanes.slice(0, groups.indexOf(g)).reduce((h, l) => h + l.rows * ROW + 12, 0);
  const height = lanes.reduce((h, l) => h + l.rows * ROW + 12, 0);
  const h = hover !== undefined ? placed[hover] : undefined;

  return (
    <div ref={ref} className="timeline">
      {width > 0 && (
        <div className="tl-plot" style={{ height: height + 28 }}>
          {lanes.map((l, li) => (
            <div key={l.g} className="tl-lane" style={{ top: top(l.g), height: l.rows * ROW + 12 }}>
              {labelled && <div className="tl-lane-label" style={{ width: LABEL_COL }}>{l.g || "Other"}</div>}
              {li > 0 && <div className="tl-lane-rule" />}
            </div>
          ))}
          <div className="tl-area" style={{ left: labelled ? LABEL_COL : 0, width: plot }}>
            {scale.ticks.map((t) => (
              <div key={t.at} className="tl-tick" style={{ left: t.at, height }}><span>{t.label}</span></div>
            ))}
            {placed.map((p, i) => {
              const y = top(p.e.group) + 6 + p.row * ROW;
              return (
                <motion.div
                  key={i}
                  className={`tl-event${p.x2 !== undefined ? " span" : ""}${p.flip ? " flip" : ""}`}
                  style={p.flip ? { right: plot - p.x, top: y } : { left: p.x, top: y }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...SPRING, delay: Math.min(i, 16) * STAGGER_S }}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(undefined)}
                  tabIndex={0}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(undefined)}
                >
                  {p.x2 !== undefined
                    ? <span className="tl-bar" style={{ width: Math.max(6, p.x2 - p.x), background: color(p.e.group) }} />
                    : <span className="tl-dot" style={{ background: color(p.e.group) }} />}
                  <span className="tl-label">{p.e.title}</span>
                </motion.div>
              );
            })}
            {h && (
              <div className="tl-tip" role="tooltip" style={{ left: Math.min(h.x, plot - 220), top: top(h.e.group) + 6 + h.row * ROW + ROW }}>
                <div className="tl-date">{fmt(h.e.date)}{h.e.end ? ` – ${fmt(h.e.end)}` : ""}</div>
                <div className="tl-title">{h.e.title}</div>
                {h.e.detail && <div className="tl-detail">{h.e.detail}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
