import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import { createFakeProvider } from "@aurora/engine";
import { startServer } from "../src/server.ts";
import { startHosted } from "./hosted-helpers.ts";

// One request with a malformed target or path must never take the process down (in either mode).
let dir: string;
let stops: (() => Promise<void>)[] = [];
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "aurora-malformed-"));
  await writeFile(path.join(dir, "index.html"), "<!doctype html><title>aurora</title>");
});
afterEach(async () => {
  await Promise.all(stops.map((s) => s()));
  stops = [];
  await rm(dir, { recursive: true, force: true });
});

/** Sends a raw request line (fetch won't send a bracket target) and resolves with the status, or 0 when the connection just closes. */
function raw(base: string, target: string): Promise<number> {
  const { port } = new URL(base);
  return new Promise((resolve) => {
    const sock = connect(Number(port), "127.0.0.1", () => sock.write(`GET ${target} HTTP/1.1\r\nHost: localhost:${port}\r\nConnection: close\r\n\r\n`));
    let got = "";
    sock.on("data", (c) => { got += c.toString("latin1"); });
    sock.on("error", () => {});
    sock.on("close", () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(got)?.[1] ?? 0)));
  });
}

async function survives(base: string) {
  const a = await fetch(base + "/%E0");
  expect(a.status).toBeGreaterThanOrEqual(400);
  expect(a.status).toBeLessThan(500);
  const b = await raw(base, "//[");
  expect(b === 0 || (b >= 400 && b < 500), `status ${b}`).toBe(true);
  expect(await raw(base, "/%E0")).toBe(400);
  expect((await fetch(base + "/api/health")).status).toBe(200);
}

test("local: a malformed path or request target gets a 4xx and the server keeps answering", async () => {
  const srv = await startServer({ port: 0, provider: createFakeProvider({ title: "T", parts: [] }), openBrowser: () => {}, viewsDir: path.join(dir, "views"), waitMs: 20, staticDir: dir, secretFile: path.join(dir, "secret") });
  stops.push(() => srv.close());
  await survives(srv.url);
});

test("hosted: a malformed path or request target gets a 4xx and the server keeps answering", async () => {
  const s = await startHosted({ staticDir: dir });
  stops.push(() => s.close());
  await survives(s.base);
});
