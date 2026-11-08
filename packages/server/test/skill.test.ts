import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { fontEntry } from "@aurora/spec";
import { allComponents } from "@aurora/spec";
import { generateSkill, generateSkillFiles } from "../src/skill.ts";

const files = generateSkillFiles();
const skill = files["SKILL.md"];
const all = Object.values(files).join("\n");

test("SKILL.md has frontmatter whose description says only when to use it", () => {
  expect(skill.startsWith("---\nname: aurora\ndescription: \"Use when ")).toBe(true);
  expect(generateSkill()).toBe(skill);
});

test("SKILL.md stays short: the method, with detail in the files it points to", () => {
  expect(skill.split(/\s+/).length).toBeLessThan(2400);
  for (const s of ["## The loop", "## Pick components", "## Art direction, in brief", "## Before you finish"]) expect(skill).toContain(s);
});

test("every file SKILL.md or a reference points to is in the skill, and every file is pointed to", () => {
  const mentioned = new Set([...all.matchAll(/`((?:references|examples)\/[\w-]+\.md)`/g)].map((m) => m[1]));
  for (const p of mentioned) expect(Object.keys(files)).toContain(p);
  for (const p of Object.keys(files)) if (p !== "SKILL.md") expect(skill).toContain(`\`${p}\``);
});

test("components reference documents every component with a valid example", () => {
  const md = files["references/components.md"];
  for (const def of allComponents()) {
    const section = md.slice(md.indexOf(`## \`${def.type}\``));
    expect(section.length).toBeLessThan(md.length + 1);
    const json = section.match(/```json\n([\s\S]*?)\n```/)![1];
    expect(JSON.parse(json)).toEqual(def.doc.example);
  }
});

test("both ways to deliver and every patch op are documented", () => {
  expect(skill).toContain(".aurora/views/");
  expect(skill).toContain("mcp__aurora__patch");
  expect(skill).toContain('"ops"');
  for (const op of ["set", "addSection", "removeSection", "moveSection", "add", "update", "replace", "remove", "move", "editFile", "deleteFile", "addQuery", "addDataset", "addParam", "removeParam"]) expect(all).toContain(`\`${op}\``);
});

test("data reference covers datasets, query rules and filters", () => {
  const md = files["references/data.md"];
  for (const s of ["mcp__aurora__profile", "addParam", "removeParam", "$name_min", "$name_max", "$name_from", "$name_to", "($region IS NULL OR region = $region)"]) expect(md).toContain(s);
  expect(md).toMatch(/displayed, never generated/i);
});

test("design canvas reference covers files, bridge, iteration and known mistakes", () => {
  const md = files["references/design-canvas.md"];
  for (const s of ['display: "page"', "editFile", "mcp__aurora__variants", "aurora.send", "mcp__aurora__events", "waitMs", "Math.max(0, Math.min(0.05"]) expect(md).toContain(s);
  for (const lib of ["react", "motion", "lucide-react", "three", "d3", "gsap"]) expect(md).toContain(lib);
});

test("design language names every token the sandbox defines", () => {
  const md = files["references/design-language.md"];
  for (const t of ["page", "surface", "raised", "ink", "ink-2", "muted", "hair", "line", "accent", "good", "bad", "warn", "s1", "shadow-card"]) expect(md).toContain(t);
});

test("examples include every source file in full", () => {
  for (const [name, dir] of [["examples/explainer.md", "explainer"], ["examples/landing.md", "landing"]] as const) {
    const sources = readdirSync(new URL(`../src/skill/examples/${dir}/`, import.meta.url));
    for (const f of sources) expect(files[name]).toContain(`### \`${f}\``);
  }
});

// Examples teach by being copied: one raw color or `dark:` in them and every design built from them breaks in a theme.
const RAW = /\b(?:slate|gray|zinc|neutral|stone|indigo|sky|blue|red|green|amber|emerald|violet|fuchsia|pink)-\d{2,3}\b|\bdark:|#[0-9a-fA-F]{3,6}\b|\b(?:bg|text)-(?:white|black)\b/;
test("examples and component docs use tokens, never raw colors", () => {
  const code = [...files["examples/explainer.md"].matchAll(/```tsx?\n([\s\S]*?)```/g), ...files["examples/landing.md"].matchAll(/```tsx?\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const c of code) expect(c.replace(/text-white/g, "")).not.toMatch(RAW);
  for (const t of ["design", "custom"]) {
    const ex = JSON.stringify(allComponents().find((d) => d.type === t)!.doc.example).replace(/text-white/g, "");
    expect(ex).not.toMatch(RAW);
  }
});

test("the skill routes mechanisms to a 3D kit recipe", () => {
  expect(skill).toContain("examples/mechanism.md");
  expect(skill).toContain("aurora/kit");
  expect(skill).toContain('"story"');
  expect(all).not.toContain("Draw visuals with SVG");
});

test("kit reference documents every kit export", () => {
  const md = files["references/kit.md"];
  for (const name of ["Scene", "Metal", "Glass", "Glow", "Paint", "useToken", "Label", "Stage", "Panel", "Stat", "useClock", "ControlBar", "Scrubber", "Grab", "useFocus", "useStory", "useParam", "useScroll", "span", "useScrub", "useScrollStep", "Reveal", "Stagger", "PhaseDial", "Legend"]) expect(md).toContain(`\`${name}\``);
});

test("the mechanism example is a guided story: a pinned kit scene driven by steps, in the subject's colours", () => {
  const md = files["examples/mechanism.md"];
  expect(md).toContain('from "aurora/kit"');
  expect(md).toContain('"layout": "story"');
  expect(md).toMatch(/"story": \{[^}]*"state"/);
  expect(md).toContain('"palette"');
  expect(md).toContain("useStory");
  expect(md).toContain("Scrubber");
  expect(md).toContain("Grab");
  for (const f of readdirSync(new URL("../src/skill/examples/mechanism/", import.meta.url))) expect(md).toContain(`### \`${f}\``);
});

test("design-canvas lists the 3D libraries and the design-check warnings", () => {
  const md = files["references/design-canvas.md"];
  for (const s of ["@react-three/fiber", "@react-three/drei", "aurora/kit", "text overflows its box", "a 3D scene is shown in a card", "the drawing is flat boxes and lines", "many small boxed panels"]) expect(md).toContain(s);
});

test("the mechanism example's view is valid exactly as written (copied views must not start with errors)", async () => {
  const { ViewSchema } = await import("@aurora/spec");
  const { validateView } = await import("@aurora/engine");
  const json = files["examples/mechanism.md"].match(/## The view\n\n```json\n([\s\S]*?)```/)![1];
  const view = ViewSchema.parse(JSON.parse(json));
  const { problems } = validateView(view, { queryRows: new Map(), querySql: new Map() });
  expect(problems.filter((p) => p.severity === "error")).toEqual([]);
});

test("the skill shapes a story and chooses a look before picking components", () => {
  const story = files["references/story.md"];
  for (const s of ["The one sentence", "Never name them on the page", "The hook", "The signature moment", "The ending"]) expect(story).toContain(s);
  expect(skill.indexOf("references/story.md")).toBeLessThan(skill.indexOf("## Pick components"));
  const art = files["references/design-language.md"];
  for (const s of ["Decide a direction before you build", "Don't repeat yourself", "## The guardrails", '"page"', '"ink"']) expect(art).toContain(s);
  // the old fixed recipes are gone: no single entrance or type scale imposed on every view
  expect(art).not.toContain("Enter: fade and rise");
  expect(art).not.toContain("Use these and nothing in between");
});

test("every font the skill suggests is a real Google Fonts family", () => {
  const md = files["references/design-language.md"];
  const table = md.slice(md.indexOf("| Mood |"), md.indexOf("\n\n", md.indexOf("| Mood |")));
  const names = table.split("\n").slice(2).flatMap((row) => row.split("|").slice(2, 4).flatMap((c) => c.split(",").map((s) => s.trim()).filter(Boolean)));
  expect(names.length).toBeGreaterThan(30);
  for (const n of names) expect(fontEntry(n)?.family, n).toBe(n);
  for (const n of ["Fraunces", "Inter", "JetBrains Mono", "Caveat"]) expect(fontEntry(n)).toBeTruthy();
});

test("the reference stories are valid views, each with its own look", async () => {
  const { ViewSchema } = await import("@aurora/spec");
  const looks = new Set<string>();
  for (const dir of ["data-story", "cinematic", "blueprint"]) {
    const view = JSON.parse(readFileSync(new URL(`../src/skill/examples/${dir}/view.json`, import.meta.url), "utf8"));
    const r = ViewSchema.safeParse(view);
    expect(r.success, `${dir}: ${JSON.stringify(r.error?.issues)}`).toBe(true);
    expect(view.immersive).toBe(true);
    looks.add(`${view.palette.page}|${view.fonts.display}`);
    // the files shown in the skill are the files the view runs
    for (const s of view.sections) for (const it of s.items) for (const [f, text] of Object.entries(it.c.files ?? {})) expect(text, `${dir}/${f}`).toBe(readFileSync(new URL(`../src/skill/examples/${dir}/${f}`, import.meta.url), "utf8"));
    expect(files[`examples/${dir}.md`]).toContain("## The view");
  }
  expect(looks.size).toBe(3);
});
