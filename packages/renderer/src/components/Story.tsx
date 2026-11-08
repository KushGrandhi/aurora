import { useCallback, useEffect, useRef, useState } from "react";
import { elementProgress, storyPosition, watchScroll } from "../scroll.ts";
import type { ViewItem } from "@aurora/spec";
import { shouldGlow } from "../motion.tsx";
import { useFocus } from "../focus.tsx";
import type { SectionProps } from "./Section.tsx";
import { itemProblem } from "./Section.tsx";
import { ItemFrame } from "./ItemFrame.tsx";

type Step = ViewItem & { story?: { focus?: string; state?: unknown } };

/**
 * A guided story: the first item stays pinned while the other items scroll past as steps. Where the reading line
 * falls among the steps is a continuous `position` (the screen's scroll scheduler); the step nearest it is the active
 * one: its `story.focus` lights a value up across the view and its `story.state` reaches the pinned visual (a design
 * hears it as aurora.story, and the continuous value as aurora.scroll). Scrolling is the explanation.
 */
export function Story({ section, version, problems, ctxFor, changed, viewId }: SectionProps) {
  const still = viewId.startsWith("variant");
  const [visual, ...steps] = section.items as Step[];
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const focus = useFocus();
  const setFocus = useRef(focus.set);
  setFocus.current = focus.set;
  const drives = steps.some((s) => s.story?.focus !== undefined);

  // One measure for the active step and for the pinned visual's aurora.scroll, so they always agree.
  const measure = useCallback(() => {
    const els = refs.current.slice(0, steps.length).filter((x): x is HTMLElement => !!x);
    return { progress: root.current ? elementProgress(root.current) : 0, position: storyPosition(els), count: els.length };
  }, [steps.length]);
  useEffect(() => (root.current ? watchScroll(root.current, (v) => setActive(v.index), measure) : undefined), [measure]);
  useEffect(() => { if (drives) setFocus.current(steps[active]?.story?.focus ?? null); }, [active, drives]);

  if (!visual) return null;
  const story = { index: active, state: steps[active]?.story?.state ?? null };
  // behind: the visual fills the screen and the steps pass over it on cards (the default for a design: text over a
  // chart or diagram would hide it, so those sit beside); side: two columns; split: half and half. A preview (the
  // variants overlay) is a still picture: stacked.
  const isDesign = visual.c.type === "design" || visual.c.type === "custom";
  const variant = still ? "side" : section.variant ?? (isDesign ? "behind" : "side");
  const side = section.steps ?? "left";
  const visualCtx = variant === "behind"
    // A stage behind the steps: the design is told it is a hero, and which side to keep clear for them.
    ? { ...ctxFor(visual, false), story, scrollMeasure: measure, bleed: true, clear: side, openPage: undefined }
    : { ...ctxFor(visual, false), story, scrollMeasure: measure, page: { viewport: "desktop" as const }, openPage: undefined };
  return (
    <div className={`story story-${variant} steps-${side}`} ref={root}>
      <div className="story-steps">
        {steps.map((item, i) => (
          <section key={item.id} ref={(el) => { refs.current[i] = el; }} data-step={i} data-item={item.id} data-type={item.c.type}
            className={`story-step${i === active ? " active" : ""}`} data-glow={shouldGlow(changed, item.id, version) ? "true" : undefined}>
            <ItemFrame item={item} version={version} changedAt={changed[item.id]} ctx={ctxFor(item, false)} problem={itemProblem(problems, item.id)} showTitle />
          </section>
        ))}
      </div>
      <div className="story-visual" data-item={visual.id} data-type={visual.c.type}>
        <ItemFrame item={visual} version={version} changedAt={changed[visual.id]} ctx={visualCtx} problem={itemProblem(problems, visual.id)} showTitle={false} />
      </div>
    </div>
  );
}
