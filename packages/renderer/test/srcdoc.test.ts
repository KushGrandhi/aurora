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
  const json = html.match(/<script type="application\/json" id="genui-project">([\s\S]*?)<\/script>/)![1];
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
