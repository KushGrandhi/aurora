import { afterEach, beforeEach, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { View } from "@aurora/spec";
import { DataRuntime } from "../src/dataRuntime.ts";

const fx = (n: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../../engine/test/fixtures", n);
let dir: string;
let rt: DataRuntime;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "aurora-data-")); });
afterEach(async () => { await rt?.closeAll(); await rm(dir, { recursive: true, force: true }); });

const view = (datasets: View["datasets"]): View => ({ v: 2, id: "v", title: "T", datasets, sections: [] });

test("runs queries against view datasets", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  expect((await rt.ensure(view({ sales: fx("sales.csv") }))).problems).toEqual([]);
  const r = await rt.run("v", "n", "SELECT count(*) AS n FROM sales");
  expect("rows" in r && Number(r.rows[0].n)).toBeGreaterThan(0);
});

test("inline data persisted and reloaded after close", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  const v = view({ pts: { inline: [{ x: 1 }, { x: 2 }, { x: 3 }] } });
  await rt.ensure(v);
  const { readdir } = await import("node:fs/promises");
  const saved = await readFile(path.join(dir, "v", (await readdir(path.join(dir, "v")))[0]), "utf8");
  expect(saved.trim().split("\n")).toHaveLength(3);
  await rt.close("v");
  await rt.ensure(v);
  const r = await rt.run("v", "s", "SELECT sum(x) AS s FROM pts");
  expect("rows" in r && Number(r.rows[0].s)).toBe(6);
});

test("idle close then transparent reopen", async () => {
  rt = new DataRuntime({ inlineDir: dir, idleMs: 50 });
  await rt.ensure(view({ pts: { inline: [{ x: 5 }] } }));
  expect(rt.isOpen("v")).toBe(true);
  await new Promise((r) => setTimeout(r, 120));
  expect(rt.isOpen("v")).toBe(false);
  const r = await rt.run("v", "s", "SELECT sum(x) AS s FROM pts");
  expect("rows" in r && Number(r.rows[0].s)).toBe(5);
});

test("missing dataset path is a problem not a crash", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  const { problems } = await rt.ensure(view({ gone: "/nope/missing.csv", sales: fx("sales.csv") }));
  expect(problems).toHaveLength(1);
  expect(problems[0].message).toContain("gone");
  const r = await rt.run("v", "n", "SELECT count(*) AS n FROM sales");
  expect("rows" in r).toBe(true);
});

test("constant query rejected", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  await rt.ensure(view({ sales: fx("sales.csv") }));
  const r = await rt.run("v", "c", "SELECT 42 AS answer");
  expect("problem" in r && r.problem.message).toMatch(/dataset/);
  const w = await rt.run("v", "w", "DROP TABLE sales");
  expect("problem" in w).toBe(true);
});

test("datasets changed reloads the database", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  await rt.ensure(view({ a: { inline: [{ x: 1 }] } }));
  await rt.ensure(view({ a: { inline: [{ x: 1 }] }, b: { inline: [{ y: 2 }] } }));
  const r = await rt.run("v", "q", "SELECT y FROM b");
  expect("rows" in r && Number(r.rows[0].y)).toBe(2);
});

test("view without datasets has no data", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  expect((await rt.ensure(view(undefined))).problems).toEqual([]);
  const r = await rt.run("v", "q", "SELECT 1 FROM x");
  expect("problem" in r).toBe(true);
});

test("profile without a view", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  const p = await rt.profile({ sales: fx("sales.csv") });
  expect(p.datasets[0].name).toBe("sales");
  expect(p.datasets[0].columns.length).toBeGreaterThan(1);
});

test("a dataset that failed keeps reporting and loads once it exists", async () => {
  rt = new DataRuntime({ inlineDir: dir });
  const csv = path.join(dir, "later.csv");
  const v = view({ later: csv });
  expect((await rt.ensure(v)).problems).toHaveLength(1);
  expect((await rt.ensure(v)).problems).toHaveLength(1);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(csv, "a\n1\n2\n");
  expect((await rt.ensure(v)).problems).toEqual([]);
  const r = await rt.run("v", "q", "SELECT count(*) AS n FROM later");
  expect("rows" in r && Number(r.rows[0].n)).toBe(2);
});
