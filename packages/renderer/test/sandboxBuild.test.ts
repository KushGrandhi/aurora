import { beforeAll, expect, test } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { IMPORT_MAP } from "../src/design/libs.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let out: string;
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(path.join(dir, f)).isDirectory() ? files(path.join(dir, f)) : [path.join(dir, f)]));

beforeAll(async () => {
  out = await mkdtemp(path.join(tmpdir(), "aurora-lib-"));
  await build({ root, configFile: path.join(root, "vite.sandbox.config.ts"), logLevel: "silent", build: { outDir: out } });
}, 180_000);

test("every import-map library and the runtime files are emitted", () => {
  for (const file of new Set(Object.values(IMPORT_MAP))) expect(existsSync(path.join(out, file)), file).toBe(true);
  for (const f of ["runtime.js", "tailwind.js", "fonts/inter.css"]) expect(existsSync(path.join(out, f)), f).toBe(true);
  const css = readFileSync(path.join(out, "fonts/inter.css"), "utf8");
  for (const [, url] of css.matchAll(/url\(\.\/(files\/[^)]+)\)/g)) expect(existsSync(path.join(out, "fonts", url)), url).toBe(true);
});

test("react is bundled once and shared by every entry", () => {
  const withCore = files(out).filter((f) => f.endsWith(".js") && readFileSync(f, "utf8").includes("ReactCurrentDispatcher:"));
  expect(withCore.map((f) => path.relative(out, f))).toHaveLength(1);
});

test("commonjs libraries keep their named exports", async () => {
  const load = (f: string) => import(path.join(out, f));
  const react = await load("react.js");
  expect(typeof react.useState).toBe("function");
  expect(typeof react.default.createElement).toBe("function");
  expect(typeof (await load("jsx-runtime.js")).jsx).toBe("function");
  expect(typeof (await load("react-dom-client.js")).createRoot).toBe("function");
  expect(typeof (await load("react-dom.js")).createPortal).toBe("function");
  expect(typeof (await load("gsap.js")).gsap.to).toBe("function");
});
