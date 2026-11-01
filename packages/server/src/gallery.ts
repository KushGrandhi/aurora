import { fileURLToPath } from "node:url";
import { allComponents, type View, type ViewItem } from "@genui/spec";

/** Absolute path of the image the gallery shows wherever a component displays media. */
export const GALLERY_SAMPLE = fileURLToPath(new URL("../assets/gallery/sample.svg", import.meta.url));

const ORDER = ["architecture", "diagram", "kpi", "chart", "table", "map", "graph", "timeline", "cards", "media", "code", "callout", "steps", "text", "json"];
const HALF = new Set(["kpi", "text", "json", "callout", "steps"]);

/** Every component's own doc example (and its fixture data) on one screen: what the skill promises, rendered. */
export function galleryView(): View {
  const defs = [...allComponents()].sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99));
  const view: View = { v: 2, id: "gallery", title: "Component gallery", summary: "Each component as the genui skill documents it.", datasets: {}, queries: {}, sections: [] };
  for (const def of defs) {
    const c = structuredClone(def.doc.example) as ViewItem["c"];
    if (c.type === "media") c.items = (c.items as { src: string }[]).map((i) => ({ ...i, src: GALLERY_SAMPLE }));
    if (c.type === "cards" && Array.isArray(c.items)) c.items = (c.items as Record<string, unknown>[]).map((i, n) => (n === 0 || i.image ? { ...i, image: GALLERY_SAMPLE } : i));
    view.sections.push({ id: `g_${def.type}`, title: def.type, layout: "grid", items: [{ id: `${def.type}_example`, span: HALF.has(def.type) ? 6 : 12, c }] });
    for (const [name, ds] of Object.entries(def.doc.fixture?.datasets ?? {})) view.datasets![name] = ds;
    for (const [name, q] of Object.entries(def.doc.fixture?.queries ?? {})) view.queries![name] = q;
  }
  return view;
}
