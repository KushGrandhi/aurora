import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const TimelineSchema = z.object({
  type: z.literal("timeline"),
  events: z.array(z.object({ date: z.string(), end: z.string().optional(), title: z.string(), detail: z.string().optional(), group: z.string().optional() })).optional(),
  query: z.object({ id: IdSchema, date: z.string(), title: z.string(), end: z.string().optional(), group: z.string().optional() }).optional(),
});
export type Timeline = z.infer<typeof TimelineSchema>;

function checkTimeline(c: Timeline): string | null {
  if (!c.events && !c.query) return "timeline needs `events` or `query`";
  for (const e of c.events ?? []) {
    for (const d of [e.date, e.end]) if (d !== undefined && isNaN(Date.parse(d))) return `timeline date "${d}" is not a date (use ISO, e.g. 2026-03-01)`;
  }
  return null;
}

export const timeline: ComponentDef<Timeline> = {
  type: "timeline",
  schema: TimelineSchema,
  doc: {
    summary: "Events and spans on a time axis, optionally in lanes by group; becomes a vertical list on narrow screens.",
    example: {
      type: "timeline",
      events: [
        { date: "2026-01-12", title: "Kickoff", group: "Product" },
        { date: "2026-02-01", end: "2026-04-15", title: "Build", group: "Engineering", detail: "Core canvas and components" },
        { date: "2026-04-20", title: "Beta", group: "Product" },
        { date: "2026-05-05", end: "2026-06-01", title: "Hardening", group: "Engineering" },
      ],
    },
    guidance: "Pick it for history, schedules and milestones. Dates are ISO strings; `end` makes a span. `group` puts events in lanes. From data, map query columns with `query: {id, date, title, end?, group?}`.",
  },
  dataBound: (c) => (c.query ? [c.query.id] : []),
  check: checkTimeline,
};
