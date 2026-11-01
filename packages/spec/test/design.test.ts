import { expect, test } from "vitest";
import { applyOps, getComponent, type View } from "../src/index.ts";

const design = getComponent("design")!;
const custom = getComponent("custom")!;
const ok = (c: unknown) => design.schema.safeParse(c).success && design.check?.(c as never) == null;

test("design example validates", () => {
  const ex = design.doc.example;
  expect(design.schema.safeParse(ex).success).toBe(true);
  expect(design.check!(ex)).toBeNull();
  expect(design.doc.guidance).toMatch(/three/);
});

test("design check catches missing entry and bad paths", () => {
  expect(design.check!({ type: "design", framework: "react", files: { "Main.tsx": "x" } })).toContain("App.tsx");
  expect(ok({ type: "design", framework: "react", files: { "App.tsx": "x", "../x.js": "y" } })).toBe(false);
  expect(ok({ type: "design", framework: "react", files: { "App.tsx": "x", "a b.js": "y" } })).toBe(false);
  const many = Object.fromEntries([["App.tsx", "x"], ...Array.from({ length: 100 }, (_, i) => [`f${i}.js`, "x"])]);
  const msg = design.schema.safeParse({ type: "design", framework: "react", files: many }).success ? design.check!({ type: "design", framework: "react", files: many }) : "100";
  expect(msg).toContain("100");
  expect(design.check!({ type: "design", framework: "html", files: { "index.html": "<h1>x</h1>" } })).toBeNull();
  expect(design.check!({ type: "design", framework: "react", files: { "App.tsx": "x" }, entry: "Nope.tsx" })).toContain("Nope.tsx");
});

test("custom wraps one html file", () => {
  expect(custom.schema.safeParse({ type: "custom", html: "<h1>hi</h1>" }).success).toBe(true);
  expect(custom.schema.safeParse({ type: "custom", html: "" }).success).toBe(false);
  expect(custom.schema.safeParse(custom.doc.example).success).toBe(true);
});

test("media returns asset paths", () => {
  expect(design.media!({ type: "design", framework: "react", files: { "App.tsx": "x" }, assets: { logo: "/a/logo.png", hero: "https://x/h.jpg" } })).toEqual(["/a/logo.png", "https://x/h.jpg"]);
  expect(design.dataBound!({ type: "design", framework: "react", files: { "App.tsx": "x" }, data: ["q"] })).toEqual(["q"]);
});

const view = (): View => ({ v: 2, id: "v", title: "T", sections: [{ id: "s", layout: "grid", items: [
  { id: "d", c: { type: "design", framework: "react", files: { "App.tsx": "export default () => <h1>Hello</h1>; // Hello", "x.css": "a{}" } } },
  { id: "h", c: { type: "custom", html: "<p>old</p>" } },
] }] });
const files = (v: View) => (v.sections[0].items[0].c as unknown as { files: Record<string, string> }).files;

test("editFile find must match exactly once", () => {
  const zero = applyOps(view(), [{ op: "editFile", id: "d", path: "App.tsx", edits: [{ find: "Goodbye", replace: "x" }] }]);
  expect(zero.ok).toBe(false);
  if (!zero.ok) { expect(zero.problem.message).toContain("App.tsx"); expect(zero.problem.message).toContain("0 times"); }
  const two = applyOps(view(), [{ op: "set", title: "New" }, { op: "editFile", id: "d", path: "App.tsx", edits: [{ find: "Hello", replace: "x" }] }]);
  expect(two.ok).toBe(false);
  if (!two.ok) expect(two.problem.message).toContain("2 times");
});

test("editFile content replaces, edits apply in order, deleteFile removes, entry can't be deleted", () => {
  const r = applyOps(view(), [
    { op: "editFile", id: "d", path: "Hero.tsx", content: "export default () => null" },
    { op: "editFile", id: "d", path: "App.tsx", edits: [{ find: "<h1>Hello</h1>", replace: "<h1>Hi</h1>" }, { find: "<h1>Hi</h1>", replace: "<h2>Hi</h2>" }] },
    { op: "deleteFile", id: "d", path: "x.css" },
    { op: "editFile", id: "h", path: "index.html", edits: [{ find: "old", replace: "new" }] },
  ]);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(Object.keys(files(r.view)).sort()).toEqual(["App.tsx", "Hero.tsx"]);
  expect(files(r.view)["App.tsx"]).toContain("<h2>Hi</h2>");
  expect((r.view.sections[0].items[1].c as unknown as { html: string }).html).toBe("<p>new</p>");
  expect(r.changed).toEqual(expect.arrayContaining(["d", "h"]));
  const del = applyOps(view(), [{ op: "deleteFile", id: "d", path: "App.tsx" }]);
  expect(del.ok).toBe(false);
  const notDesign = applyOps({ ...view(), sections: [{ id: "s", layout: "grid", items: [{ id: "t", c: { type: "text", md: "x" } }] }] }, [{ op: "editFile", id: "t", path: "a", content: "b" }]);
  expect(notDesign.ok).toBe(false);
});
