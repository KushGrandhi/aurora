import { z } from "zod";
import type { ComponentDef } from "../registry.ts";

export const StepsSchema = z.object({
  type: z.literal("steps"),
  steps: z.array(z.object({ title: z.string(), detail: z.string().optional(), status: z.enum(["done", "current", "todo"]).optional() })).min(1).max(30),
});
export type Steps = z.infer<typeof StepsSchema>;

export const steps: ComponentDef<Steps> = {
  type: "steps",
  schema: StepsSchema,
  doc: {
    summary: "A numbered sequence of steps, each optionally marked done, current or todo.",
    example: { type: "steps", steps: [{ title: "Install", detail: "npm install", status: "done" }, { title: "Build the screen", detail: "npx vite build", status: "current" }, { title: "Serve", detail: "aurora serve", status: "todo" }] },
    guidance: "Pick it for processes, setup instructions and progress through a plan. Keep titles short; put commands or detail in `detail`.",
  },
};
