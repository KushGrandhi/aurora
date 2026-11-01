import { useState } from "react";
import { motion } from "motion/react";
import { shouldGlow } from "../motion.tsx";
import type { SectionProps } from "./Section.tsx";
import { itemProblem } from "./Section.tsx";
import { ItemFrame } from "./ItemFrame.tsx";

/** Every panel stays mounted (so each item draws and reports); only the active one is visible. */
export function Tabs({ section, version, problems, ctxFor, viewId, changed }: SectionProps) {
  const [active, setActive] = useState<string>();
  const current = section.items.find((i) => i.id === active)?.id ?? section.items[0]?.id;
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist">
        {section.items.map((item) => (
          <button key={item.id} role="tab" aria-selected={item.id === current} className={`tab${item.id === current ? " sel" : ""}`} onClick={() => setActive(item.id)}>
            {item.id === current && <motion.span layoutId={`${viewId}:${section.id}:tab`} className="tab-pill" />}
            <span className="tab-label">{item.title ?? item.id}</span>
          </button>
        ))}
      </div>
      <div className="tab-panels card">
        {section.items.map((item) => (
          <motion.div key={item.id} role="tabpanel" data-item={item.id} data-type={item.c.type} className="tab-panel" aria-hidden={item.id !== current}
            data-glow={shouldGlow(changed, item.id, version) ? "true" : undefined}
            animate={{ opacity: item.id === current ? 1 : 0 }}>
            <ItemFrame item={item} version={version} ctx={ctxFor(item, false)} problem={itemProblem(problems, item.id)} showTitle={false} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
