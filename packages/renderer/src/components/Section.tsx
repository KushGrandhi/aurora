import { AnimatePresence, motion } from "motion/react";
import type { Item, Problem, Section as SectionT, ViewItem } from "@genui/spec";
import { packRows } from "../layout.ts";
import { SPRING, SPRING_SOFT, STAGGER_S, shouldGlow } from "../motion.tsx";
import type { RenderCtx } from "../registry.tsx";
import { ItemFrame } from "./ItemFrame.tsx";
import { Tabs } from "./Tabs.tsx";

export type SectionProps = {
  section: SectionT;
  version: number;
  problems: Problem[];
  ctxFor(item: ViewItem, hero: boolean): RenderCtx;
  heroId?: string;
  viewId: string;
  changed: Record<string, number>;
};

export const itemProblem = (problems: Problem[], id: string) => problems.find((p) => p.itemId === id && p.severity === "error");

function Grid({ section, version, problems, ctxFor, heroId, viewId, changed }: SectionProps) {
  const packed = packRows(section.items.map((i) => ({ ...i, span: i.span ?? 12 })) as Item[]) as (ViewItem & { span: number })[];
  return (
    <div className="grid">
      <AnimatePresence initial mode="popLayout">
        {packed.map((item, i) => {
          const glow = shouldGlow(changed, item.id, version);
          return (
            <motion.section key={item.id} layout layoutId={`${viewId}:${item.id}`} data-item={item.id} data-type={item.c.type}
              data-glow={glow ? "true" : undefined}
              className={`card${item.id.startsWith("d_") ? " default" : ""}`}
              style={{ gridColumn: `span ${item.span}` }}
              initial={{ opacity: 0, y: 12, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { ...SPRING_SOFT, delay: Math.min(i, 10) * STAGGER_S } }}
              exit={{ opacity: 0, scale: 0.98, transition: SPRING }}>
              {glow && <span key={version} className="glow" aria-hidden />}
              <ItemFrame item={item} version={version} ctx={ctxFor(item, item.id === heroId)} problem={itemProblem(problems, item.id)} showTitle />
            </motion.section>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Section(props: SectionProps) {
  const { section } = props;
  return (
    <motion.div layout="position" className="section" data-section={section.id}>
      {section.title && <h2 className="section-title">{section.title}</h2>}
      {section.layout === "tabs" ? <Tabs {...props} /> : <Grid {...props} />}
    </motion.div>
  );
}
