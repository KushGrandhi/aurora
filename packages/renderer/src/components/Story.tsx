import { useEffect, useRef, useState } from "react";
import type { ViewItem } from "@aurora/spec";
import { shouldGlow } from "../motion.tsx";
import { useFocus } from "../focus.tsx";
import type { SectionProps } from "./Section.tsx";
import { itemProblem } from "./Section.tsx";
import { ItemFrame } from "./ItemFrame.tsx";

type Step = ViewItem & { story?: { focus?: string; state?: unknown } };

/**
 * A guided story: the first item stays pinned while the other items scroll past as steps. The step in the middle of
 * the screen is the active one: its `story.focus` lights a value up across the view and its `story.state` reaches the
 * pinned visual (a design hears it as aurora.story). Scrolling is the explanation.
 */
export function Story({ section, version, problems, ctxFor, changed }: SectionProps) {
  const [visual, ...steps] = section.items as Step[];
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const focus = useFocus();
  const setFocus = useRef(focus.set);
  setFocus.current = focus.set;
  const drives = steps.some((s) => s.story?.focus !== undefined);

  useEffect(() => {
    // A thin band across the middle of the screen: the step crossing it is the one being read.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
    }, { rootMargin: "-45% 0px -45% 0px" });
    for (const el of refs.current) if (el) io.observe(el);
    return () => io.disconnect();
  }, [steps.length]);
  useEffect(() => { if (drives) setFocus.current(steps[active]?.story?.focus ?? null); }, [active, drives]);

  if (!visual) return null;
  const story = { index: active, state: steps[active]?.story?.state ?? null };
  return (
    <div className="story">
      <div className="story-steps">
        {steps.map((item, i) => (
          <section key={item.id} ref={(el) => { refs.current[i] = el; }} data-step={i} data-item={item.id} data-type={item.c.type}
            className={`story-step${i === active ? " active" : ""}`} data-glow={shouldGlow(changed, item.id, version) ? "true" : undefined}>
            <ItemFrame item={item} version={version} changedAt={changed[item.id]} ctx={ctxFor(item, false)} problem={itemProblem(problems, item.id)} showTitle />
          </section>
        ))}
      </div>
      <div className="story-visual" data-item={visual.id} data-type={visual.c.type}>
        <ItemFrame item={visual} version={version} changedAt={changed[visual.id]} ctx={{ ...ctxFor(visual, false), story, page: { viewport: "desktop" }, openPage: undefined }} problem={itemProblem(problems, visual.id)} showTitle={false} />
      </div>
    </div>
  );
}
