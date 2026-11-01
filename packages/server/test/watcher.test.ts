import { afterEach, beforeEach, expect, test } from "vitest";
import { appendFile, mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DataRuntime } from "../src/dataRuntime.ts";
import { Intake } from "../src/intake.ts";
import { ViewStore } from "../src/viewStore.ts";
import { ViewFileWatcher } from "../src/watcher.ts";

let dir: string;
let watcher: ViewFileWatcher;
let data: DataRuntime;
let store: ViewStore;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "genui-watch-"));
  store = new ViewStore(path.join(dir, "store"));
  data = new DataRuntime({ inlineDir: path.join(dir, "store") });
  const intake = new Intake({ store, data, emit: () => {}, baseUrl: () => "http://x", screens: () => 1, openScreen: () => {}, waitMs: 10 });
  watcher = new ViewFileWatcher(intake, { pollMs: 25 });
});
afterEach(async () => { watcher.close(); await data.closeAll(); await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }); });

const until = async (fn: () => boolean | Promise<boolean>, ms = 3000) => {
  const t = Date.now();
  while (!(await fn())) { if (Date.now() - t > ms) throw new Error("timeout"); await new Promise((r) => setTimeout(r, 15)); }
};
const views = () => path.join(dir, "proj", ".genui", "views");
const file = (n = "demo") => path.join(views(), `${n}.ndjson`);
const line = (o: unknown) => JSON.stringify(o) + "\n";
const frame = { v: 2, id: "demo", title: "Demo", sections: [{ id: "main", layout: "grid", items: [{ id: "a", c: { type: "text", md: "A" } }] }] };
const problemsOf = async (n = "demo") => JSON.parse(await readFile(path.join(views(), `${n}.problems.json`), "utf8"));
const items = (id = "demo") => store.current(id)?.view.sections[0].items.map((i) => i.id) ?? [];

test("first line renders a view", async () => {
  watcher.watch(path.join(dir, "proj"));
  expect((await stat(views())).isDirectory()).toBe(true);
  await writeFile(file(), line(frame));
  await until(() => store.current("demo")?.version === 1);
  await until(async () => (await problemsOf().catch(() => null))?.version === 1);
  const p = await problemsOf();
  expect(p.viewId).toBe("demo");
  expect(p.problems.filter((x: { severity: string }) => x.severity === "error")).toEqual([]);
});

test("appended patch line applies", async () => {
  watcher.watch(path.join(dir, "proj"));
  await writeFile(file(), line(frame));
  await until(() => store.current("demo")?.version === 1);
  await appendFile(file(), line({ ops: [{ op: "add", section: "main", item: { id: "b", c: { type: "text", md: "B" } } }] }));
  await until(() => items().includes("b"));
  expect(store.current("demo")!.source).toBe("file");
});

test("partial line waits for newline", async () => {
  watcher.watch(path.join(dir, "proj"));
  const text = line(frame);
  await writeFile(file(), text.slice(0, 30));
  await new Promise((r) => setTimeout(r, 150));
  expect(store.current("demo")).toBeUndefined();
  await appendFile(file(), text.slice(30));
  await until(() => store.current("demo")?.version === 1);
});

test("bad line reported, later lines applied", async () => {
  watcher.watch(path.join(dir, "proj"));
  await writeFile(file(), line(frame) + '{"ops":[\n' + line({ ops: [{ op: "add", section: "main", item: { id: "c", c: { type: "text", md: "C" } } }] }) + line({ ops: [{ op: "teleport" }] }));
  await until(() => items().includes("c"));
  await until(async () => ((await problemsOf().catch(() => null))?.problems ?? []).some((p: { message: string }) => p.message.includes("line 4")));
  const p = await problemsOf();
  expect(p.problems.some((x: { message: string }) => x.message.startsWith("line 2"))).toBe(true);
});

test("plan 1 spec line accepted", async () => {
  watcher.watch(path.join(dir, "proj"));
  await writeFile(file("old"), line({ v: 1, title: "Old", queries: {}, layout: { type: "grid", cols: 12, items: [{ id: "x", span: 12, c: { type: "text", md: "hi" } }] } }));
  await until(() => store.current("old")?.view.title === "Old");
});

test("truncated file restarts and re-renders", async () => {
  watcher.watch(path.join(dir, "proj"));
  await writeFile(file(), line(frame) + line({ ops: [{ op: "set", title: "Two" }] }));
  await until(() => store.current("demo")?.view.title === "Two");
  await writeFile(file(), line({ ...frame, title: "Fresh" }));
  await until(() => store.current("demo")?.view.title === "Fresh");
});

test("watch is idempotent", async () => {
  watcher.watch(path.join(dir, "proj"));
  watcher.watch(path.join(dir, "proj") + "/");
  expect(watcher.dirs()).toEqual([path.join(dir, "proj")]);
  await writeFile(file(), line(frame));
  await until(() => store.current("demo")?.version === 1);
  await new Promise((r) => setTimeout(r, 100));
  expect(store.current("demo")!.version).toBe(1);
});

test("a restarted watcher resumes instead of replaying the file", async () => {
  watcher.watch(path.join(dir, "proj"));
  await writeFile(file(), line(frame) + line({ ops: [{ op: "set", title: "Two" }] }));
  await until(() => store.current("demo")?.version === 2);
  await until(async () => (await problemsOf().catch(() => null))?.version === 2);
  watcher.close();
  const store2 = new ViewStore(path.join(dir, "store"));
  await store2.load();
  const intake2 = new Intake({ store: store2, data, emit: () => {}, baseUrl: () => "http://x", screens: () => 1, openScreen: () => {}, waitMs: 10 });
  watcher = new ViewFileWatcher(intake2, { pollMs: 25 });
  watcher.watch(path.join(dir, "proj"));
  await new Promise((r) => setTimeout(r, 200));
  expect(store2.current("demo")!.version).toBe(2);
  await appendFile(file(), line({ ops: [{ op: "set", title: "Three" }] }));
  await until(() => store2.current("demo")?.view.title === "Three");
  expect(store2.current("demo")!.version).toBe(3);
});
