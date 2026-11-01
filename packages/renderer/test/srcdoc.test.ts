import { expect, test } from "vitest";
import { buildSrcdoc } from "../src/design/srcdoc.ts";

const project = { entry: "App.tsx", order: ["App.tsx"], modules: { "App.tsx": { code: "export default () => '</script><script>alert(1)</script>'" } }, css: [] };
const opts = { origin: "http://localhost:4317", framework: "react" as const, mode: "dark" as const, data: { q: [{ n: 1 }] }, assets: { logo: "/media/abc" } };

test("srcdoc carries the sandbox CSP and import map", () => {
  const html = buildSrcdoc(project, opts);
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("form-action 'none'");
  expect(html).toContain("script-src 'unsafe-inline' 'unsafe-eval' blob: http://localhost:4317/lib/");
  expect(html).toContain("img-src http://localhost:4317/media/ data: blob:");
  expect(html).toContain("\"react\":\"http://localhost:4317/lib/react.js\"");
  expect(html).toContain("http://localhost:4317/lib/tailwind.js");
  expect(html).toContain("http://localhost:4317/lib/runtime.js");
  expect(html).toContain("<div id=\"root\">");
  expect(html).toContain("class=\"dark\"");
});

test("file content cannot end the project script", () => {
  const html = buildSrcdoc(project, opts);
  const json = html.match(/<script type="application\/json" id="aurora-project">([\s\S]*?)<\/script>/)![1];
  expect(JSON.parse(json).modules["App.tsx"].code).toContain("</script><script>alert(1)</script>");
  expect(html.match(/<script>alert\(1\)<\/script>/)).toBeNull();
});

test("html projects keep the author's body", () => {
  const html = buildSrcdoc({ ...project, entry: "", order: [], modules: {}, html: "<!doctype html><html><head><title>x</title></head><body><h1>Hi</h1></body></html>", css: ["h1{color:blue}"] }, { ...opts, framework: "html", mode: "light" });
  expect(html).toContain("<h1>Hi</h1>");
  expect(html).toContain("h1{color:blue}");
  expect(html).toContain("connect-src 'none'");
  expect(html).not.toContain("<div id=\"root\">");
});

// The CSP only counts inside the real <head>, before anything that could run or load: aurora's head comes first, always.
const ourHeadFirst = /^<!doctype html>\s*<html[^>]*>\s*<head>\s*<meta charset="utf-8">\s*<meta http-equiv="Content-Security-Policy"/;
for (const [name, doc] of [
  ["a <header> fragment", "<header><h1>Hi</h1></header><script>fetch('http://x')</script>"],
  ["a script before <head>", "<html><script>fetch('http://x')</script><head><title>t</title></head><body>b</body></html>"],
  ["a commented <head>", "<!-- <head> --><html><head><title>t</title></head><body><script>fetch('http://x')</script></body></html>"],
  ["a full document", "<!doctype html><html lang='en'><head><title>t</title><script>fetch('http://x')</script></head><body>b</body></html>"],
] as const) {
  test(`the CSP leads the document for ${name}`, () => {
    const html = buildSrcdoc({ ...project, entry: "", order: [], modules: {}, html: doc, css: [] }, { ...opts, framework: "html" });
    expect(html).toMatch(ourHeadFirst);
    expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("fetch("));
  });
}

test("the classic bootstrap runs before any author script", () => {
  const html = buildSrcdoc({ ...project, entry: "", order: [], modules: {}, html: "<script>aurora.send('x')</script>", css: [] }, { ...opts, framework: "html" });
  const boot = html.indexOf('<script id="aurora-bootstrap">');
  expect(boot).toBeGreaterThan(html.indexOf('id="aurora-project"'));
  expect(boot).toBeLessThan(html.indexOf("aurora.send('x')"));
});
