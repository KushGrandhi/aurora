import type { Item, Problem, Section as SectionT, ViewItem } from "@genui/spec";
import { packRows } from "../layout.ts";
import type { RenderCtx } from "../registry.tsx";
import { ItemFrame } from "./ItemFrame.tsx";
import { Tabs } from "./Tabs.tsx";

export type SectionProps = {
  section: SectionT;
  version: number;
  problems: Problem[];
  ctxFor(item: ViewItem, hero: boolean): RenderCtx;
  heroId?: string;
};

export const itemProblem = (problems: Problem[], id: string) => problems.find((p) => p.itemId === id && p.severity === "error");

function Grid({ section, version, problems, ctxFor, heroId }: SectionProps) {
  const packed = packRows(section.items.map((i) => ({ ...i, span: i.span ?? 12 })) as Item[]) as (ViewItem & { span: number })[];
  return (
    <div className="grid">
      {packed.map((item, i) => (
        <section key={item.id} data-item={item.id} data-type={item.c.type}
          className={`card${item.id.startsWith("d_") ? " default" : ""}`}
          style={{ gridColumn: `span ${item.span}`, ["--i" as string]: i }}>
          <ItemFrame item={item} version={version} ctx={ctxFor(item, item.id === heroId)} problem={itemProblem(problems, item.id)} showTitle />
        </section>
      ))}
    </div>
  );
}

export function Section(props: SectionProps) {
  const { section } = props;
  return (
    <div className="section" data-section={section.id}>
      {section.title && <h2 className="section-title">{section.title}</h2>}
      {section.layout === "tabs" ? <Tabs {...props} /> : <Grid {...props} />}
    </div>
  );
}
