import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { FontStore } from "../src/fonts.ts";

const lib = mkdtempSync(path.join(tmpdir(), "aurora-lib-"));
mkdirSync(path.join(lib, "fonts"), { recursive: true });
writeFileSync(path.join(lib, "fonts", "aurora.css"), "@font-face{font-family:'Hanken Grotesk Variable';src:url(./files/h.woff2)}\n@font-face{font-family:'Newsreader Variable';src:url(./files/n.woff2)}");

function google(calls: string[]) {
  return (async (url: string) => {
    calls.push(String(url));
    if (String(url).startsWith("https://fonts.googleapis.com/css2")) return new Response("/* latin */\n@font-face{font-family:'Fraunces';src:url(https://fonts.gstatic.com/s/fraunces/a.woff2)}\n/* latin-ext */\n@font-face{font-family:'Fraunces';src:url(https://fonts.gstatic.com/s/fraunces/b.woff2)}");
    return new Response(new Uint8Array([1, 2, 3]));
  }) as typeof fetch;
}

test("a family is fetched once with every subset, then served locally", async () => {
  const calls: string[] = [];
  const s = new FontStore({ dir: mkdtempSync(path.join(tmpdir(), "aurora-fonts-")), libDir: lib, fetch: google(calls) });
  await s.prepare({ display: "Fraunces" });
  expect(calls[0]).toContain("family=Fraunces:ital,wght@0,100..900;1,100..900");
  expect(calls).toHaveLength(3);
  const css = (await s.css("fraunces"))!;
  expect(css).toContain("url(../g/fraunces/0.woff2)");
  expect(css).toContain("url(../g/fraunces/1.woff2)");
  expect(css).not.toContain("gstatic");
  expect(s.file("fraunces", "0.woff2")).toBeTruthy();
  expect(s.problems({ display: "Fraunces" })).toEqual([]);
  await s.prepare({ display: "Fraunces" });
  expect(calls).toHaveLength(3); // cached
});

test("bundled faces need no network; unknown names get suggestions", async () => {
  const calls: string[] = [];
  const s = new FontStore({ dir: mkdtempSync(path.join(tmpdir(), "aurora-fonts-")), libDir: lib, fetch: google(calls) });
  await s.prepare({ body: "Newsreader", display: "Frances" });
  expect(calls).toEqual([]);
  expect(await s.css("newsreader")).toContain("font-family: 'Newsreader'");
  expect(s.problems({ body: "Newsreader", display: "Frances" })).toEqual([expect.stringMatching(/did you mean "Fraunces"/)]);
});

test("offline, an uncached family is a bundled face of the same kind under its own name, with a warning", async () => {
  const calls: string[] = [];
  const s = new FontStore({ dir: mkdtempSync(path.join(tmpdir(), "aurora-fonts-")), libDir: lib, offline: true, fetch: google(calls) });
  await s.prepare({ display: "Playfair Display", body: "Space Grotesk", mono: "JetBrains Mono" });
  expect(calls).toEqual([]);
  expect(await s.css("playfair-display")).toMatch(/font-family: 'Playfair Display';src:url\(\.\.\/files\/n\.woff2\)/);
  expect(await s.css("space-grotesk")).toMatch(/font-family: 'Space Grotesk';src:url\(\.\.\/files\/h\.woff2\)/);
  expect(await s.css("jetbrains-mono")).toBe("");
  expect(s.problems({ display: "Playfair Display" })).toEqual([expect.stringMatching(/shown as Newsreader: fetching fonts is turned off/)]);
});

test("paths never leave the cache", async () => {
  const s = new FontStore({ dir: mkdtempSync(path.join(tmpdir(), "aurora-fonts-")), libDir: lib });
  expect(s.file("..", "x.woff2")).toBeUndefined();
  expect(s.file("fraunces", "../../secret.woff2")).toBeUndefined();
  expect(await s.css("../etc")).toBeUndefined();
});
