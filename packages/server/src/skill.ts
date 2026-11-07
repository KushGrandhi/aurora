import { readFileSync } from "node:fs";
import { allComponents } from "@aurora/spec";

// Triggering conditions only: what the skill does lives in its body, or agents follow the summary instead of the method.
const DESCRIPTION =
  "Use when a result is worth seeing rather than reading, or when the user asks to show, visualize, chart, diagram, mock up, explain visually or put something on the screen: data analyses over CSV/JSON/Parquet, how something works, how a system is built, landing pages, interactive explainers, simulations and games.";

const src = (p: string) => readFileSync(new URL(`./skill/${p}`, import.meta.url), "utf8").trimEnd();

/** A worked example: what it shows, the item to send, then every file in full. */
function example(dir: string, title: string, intro: string, item: Record<string, unknown>, files: string[]): string {
  const lang = (f: string) => (f.endsWith(".tsx") ? "tsx" : f.endsWith(".ts") ? "ts" : f.split(".").pop());
  const body = files.map((f) => `### \`${f}\`\n\n\`\`\`${lang(f)}\n${src(`examples/${dir}/${f}`)}\n\`\`\``).join("\n\n");
  return `# Example: ${title}\n\n${intro}\n\n## The item\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\nEach key in \`files\` holds the full text of the file below.\n\n## Files\n\n${body}\n`;
}

function components(): string {
  const sections = allComponents()
    .map((d) => `## \`${d.type}\`\n\n${d.doc.summary}\n\n${d.doc.guidance}\n\n\`\`\`json\n${JSON.stringify(d.doc.example)}\n\`\`\``)
    .join("\n\n");
  return `# Components\n\nEach item's \`c\` is one of these; its \`type\` field picks it. Every example below is valid as written.\n\n${sections}\n`;
}

/** The skill as files, by path inside the skill folder: a short SKILL.md that holds the method, and detail it points to. */
export function generateSkillFiles(): Record<string, string> {
  return {
    "SKILL.md": `---\nname: aurora\ndescription: ${JSON.stringify(DESCRIPTION)}\n---\n\n${src("guide.md")}\n`,
    "references/components.md": components(),
    "references/design-language.md": `${src("design-language.md")}\n`,
    "references/design-canvas.md": `${src("design-canvas.md")}\n`,
    "references/data.md": `${src("data.md")}\n`,
    "references/kit.md": `${src("kit.md")}\n`,
    "examples/mechanism.md": example(
      "mechanism",
      "3D mechanism (a V8 engine)",
      "A V8 engine as a lit 3D scene built from `aurora/kit`: glass cylinders with pistons and glowing gas inside, a turning crankshaft, labels on the parts, and three floating panels (what just happened, the cylinder you follow, the controls). It is shown as the view's hero, with `steps` and a `callout` as ordinary sections below. Copy it for anything physical: a heart, a jet engine, a lock, a gearbox, the solar system. `model.ts` holds the mechanism as pure functions of one number, `Engine.tsx` builds the 3D scene, and `App.tsx` lays out the stage and panels.",
      { id: "engine", span: 12, c: { type: "design", framework: "react", display: "hero", files: { "App.tsx": "…", "Engine.tsx": "…", "model.ts": "…" } } },
      ["App.tsx", "Engine.tsx", "model.ts"],
    ),
    "examples/explainer.md": example(
      "explainer",
      "interactive explainer (a car engine)",
      "One cylinder of a four-stroke engine as a 2D drawing, animated, with play/pause, next step and speed controls, a stage switcher that is also the legend, a current-step card and live readouts. Copy its panel and controls for a process with no physical shape (a network packet, a compiler, an algorithm); for anything physical use `examples/mechanism.md` instead. `model.ts` holds the mechanism as pure functions of one number, `Engine.tsx` draws it, and `App.tsx` lays out the drawing and the panel.",
      { id: "engine", span: 12, c: { type: "design", framework: "react", files: { "App.tsx": "…", "Engine.tsx": "…", "model.ts": "…" } } },
      ["App.tsx", "Engine.tsx", "model.ts"],
    ),
    "examples/landing.md": example(
      "landing",
      "landing page (a notes app)",
      "A complete landing page shown full screen: sticky nav, hero with a product mockup built from tokens, proof strip, feature cards, how it works, three pricing tiers, FAQ accordion, closing call to action and footer. It looks right in light and dark because it only uses tokens. Copy its sections and change the words for any product or service.",
      { id: "page", span: 12, c: { type: "design", framework: "react", display: "page", files: { "App.tsx": "…", "Hero.tsx": "…", "Sections.tsx": "…" } } },
      ["App.tsx", "Hero.tsx", "Sections.tsx"],
    ),
  };
}

/** SKILL.md alone, for callers that only want the entry file. */
export function generateSkill(): string {
  return generateSkillFiles()["SKILL.md"];
}
