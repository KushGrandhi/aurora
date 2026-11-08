import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Item, Palette, Problem, Section as SectionT, ViewItem } from "@aurora/spec";
import { packRows } from "../layout.ts";
import { ENTER_EASE, SPRING, enterDelay, shouldGlow } from "../motion.tsx";
import type { RenderCtx, Theme } from "../registry.tsx";
import { ItemFrame } from "./ItemFrame.tsx";
import { Tabs } from "./Tabs.tsx";
import { Story } from "./Story.tsx";
import { Reel } from "./Reel.tsx";

export type SectionProps = {
  section: SectionT;
  version: number;
  problems: Problem[];
  ctxFor(item: ViewItem, hero: boolean): RenderCtx;
  heroId?: string;
  viewId: string;
  changed: Record<string, number>;
  /** This is the view's first section: its first item may be a full-width hero. */
  leads?: boolean;
  /** Position of this section in the view, for the opening stagger. */
  order?: number;
  /** Reading number of a titled section (1, 2, …): even ones sit on a band. */
  number?: number;
  /** The view's filter bar, when this is the first compact section: it stays on screen while the section does. */
  filters?: React.ReactNode;
  /** The section's own ground (its background): a stage re-derived on it, for its CSS and its items. */
  ground?: { theme: Theme; palette: Palette; vars: Record<string, string> };
};

/**
 * The static problem that makes an item a fallback card. "render failed" problems are some screen's own drawing
 * result (maybe an older build's): this screen draws the item itself and reports what happened here.
 */
export const itemProblem = (problems: Problem[], id: string) => problems.find((p) => p.itemId === id && p.severity === "error" && !p.message.startsWith("render failed: "));

const isBleed = (item: ViewItem) => (item.c.type === "design" || item.c.type === "custom") && item.c.display === "hero";

function Grid({ section, version, problems, ctxFor, heroId, viewId, changed, leads, order = 0 }: SectionProps) {
  const reduced = useReducedMotion() ?? false;
  const bleedId = leads && section.items[0] && isBleed(section.items[0]) ? section.items[0].id : undefined;
  const packed = packRows(section.items.map((i) => ({ ...i, span: i.span ?? 12 })) as Item[], section.density === "compact" ? 6 : 4) as (ViewItem & { span: number })[];
  return (
    <div className="grid">
      <AnimatePresence initial mode="popLayout">
        {packed.map((item, i) => {
          const glow = shouldGlow(changed, item.id, version);
          return (
            <motion.section key={item.id} layout layoutId={`${viewId}:${item.id}`} data-item={item.id} data-type={item.c.type}
              data-glow={glow ? "true" : undefined}
              className={item.id === bleedId ? "bleed" : `card${item.id.startsWith("d_") ? " default" : ""}`}
              style={{ gridColumn: item.id === bleedId ? "1 / -1" : `span ${item.span}` }}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.5, ease: ENTER_EASE, delay: enterDelay(order, i) } }}
              exit={{ opacity: 0, scale: 0.98, transition: SPRING }}>
              {glow && <span key={version} className="glow" aria-hidden />}
              <ItemFrame item={item} version={version} changedAt={changed[item.id]} ctx={item.id === bleedId ? { ...ctxFor(item, false), bleed: true } : ctxFor(item, item.id === heroId)} problem={itemProblem(problems, item.id)} showTitle={item.id !== bleedId} />
            </motion.section>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function Section(props: SectionProps) {
  const { section, number, ground } = props;
  const g = ground;
  // Items on a ground draw with its stage (charts, diagrams, designs), not the view's.
  const base = props.ctxFor;
  const compact = section.density === "compact";
  const ctxFor = (item: ViewItem, hero: boolean): RenderCtx => {
    const c = base(item, hero && !compact);
    return { ...c, ...(g ? { theme: g.theme, mode: g.theme.stage.mode, palette: g.palette } : {}), ...(compact ? { compact: true } : {}) };
  };
  props = { ...props, ctxFor };
  const cls = ["section", compact ? "compact" : "", number && number % 2 === 0 && !compact ? "band" : "", section.background ? `on-ground bg-${section.background}` : "", section.height === "screen" ? "screen" : ""].filter(Boolean).join(" ");
  return (
    <motion.div layout="position" className={cls} data-section={section.id} data-theme-local={g ? g.theme.stage.mode : undefined} style={g?.vars as React.CSSProperties | undefined}>
      {props.filters && <div className="section-filters">{props.filters}</div>}
      {section.title && <h2 className="section-title">{section.title}</h2>}
      {section.layout === "tabs" ? <Tabs {...props} /> : section.layout === "story" ? <Story {...props} /> : section.layout === "reel" ? <Reel {...props} /> : <Grid {...props} />}
    </motion.div>
  );
}
