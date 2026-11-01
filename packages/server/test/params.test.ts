import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { View, ViewEvent } from "@aurora/spec";
import { DataRuntime } from "../src/dataRuntime.ts";
import { Intake } from "../src/intake.ts";
import { ViewStore } from "../src/viewStore.ts";

const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures", n);
let dir: string;
let data: DataRuntime;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "aurora-params-")); });
afterEach(async () => { await data?.closeAll(); await rm(dir, { recursive: true, force: true }); });

function setup() {
  const events: ViewEvent[] = [];
  data = new DataRuntime({ inlineDir: path.join(dir, "views") });
  const intake = new Intake({ store: new ViewStore(path.join(dir, "views")), data, emit: (e) => events.push(e), baseUrl: () => "http://localhost:1", screens: () => 1, openScreen: () => {}, waitMs: 10 });
  return { intake, events };
}

const view = (): View => ({
  v: 2, id: "p", title: "Params",
  datasets: { data: fx("sales.csv") },
  params: {
    region: { type: "select", label: "Region", options: { query: "regions", field: "region" } },
    q: { type: "search", label: "Product" },
    units: { type: "range", label: "Units", min: 0, max: 100 },
  },
  queries: {
    regions: { sql: "SELECT DISTINCT region FROM data ORDER BY region" },
    total: { sql: "SELECT sum(revenue) AS total_revenue FROM data WHERE ($region IS NULL OR region = $region)" },
    found: { sql: "SELECT product FROM data WHERE product = $q" },
    mid: { sql: "SELECT count(*) AS n FROM data WHERE units BETWEEN $units_min AND $units_max" },
    all: { sql: "SELECT count(*) AS n FROM data" },
  },
  sections: [{ id: "s", layout: "grid", items: [{ id: "k", c: { type: "kpi", query: "total", field: "total_revenue", label: "Revenue" } }] }],
});

const lastResult = (events: ViewEvent[], q: string) => events.filter((e) => e.t === "result" && e.queryId === q).at(-1) as Extract<ViewEvent, { t: "result" }> | undefined;

test("param values are validated and bound", async () => {
  const { intake, events } = setup();
  const r = await intake.render(view(), "caller");
  expect(r.problems.filter((p) => p.severity === "error")).toEqual([]);
  const before = lastResult(events, "total")!.result.rows[0].total_revenue;

  expect(await intake.setParam("p", "region", "East")).toEqual({ ok: true });
  const after = lastResult(events, "total")!.result.rows[0].total_revenue;
  expect(after).not.toBe(before);

  const hostile = "'; DROP TABLE data; --";
  const bad = await intake.setParam("p", "region", hostile);
  expect("problem" in bad && bad.problem.message).toContain("not one of the options");

  expect(await intake.setParam("p", "q", hostile)).toEqual({ ok: true });
  expect(lastResult(events, "found")!.result.rows).toEqual([]);
  expect(await intake.setParam("p", "region", null)).toEqual({ ok: true });
  expect(lastResult(events, "total")!.result.rows[0].total_revenue).toBe(before); // the table still exists

  const range = await intake.setParam("p", "units", [0, 999]);
  expect("problem" in range).toBe(true);
  const unknown = await intake.setParam("p", "nope", 1);
  expect("problem" in unknown && unknown.problem.message).toContain("nope");

  const params = events.filter((e) => e.t === "params").at(-1) as Extract<ViewEvent, { t: "params" }>;
  expect(params.options.region).toEqual(["APAC", "East", "North", "South", "West"]);
  expect(params.values.q).toBe(hostile);
});

test("param change re-runs only dependent queries", async () => {
  const { intake, events } = setup();
  await intake.render(view(), "caller");
  const n = events.length;
  await intake.setParam("p", "units", [10, 20]);
  const reran = events.slice(n).filter((e) => e.t === "result").map((e) => (e as { queryId: string }).queryId);
  expect(reran).toEqual(["mid"]);
});

test("status reports param values", async () => {
  const { intake } = setup();
  await intake.render(view(), "caller");
  await intake.setParam("p", "region", "West");
  expect(intake.status("p").params).toEqual({ region: "West", q: "", units: [0, 100] });
});

test("param values survive a new version while the param keeps its type", async () => {
  const { intake, events } = setup();
  await intake.render(view(), "caller");
  await intake.setParam("p", "region", "West");
  await intake.patch("p", [{ op: "set", title: "Params again" }], "caller");
  expect(intake.status("p").params.region).toBe("West");
  await intake.patch("p", [{ op: "addParam", name: "region", param: { type: "search", label: "Region text" } }], "caller");
  expect(intake.status("p").params.region).toBe("");
  expect(events.some((e) => e.t === "params")).toBe(true);
});
