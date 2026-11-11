import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { createCore, type Core } from "../src/core.ts";
import { FontStore } from "../src/fonts.ts";
import { Tenants } from "../src/hosted/tenants.ts";
import { MediaRegistry } from "../src/media.ts";

let tmp: string | undefined;
afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});

test("each workspace gets its own core in its own folder", async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "aurora-tenants-"));
  const media = new MediaRegistry({ secretFile: path.join(tmp, "secret") });
  const fonts = new FontStore({ dir: path.join(tmp, "fonts"), offline: true });
  let made = 0;
  const tenants = new Tenants({
    dataDir: tmp,
    make: (ws, dir) => {
      made++;
      return createCore({ ws, dir, media, fonts, open: () => {}, baseUrl: () => "http://localhost:0", hosted: true });
    },
  });
  const a = "aaaaaaaaaaaaaaaa";
  const b = "bbbbbbbbbbbbbbbb";
  expect(tenants.dir(a)).toBe(path.join(tmp, "ws", a));

  const [a1, a2] = await Promise.all([tenants.get(a), tenants.get(a)]);
  expect(made).toBe(1);
  expect(a1).toBe(a2);
  const b1: Core = await tenants.get(b);
  expect(made).toBe(2);
  expect(b1).not.toBe(a1);
  expect(await tenants.get(a)).toBe(a1);
  expect(made).toBe(2);

  expect(a1.ws).toBe(a);
  expect(a1.dir).toBe(path.join(tmp, "ws", a));
  expect(b1.dir).toBe(path.join(tmp, "ws", b));
  expect(a1.store).not.toBe(b1.store);
  expect(a1.intake).not.toBe(b1.intake);
  expect(a1.clients).not.toBe(b1.clients);

  // A view rendered in one workspace is stored in its folder and invisible to the other.
  await a1.intake.render({ v: 2, id: "v_one", title: "One", sections: [{ id: "s", layout: "grid", items: [{ id: "t", c: { type: "text", md: "hi" } }] }] } as never, "caller", { wait: false });
  expect(a1.store.list().map((v) => v.id)).toEqual(["v_one"]);
  expect(b1.store.list()).toEqual([]);
  expect((await stat(a1.dir)).isDirectory()).toBe(true);

  await tenants.closeAll();
});
