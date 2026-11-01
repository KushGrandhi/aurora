import { afterEach, beforeEach, expect, test } from "vitest";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import type { View, ViewEvent } from "@genui/spec";
import { DataRuntime } from "../src/dataRuntime.ts";
import { Intake } from "../src/intake.ts";
import { MediaRegistry } from "../src/media.ts";
import { ViewStore } from "../src/viewStore.ts";

let dir: string;
let server: Server | undefined;
let data: DataRuntime | undefined;
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "genui-media-")); });
afterEach(async () => {
  if (server) await new Promise((r) => server!.close(r));
  server = undefined;
  await data?.closeAll();
  await rm(dir, { recursive: true, force: true });
});

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

async function serve(reg: MediaRegistry): Promise<string> {
  server = createServer(async (req, res) => {
    const m = /^\/media\/([^/?]+)$/.exec(req.url ?? "");
    if (m && (await reg.serve(m[1], req, res))) return;
    res.writeHead(404, { "content-type": "application/json" });
    res.end('{"error":"not found"}');
  });
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Raw request so `..` reaches the server unnormalized. */
function raw(base: string, p: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, unknown>; body: Buffer }> {
  const u = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path: p, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("media serves only registered files", async () => {
  const reg = new MediaRegistry({ secretFile: path.join(dir, "secret") });
  const png = path.join(dir, "a.png");
  const other = path.join(dir, "b.png");
  const secret = path.join(dir, "secret.png");
  await writeFile(png, PNG);
  await writeFile(other, PNG);
  await writeFile(secret, Buffer.from("top secret"));
  await writeFile(path.join(dir, "notes.txt"), "hi");
  const base = await serve(reg);

  const url = reg.register(png)!;
  expect(url).toMatch(/^\/media\/[0-9a-f]{32}$/);
  const ok = await raw(base, url);
  expect(ok.status).toBe(200);
  expect(ok.headers["content-type"]).toBe("image/png");
  expect(ok.headers["x-content-type-options"]).toBe("nosniff");

  // Unregistered file's would-be token, traversal, a random token.
  const unregistered = new MediaRegistry({ secretFile: path.join(dir, "secret") });
  const guess = unregistered.register(other)!;
  expect((await raw(base, guess)).status).toBe(404);
  expect((await raw(base, "/media/../../etc/passwd")).status).toBe(404);
  expect((await raw(base, `/media/${randomBytes(16).toString("hex")}`)).status).toBe(404);

  // A registered path swapped for a symlink to another file.
  await unlink(png);
  await symlink(secret, png);
  const swapped = await raw(base, url);
  expect(swapped.status).toBe(404);
  expect(swapped.body.toString()).not.toContain("top secret");

  expect(reg.register(path.join(dir, "notes.txt"))).toBeNull();
  expect(reg.register("relative/a.png")).toBeNull();
  expect(reg.register(path.join(dir, "missing.png"))).toBeNull();
});

test("media range requests", async () => {
  const reg = new MediaRegistry({ secretFile: path.join(dir, "secret") });
  const mp4 = path.join(dir, "clip.mp4");
  const bytes = randomBytes(1000);
  await writeFile(mp4, bytes);
  const base = await serve(reg);
  const r = await raw(base, reg.register(mp4)!, { Range: "bytes=0-9" });
  expect(r.status).toBe(206);
  expect(r.headers["content-range"]).toBe("bytes 0-9/1000");
  expect(r.body.length).toBe(10);
  expect(r.body.equals(bytes.subarray(0, 10))).toBe(true);
  const tail = await raw(base, reg.register(mp4)!, { Range: "bytes=990-" });
  expect(tail.headers["content-range"]).toBe("bytes 990-999/1000");
  expect((await raw(base, reg.register(mp4)!, { Range: "bytes=5000-6000" })).status).toBe(416);
});

test("svg is sandboxed", async () => {
  const reg = new MediaRegistry({ secretFile: path.join(dir, "secret") });
  const svg = path.join(dir, "x.svg");
  await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const base = await serve(reg);
  const r = await raw(base, reg.register(svg)!);
  expect(r.headers["content-type"]).toBe("image/svg+xml");
  expect(String(r.headers["content-security-policy"])).toContain("sandbox");
});

test("token stable across restarts", async () => {
  const png = path.join(dir, "a.png");
  await writeFile(png, PNG);
  const a = new MediaRegistry({ secretFile: path.join(dir, "secret") }).register(png);
  const b = new MediaRegistry({ secretFile: path.join(dir, "secret") }).register(png);
  expect(a).toBe(b);
  const c = new MediaRegistry({ secretFile: path.join(dir, "secret2") }).register(png);
  expect(c).not.toBe(a);
});

test("intake emits media urls and warns on missing files", async () => {
  const png = path.join(dir, "a.png");
  await writeFile(png, PNG);
  const events: ViewEvent[] = [];
  data = new DataRuntime({ inlineDir: path.join(dir, "views") });
  const intake = new Intake({
    store: new ViewStore(path.join(dir, "views")), data, emit: (e) => events.push(e), baseUrl: () => "http://localhost:1",
    screens: () => 1, openScreen: () => {}, waitMs: 10, media: new MediaRegistry({ secretFile: path.join(dir, "secret") }),
  });
  const view: View = { v: 2, id: "m", title: "Media", sections: [{ id: "s", layout: "grid", items: [
    { id: "pics", c: { type: "media", items: [{ src: png }, { src: "https://example.com/v.mp4" }, { src: path.join(dir, "gone.png") }] } },
  ] }] };
  const r = await intake.render(view, "caller");
  const media = events.find((e) => e.t === "media");
  expect(media).toBeDefined();
  if (media?.t !== "media") return;
  expect(media.urls[png]).toMatch(/^\/media\/[0-9a-f]{32}$/);
  expect(media.urls["https://example.com/v.mp4"]).toBe("https://example.com/v.mp4");
  expect(media.urls[path.join(dir, "gone.png")]).toBeUndefined();
  const warn = r.problems.find((p) => p.severity === "warning");
  expect(warn).toMatchObject({ itemId: "pics" });
  expect(warn!.message).toContain("gone.png");
  expect(intake.snapshot("m").some((e) => e.t === "media")).toBe(true);
});
