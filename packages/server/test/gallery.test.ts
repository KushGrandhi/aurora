import { afterEach, beforeEach, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateView } from "@genui/engine";
import { allComponents, getComponent } from "@genui/spec";
import { createFakeProvider } from "@genui/engine";
import { DataRuntime } from "../src/dataRuntime.ts";
import { galleryView, GALLERY_SAMPLE } from "../src/gallery.ts";
import { startServer } from "../src/server.ts";

let dir: string;
let data: DataRuntime | undefined;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "genui-gallery-")); });
afterEach(async () => { await data?.closeAll(); await rm(dir, { recursive: true, force: true }); });

test("gallery covers every component and validates", async () => {
  const view = galleryView();
  expect(view.id).toBe("gallery");
  expect(view.title).toBe("Component gallery");
  const types = view.sections.flatMap((s) => s.items.map((i) => i.c.type));
  for (const def of allComponents()) expect(types).toContain(def.type);

  data = new DataRuntime({ inlineDir: dir });
  const loaded = await data.ensure(view);
  expect(loaded.problems).toEqual([]);
  const queryRows = new Map<string, number>();
  const querySql = new Map<string, string>();
  for (const [id, q] of Object.entries(view.queries ?? {})) {
    const r = await data.run(view.id, id, q.sql);
    expect("problem" in r ? r.problem.message : "ok", id).toBe("ok");
    if (!("problem" in r)) queryRows.set(id, r.rows.length);
    querySql.set(id, q.sql);
  }
  const checked = validateView({ ...view, datasets: loaded.datasets }, { queryRows, querySql });
  expect(checked.problems).toEqual([]);

  expect(existsSync(GALLERY_SAMPLE)).toBe(true);
  for (const s of view.sections) for (const i of s.items) for (const src of getComponent(i.c.type)?.media?.(i.c) ?? []) expect(src).toBe(GALLERY_SAMPLE);
  const spans = Object.fromEntries(view.sections.flatMap((s) => s.items.map((i) => [i.c.type, i.span])));
  expect(spans.architecture).toBe(12);
  expect(spans.kpi).toBe(6);
});

test("POST /api/gallery renders it", async () => {
  const srv = await startServer({ port: 0, provider: createFakeProvider({ title: "T", parts: [] }), openBrowser: () => {}, viewsDir: path.join(dir, "views"), waitMs: 20, secretFile: path.join(dir, "secret") });
  try {
    const r = await fetch(srv.url + "/api/gallery", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.viewId).toBe("gallery");
    expect(body.problems.filter((p: { severity: string }) => p.severity !== "unverified")).toEqual([]);
  } finally {
    await srv.close();
  }
});
