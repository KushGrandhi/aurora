import { useEffect, useRef } from "react";
import { watchScroll } from "../scroll.ts";
import type { SectionProps } from "./Section.tsx";
import { itemProblem } from "./Section.tsx";
import { ItemFrame } from "./ItemFrame.tsx";

/**
 * A reel: the section pins for a while and its items are full-screen panels that slide sideways as the reader
 * scrolls down (panel k fills the screen at k/(n-1) of the way through). On a phone it is a row to swipe, snapping
 * to each panel; with reduced motion, or in a preview, the panels simply stack.
 */
export function Reel({ section, version, problems, ctxFor, changed, viewId }: SectionProps) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const n = section.items.length;
  const still = viewId.startsWith("variant");
  // How far through the pinned stretch: 0 when the section's top reaches the top of the window, 1 when its last
  // panel has slid in (not elementProgress: the panels mustn't move while the section is still coming up).
  const range = () => (root.current ? root.current.getBoundingClientRect().height - innerHeight : 0);
  useEffect(() => {
    if (!root.current || still || n < 2) return;
    return watchScroll(root.current, (v) => {
      const t = track.current;
      if (!t) return;
      const moving = !v.reduced && innerWidth >= 860;
      t.style.transform = moving ? `translate3d(${-v.progress * (n - 1) * 100}vw, 0, 0)` : "";
    }, () => {
      const r = root.current!.getBoundingClientRect();
      const span = r.height - innerHeight;
      return { progress: span > 0 ? -r.top / span : 0, position: 0, count: 0 };
    });
  }, [n, still]);
  // Tabbing into a panel brings it on screen.
  const onFocus = (e: React.FocusEvent) => {
    if (!root.current || innerWidth < 860 || n < 2) return;
    const panel = (e.target as HTMLElement).closest<HTMLElement>("[data-panel]");
    if (!panel) return;
    const k = Number(panel.dataset.panel);
    const top = root.current.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (k * range()) / (n - 1) });
  };
  return (
    <div className={`reel${still ? " still" : ""}`} ref={root} style={{ "--panels": n } as React.CSSProperties} onFocusCapture={onFocus}>
      <div className="reel-frame">
        <div className="reel-track" ref={track}>
          {section.items.map((item, k) => (
            <section key={item.id} className="reel-panel" data-panel={k} data-item={item.id} data-type={item.c.type}>
              <div className="reel-panel-body">
                <ItemFrame item={item} version={version} changedAt={changed[item.id]} ctx={ctxFor(item, false)} problem={itemProblem(problems, item.id)} showTitle />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
