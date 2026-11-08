import { expect, test } from "vitest";
import { fromPlan1, ViewSchema, type Spec } from "../src/index.ts";

const plan1: Spec = {
  v: 1, title: "Revenue", summary: "Total {total.v|currency}",
  queries: { total: { sql: "SELECT sum(revenue) AS v FROM data" } },
  layout: { type: "grid", cols: 12, items: [
    { id: "k_total", span: 4, c: { type: "kpi", query: "total", field: "v", label: "Total revenue", format: "currency" } },
    { id: "t_note", span: 12, c: { type: "text", md: "hello" } },
  ] },
};

test("fromPlan1 converts a plan 1 spec", () => {
  const view = fromPlan1(plan1, "rev");
  expect(view.v).toBe(2);
  expect(view.id).toBe("rev");
  expect(view.title).toBe("Revenue");
  expect(view.summary).toBe(plan1.summary);
  expect(view.queries).toEqual(plan1.queries);
  expect(view.sections).toHaveLength(1);
  expect(view.sections[0].id).toBe("main");
  expect(view.sections[0].layout).toBe("grid");
  expect(view.sections[0].items).toEqual(plan1.layout.items);
  expect(ViewSchema.safeParse(view).success).toBe(true);
});

test("ViewSchema accepts unknown component types structurally", () => {
  const view = { v: 2, id: "x", title: "T", sections: [{ id: "s", layout: "grid", items: [{ id: "d1", c: { type: "diagram", source: "graph TD; A-->B" } }] }] };
  expect(ViewSchema.safeParse(view).success).toBe(true);
});

test("ViewSchema rejects items without a component type", () => {
  const view = { v: 2, id: "x", title: "T", sections: [{ id: "s", layout: "grid", items: [{ id: "d1", c: { source: "x" } }] }] };
  expect(ViewSchema.safeParse(view).success).toBe(false);
});

test("a story section, with steps that set focus and state, is a valid view", async () => {
  const { ViewSchema } = await import("../src/index.ts");
  const v = ViewSchema.parse({ v: 2, id: "s", title: "Story", sections: [{ id: "a", layout: "story", items: [
    { id: "visual", c: { type: "text", md: "x" } },
    { id: "s1", c: { type: "text", md: "Intake" }, story: { focus: "intake valve", state: { phase: 0 } } },
  ] }] });
  expect(v.sections[0].layout).toBe("story");
  expect(v.sections[0].items[1].story).toEqual({ focus: "intake valve", state: { phase: 0 } });
});

test("sections can set a ground, a screen height, a reel layout and story variants; misuse names the rule", () => {
  const v = (sections: unknown[]) => ({ v: 2, id: "x", title: "x", immersive: true, sections });
  const item = { id: "a", c: { type: "text", md: "hi" } };
  expect(ViewSchema.safeParse(v([{ id: "s", layout: "grid", background: "ink", height: "screen", items: [item] }, { id: "r", layout: "reel", items: [] }, { id: "st", layout: "story", variant: "split", steps: "right", items: [] }])).success).toBe(true);
  const bad = ViewSchema.safeParse(v([{ id: "s", layout: "grid", background: "red", items: [] }]));
  expect(bad.success).toBe(false);
  expect(JSON.stringify(bad.error)).toMatch(/page.*surface.*ink.*accent/);
  expect(JSON.stringify(ViewSchema.safeParse(v([{ id: "g", layout: "grid", variant: "behind", items: [] }])).error)).toMatch(/only for story sections/);
  expect(JSON.stringify(ViewSchema.safeParse(v([{ id: "st", layout: "story", height: "screen", items: [] }])).error)).toMatch(/already fill the screen/);
});
