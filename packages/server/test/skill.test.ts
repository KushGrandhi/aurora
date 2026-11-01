import { expect, test } from "vitest";
import { allComponents } from "@aurora/spec";
import { generateSkill } from "../src/skill.ts";

test("skill has frontmatter and every component section", () => {
  const md = generateSkill();
  expect(md.startsWith("---\nname: aurora\ndescription: ")).toBe(true);
  for (const def of allComponents()) {
    expect(md).toContain(`### \`${def.type}\``);
    const section = md.slice(md.indexOf(`### \`${def.type}\``));
    const json = section.match(/```json\n([\s\S]*?)\n```/)![1];
    expect(JSON.parse(json)).toEqual(def.doc.example);
  }
});

test("skill documents both delivery paradigms", () => {
  const md = generateSkill();
  expect(md).toContain(".aurora/views/");
  expect(md).toContain("mcp__aurora__patch");
  expect(md).toContain('"ops"');
  for (const op of ["set", "addSection", "removeSection", "moveSection", "add", "update", "replace", "remove", "move", "addQuery", "addDataset"]) expect(md).toContain(`\`${op}\``);
});

test("skill mentions params and every component", () => {
  const md = generateSkill();
  expect(md).toContain("## Pick the right component");
  for (const s of ["addParam", "removeParam", "$name_min", "$name_max", "$name_from", "$name_to", "($region IS NULL OR region = $region)"]) expect(md).toContain(s);
  expect(md).toMatch(/displayed, never generated/i);
  for (const def of allComponents()) expect(md).toContain(`\`${def.type}\``);
});

test("skill covers the design canvas", () => {
  const md = generateSkill();
  expect(md).toContain("## The design canvas: build anything");
  for (const s of ['display: "page"', "editFile", "mcp__aurora__variants", "aurora.send", "mcp__aurora__events", "waitMs"]) expect(md).toContain(s);
  for (const lib of ["react", "motion", "lucide-react", "three", "d3", "gsap"]) expect(md).toContain(lib);
});
