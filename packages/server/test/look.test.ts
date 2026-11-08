import { expect, test } from "vitest";
import { planShots } from "../src/look.ts";

const vh = 900;

test("a plain page: the opening, then evenly to the bottom, within the limit", () => {
  const plan = planShots({ height: 4000, sections: [{ id: "a", top: 0, height: 4000 }], steps: [] }, vh, 6);
  expect(plan[0].y).toBe(0);
  expect(plan.at(-1)!.y).toBe(4000 - vh);
  expect(plan.length).toBeLessThanOrEqual(6);
  for (let i = 1; i < plan.length; i++) expect(plan[i].y - plan[i - 1].y).toBeLessThanOrEqual(vh);
});

test("a story: one shot per step, centred on it, and the opening screen first", () => {
  const steps = [0, 1, 2].map((i) => ({ id: `s${i}`, section: "st", top: 1200 + i * 900, height: 200 }));
  const plan = planShots({ height: 5000, sections: [{ id: "st", top: 900, height: 3000 }, { id: "end", top: 3900, height: 1100 }], steps }, vh, 8);
  expect(plan[0]).toEqual({ y: 0 });
  for (const s of steps) expect(plan).toContainEqual({ y: s.top + 100 - vh / 2, step: s.id });
  expect(plan.at(-1)!.y).toBe(5000 - vh);
});

test("one section only, and a too-long page keeps first and last", () => {
  const l = { height: 20000, sections: [{ id: "a", top: 0, height: 10000 }, { id: "b", top: 10000, height: 10000 }], steps: [] };
  const b = planShots(l, vh, 4, "b");
  expect(b.every((p) => p.y >= 10000 - 1)).toBe(true);
  const all = planShots(l, vh, 4);
  expect(all).toHaveLength(4);
  expect(all[0].y).toBe(0);
  expect(all.at(-1)!.y).toBe(20000 - vh);
  expect(planShots(l, vh, 4, "nope")).toEqual([]);
});
