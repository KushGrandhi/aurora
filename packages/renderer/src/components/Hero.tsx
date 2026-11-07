import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { Problem, ViewItem } from "@aurora/spec";
import { ENTER_EASE, shouldGlow } from "../motion.tsx";
import type { RenderCtx } from "../registry.tsx";
import { ItemFrame } from "./ItemFrame.tsx";
import { itemProblem } from "./Section.tsx";

/**
 * Immersive hero: the view's leading design fills the first screen edge to edge, and the view's own title, summary,
 * filters and versions sit on it as large type instead of a header above it. As the reader scrolls into the
 * sections, the stage eases back and dims.
 */
export function Hero({ item, version, ctx, problems, changed, title, summary, status, filters, versions }: {
  item: ViewItem; version: number; ctx: RenderCtx; problems: Problem[]; changed: Record<string, number>;
  title: string; summary?: string; status: ReactNode; filters?: ReactNode; versions: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [1, reduced ? 1 : 0.94]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, reduced ? 1 : 0.3]);
  const glow = shouldGlow(changed, item.id, version);
  const enter = (delay: number) => reduced ? {} : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.7, delay, ease: ENTER_EASE } };
  return (
    <div ref={ref} className="hero">
      <motion.section className="hero-scene bleed" data-item={item.id} data-type={item.c.type} data-glow={glow ? "true" : undefined} style={{ scale, opacity }}>
        <ItemFrame item={item} version={version} changedAt={changed[item.id]} ctx={{ ...ctx, bleed: true }} problem={itemProblem(problems, item.id)} showTitle={false} />
      </motion.section>
      <div className="hero-head">
        <motion.div className="hero-meta" {...enter(0)}>{status}{versions}</motion.div>
        <motion.h1 {...enter(0.06)}>{title}</motion.h1>
        {summary && <motion.p className="hero-summary" {...enter(0.14)}>{summary}</motion.p>}
        {filters && <motion.div className="hero-filters" {...enter(0.22)}>{filters}</motion.div>}
      </div>
    </div>
  );
}
