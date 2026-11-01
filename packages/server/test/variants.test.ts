import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { View, ViewEvent } from "@genui/spec";
import { DataRuntime } from "../src/dataRuntime.ts";
import { Intake } from "../src/intake.ts";
import { ViewStore } from "../src/viewStore.ts";

let dir: string;
let data: DataRuntime;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "genui-variants-")); });
afterEach(async () => { await data?.closeAll(); await rm(dir, { recursive: true, force: true }); });

function setup() {
  const events: ViewEvent[] = [];
  const store = new ViewStore(path.join(dir, "views"));
  data = new DataRuntime({ inlineDir: path.join(dir, "views") });
  const intake = new Intake({ store, data, emit: (e) => events.push(e), baseUrl: () => "http://localhost:1", screens: () => 1, openScreen: () => {}, waitMs: 10 });
  return { intake, store, events };
}
const view = (): View => ({ v: 2, id: "lp", title: "Landing", sections: [{ id: "s", layout: "grid", items: [{ id: "hero", c: { type: "custom", html: "<h1>Original</h1>" } }] }] });
const alt = (label: string, text: string) => ({ label, ops: [{ op: "editFile" as const, id: "hero", path: "index.html", content: `<h1>${text}</h1>` }] });
const lastVariants = (events: ViewEvent[]) => events.filter((e) => e.t === "variants").at(-1) as Extract<ViewEvent, { t: "variants" }> | undefined;

test("variants apply and validate without creating versions", async () => {
  const { intake, store, events } = setup();
  await intake.render(view(), "caller");
  await intake.patch("lp", [{ op: "set", title: "Landing page" }], "caller");
  const r = await intake.variants("lp", [alt("Bold", "A"), alt("Calm", "B"), alt("Playful", "C")]);
  expect(r.variants.map((v) => v.label)).toEqual(["Bold", "Calm", "Playful"]);
  expect(store.current("lp")!.version).toBe(2);
  const ev = lastVariants(events)!;
  expect(ev.baseVersion).toBe(2);
  expect(ev.variants.map((v) => (v.view.sections[0].items[0].c as unknown as { html: string }).html)).toEqual(["<h1>A</h1>", "<h1>B</h1>", "<h1>C</h1>"]);
  expect(intake.snapshot("lp").some((e) => e.t === "variants" && e.variants.length === 3)).toBe(true);
});

test("variants need 2 or 3 alternatives and cannot change data", async () => {
  const { intake } = setup();
  await intake.render(view(), "caller");
  await expect(intake.variants("lp", [alt("Only", "A")])).rejects.toThrow(/2 or 3/);
  await expect(intake.variants("lp", [alt("A", "A"), { label: "B", ops: [{ op: "addQuery", id: "q", sql: "SELECT 1" }] }])).rejects.toThrow(/addQuery/);
  await expect(intake.variants("lp", [alt("A", "A"), { label: "B", ops: [{ op: "remove", id: "ghost" }] }])).rejects.toThrow(/ghost/);
});

test("pickVariant commits, logs and clears", async () => {
  const { intake, store, events } = setup();
  await intake.render(view(), "caller");
  await intake.variants("lp", [alt("Bold", "A"), alt("Calm", "B")]);
  await intake.pickVariant("lp", 1);
  const cur = store.current("lp")!;
  expect(cur.version).toBe(2);
  expect((cur.view.sections[0].items[0].c as unknown as { html: string }).html).toBe("<h1>B</h1>");
  expect(cur.note).toContain("Calm");
  expect(intake.events("lp").map((e) => e.name)).toContain("genui:variant-picked");
  expect(intake.events("lp").at(-1)!.payload).toMatchObject({ index: 1, label: "Calm", version: 2 });
  expect(lastVariants(events)!.variants).toEqual([]);
  await expect(intake.pickVariant("lp", 0)).rejects.toThrow(/no variants/);
});

test("a commit clears pending variants", async () => {
  const { intake, events } = setup();
  await intake.render(view(), "caller");
  await intake.variants("lp", [alt("Bold", "A"), alt("Calm", "B")]);
  await intake.patch("lp", [{ op: "set", title: "Changed" }], "caller");
  expect(lastVariants(events)!.variants).toEqual([]);
  expect(intake.snapshot("lp").some((e) => e.t === "variants")).toBe(false);
});

test("screen events are logged and counted in status", async () => {
  const { intake } = setup();
  await intake.render(view(), "caller");
  await intake.screenMessage({ t: "event", viewId: "lp", itemId: "hero", name: "chose", payload: { plan: "pro" } });
  expect(intake.events("lp")).toMatchObject([{ seq: 1, itemId: "hero", name: "chose", payload: { plan: "pro" } }]);
  expect(intake.status("lp").events).toEqual({ count: 1, lastSeq: 1 });
});
