import { expect, test } from "vitest";
import { compileProject, type CompiledProject } from "../src/design/compile.ts";

const ok = async (c: Parameters<typeof compileProject>[0]) => {
  const r = await compileProject(c);
  if ("error" in r) throw new Error(r.error);
  return r as CompiledProject;
};

test("compile resolves relative imports and orders dependencies", async () => {
  const p = await ok({ framework: "react", files: {
    "App.tsx": "import Hero from './components/Hero';\nexport default function App() { return <Hero title={'hi'} />; }",
    "components/Hero.tsx": "import './hero.css';\nimport { label } from '../util';\ntype P = { title: string };\nexport default function Hero({ title }: P) { return <h1>{label(title)}</h1>; }",
    "components/hero.css": "h1 { color: red }",
    "util.ts": "export const label = (s: string): string => s.toUpperCase();",
  } });
  expect(p.entry).toBe("App.tsx");
  const at = (f: string) => p.order.indexOf(f);
  expect(at("components/hero.css")).toBeLessThan(at("components/Hero.tsx"));
  expect(at("util.ts")).toBeLessThan(at("components/Hero.tsx"));
  expect(at("components/Hero.tsx")).toBeLessThan(at("App.tsx"));
  expect(p.order.at(-1)).toBe("App.tsx");
  expect(p.modules["App.tsx"].code).toContain("__genui__/components/Hero.tsx");
  expect(p.modules["App.tsx"].code).toContain("react/jsx-runtime");
  expect(p.modules["components/Hero.tsx"].code).not.toContain(": P");
  expect(p.modules["components/hero.css"].code).toContain("h1 { color: red }");
});

test("compile keeps bare library imports and handles json, svg and index files", async () => {
  const p = await ok({ framework: "react", files: {
    "App.tsx": "import { motion } from 'motion/react';\nimport * as THREE from 'three';\nimport data from './data.json';\nimport logo from './logo.svg';\nimport { x } from './lib';\nexport default () => <motion.div>{data.n}{logo.length}{x}{String(!!THREE)}</motion.div>;",
    "data.json": "{\"n\": 3}",
    "logo.svg": "<svg/>",
    "lib/index.ts": "export const x = 1;",
  } });
  expect(p.modules["App.tsx"].code).toContain("\"motion/react\"".slice(1, -1));
  expect(p.modules["App.tsx"].code).toContain("__genui__/lib/index.ts");
  expect(p.modules["data.json"].code).toContain("export default");
});

test("compile rejects unknown packages", async () => {
  const r = await compileProject({ framework: "react", files: { "App.tsx": "import _ from 'lodash';\nexport default () => _.noop();" } });
  expect("error" in r && r.error).toContain("lodash");
  expect("error" in r && r.error).toContain("three");
});

test("compile reports missing files, cycles and syntax errors with file and line", async () => {
  const missing = await compileProject({ framework: "react", files: { "App.tsx": "import X from './Nope';\nexport default X;" } });
  expect("error" in missing && missing.error).toMatch(/\.\/Nope.*App\.tsx/);
  const cyc = await compileProject({ framework: "react", files: { "App.tsx": "import './a';\nexport default () => null;", "a.ts": "import './b';", "b.ts": "import './a';" } });
  expect("error" in cyc && cyc.error).toMatch(/circular import: .*a\.ts.*b\.ts/);
  const syn = await compileProject({ framework: "react", files: { "App.tsx": "export default function App() {\n  return <div>;\n}" } });
  expect("error" in syn && syn.error).toMatch(/^App\.tsx:\d+:\d+ /);
});

test("compile html project", async () => {
  const p = await ok({ framework: "html", files: {
    "index.html": "<!doctype html><html><head><link rel=\"stylesheet\" href=\"./style.css\"></head><body><h1>Hi</h1><script type=\"module\" src=\"./main.js\"></script></body></html>",
    "main.js": "import { n } from './n.js'; document.querySelector('h1').textContent += n;",
    "n.js": "export const n = 1;",
    "style.css": "h1 { color: blue }",
  } });
  expect(p.entry).toBe("main.js");
  expect(p.order).toEqual(["n.js", "main.js"]);
  expect(p.css.join("")).toContain("color: blue");
  expect(p.html).toContain("<h1>Hi</h1>");
  expect(p.html).not.toContain("main.js");
  expect(p.html).not.toContain("style.css");
});

test("an html project with inline scripts only has no entry module", async () => {
  const p = await ok({ framework: "html", files: { "index.html": "<p id=x></p><script>document.getElementById('x').textContent='ok'</script>" } });
  expect(p.order).toEqual([]);
  expect(p.html).toContain("<script>");
});
