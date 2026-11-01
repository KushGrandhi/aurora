import { useState } from "react";
import type { SectionProps } from "./Section.tsx";
import { itemProblem } from "./Section.tsx";
import { ItemFrame } from "./ItemFrame.tsx";

/** Every panel stays mounted (so each item draws and reports); only the active one is visible. */
export function Tabs({ section, version, problems, ctxFor }: SectionProps) {
  const [active, setActive] = useState<string>();
  const current = section.items.find((i) => i.id === active)?.id ?? section.items[0]?.id;
  return (
    <div className="tabs">
      <div className="tab-list" role="tablist">
        {section.items.map((item) => (
          <button key={item.id} role="tab" aria-selected={item.id === current} className={`tab${item.id === current ? " sel" : ""}`} onClick={() => setActive(item.id)}>
            {item.title ?? item.id}
          </button>
        ))}
      </div>
      <div className="tab-panels card">
        {section.items.map((item) => (
          <div key={item.id} role="tabpanel" data-item={item.id} data-type={item.c.type} className="tab-panel" aria-hidden={item.id !== current}>
            <ItemFrame item={item} version={version} ctx={ctxFor(item, false)} problem={itemProblem(problems, item.id)} showTitle={false} />
          </div>
        ))}
      </div>
    </div>
  );
}
