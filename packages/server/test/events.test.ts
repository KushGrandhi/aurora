import { expect, test } from "vitest";
import { EventLog } from "../src/events.ts";

test("event log limits", () => {
  const log = new EventLog();
  expect("problem" in (log.add("v", { name: "big", payload: "x".repeat(17_000) }) as object)).toBe(true);
  expect("problem" in (log.add("v", { name: "n".repeat(65), payload: 1 }) as object)).toBe(true);
  expect("problem" in (log.add("v", { name: "", payload: 1 }) as object)).toBe(true);
  for (let i = 0; i < 600; i++) log.add("v", { itemId: "d", name: "tick", payload: i });
  const all = log.since("v");
  expect(all).toHaveLength(500);
  expect(all[0].seq).toBeLessThan(all[499].seq);
  expect(all[499].payload).toBe(599);
  expect(log.since("v", all[498].seq).map((e) => e.payload)).toEqual([599]);
  expect(log.since("other")).toEqual([]);
});

test("wait resolves on the next event and times out empty", async () => {
  const log = new EventLog();
  const t0 = Date.now();
  expect(await log.wait("v", 0, 50)).toEqual([]);
  expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
  const pending = log.wait("v", 0, 2000);
  setTimeout(() => log.add("v", { name: "chose", payload: { plan: "pro" } }), 20);
  const got = await pending;
  expect(got.map((e) => e.name)).toEqual(["chose"]);
  expect(await log.wait("v", 0, 2000)).toHaveLength(1); // already there: immediate
});
