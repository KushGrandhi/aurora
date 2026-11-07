import { readFileSync } from "node:fs";
import { allComponents } from "@aurora/spec";

// Triggering conditions only: what the skill does lives in its body, or agents follow the summary instead of the method.
const DESCRIPTION =
  "Use when a result is worth seeing rather than reading, or when the user asks to show, visualize, chart, diagram, mock up, explain visually or put something on the screen: data analyses over CSV/JSON/Parquet, how something works, how a system is built, landing pages, interactive explainers, simulations and games.";

const src = (p: string) => readFileSync(new URL(`./skill/${p}`, import.meta.url), "utf8").trimEnd();

/** A worked example: what it shows, the item to send, then every file in full. */
function example(dir: string, title: string, intro: string, item: Record<string, unknown>, files: string[], what: "item" | "view" = "item"): string {
  const lang = (f: string) => (f.endsWith(".tsx") ? "tsx" : f.endsWith(".ts") ? "ts" : f.split(".").pop());
  const body = files.map((f) => `### \`${f}\`\n\n\`\`\`${lang(f)}\n${src(`examples/${dir}/${f}`)}\n\`\`\``).join("\n\n");
  return `# Example: ${title}\n\n${intro}\n\n## The ${what}\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\nEach key in \`files\` holds the full text of the file below.\n\n## Files\n\n${body}\n`;
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
    "references/story.md": `${src("story.md")}\n`,
    "references/design-language.md": `${src("design-language.md")}\n`,
    "references/design-canvas.md": `${src("design-canvas.md")}\n`,
    "references/data.md": `${src("data.md")}\n`,
    "references/kit.md": `${src("kit.md")}\n`,
    "examples/mechanism.md": example(
      "mechanism",
      "3D mechanism (a V8 engine)",
      "A V8 engine explained as a **guided story**: a lit 3D scene built from `aurora/kit` (glass cylinders with pistons and glowing gas inside, a crankshaft you can grab and turn, labels on the parts) stays pinned while short steps scroll past. Each step's `story.state` tells the scene which cylinder to follow and which stroke to freeze on; the last one sets the whole engine running. A `Scrubber` with the strokes marked and the controls stay for exploring freely. The view has a `palette` from its subject (hot orange for combustion). Copy this shape for anything physical: a heart, a jet engine, a lock, a gearbox, the solar system. Write one step per moment that matters, two or three sentences each. `model.ts` holds the mechanism as pure functions of one number, `Engine.tsx` builds the 3D scene, and `App.tsx` reads the story and lays out the stage.",
      {
        v: 2, id: "v8", title: "How a V8 engine works", summary: "Eight pistons share one crankshaft. Each fires in turn, every 90° of rotation, so the crank is always being pushed.",
        palette: { accent: "#e8590c", series: ["#e8590c", "#2f6fdf", "#e0a106", "#8a8a85"] },
        sections: [
          { id: "cycle", title: "One cylinder, four strokes", layout: "story", items: [
            { id: "engine", c: { type: "design", framework: "react", files: { "App.tsx": "…", "Engine.tsx": "…", "model.ts": "…" } } },
            { id: "intake", c: { type: "text", md: "**Intake.** Follow cylinder 1. Its piston falls and the intake valve opens, drawing in air and fuel." }, story: { state: { cylinder: 1, stroke: 2 } } },
            { id: "compression", c: { type: "text", md: "**Compression.** Both valves shut. The piston rises and squeezes the mixture into a tenth of the space." }, story: { state: { cylinder: 1, stroke: 3 } } },
            { id: "power", c: { type: "text", md: "**Power.** The spark fires. Burning gas shoves the piston down, and the rod turns the crank. This is the only stroke that does work." }, story: { state: { cylinder: 1, stroke: 0 } } },
            { id: "exhaust", c: { type: "text", md: "**Exhaust.** The exhaust valve opens and the rising piston pushes the burnt gas out. Then it starts again." }, story: { state: { cylinder: 1, stroke: 1 } } },
            { id: "all", c: { type: "text", md: "**Eight at once.** Each cylinder runs the same four strokes, offset so one fires every 90°. Grab the crank and turn it yourself." }, story: { state: { play: true } } },
          ] },
          { id: "why", title: "Why a V8 feels smooth", layout: "grid", items: [
            { id: "note", c: { type: "callout", tone: "tip", title: "Always a push", md: "With four power strokes per turn of the crank, there is always a cylinder pushing, so the engine runs smooth even at low speed." } },
          ] },
        ],
      },
      ["App.tsx", "Engine.tsx", "model.ts"],
      "view",
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
      "A complete landing page shown full screen: sticky nav, hero with a product mockup built from tokens, proof strip, feature cards, how it works, three pricing tiers, FAQ accordion, closing call to action and footer. It looks right in light and dark because it only uses tokens. Copy how it is built (sections as components, a mockup made from tokens), then give it a look and an order that fit the product.",
      { id: "page", span: 12, c: { type: "design", framework: "react", display: "page", files: { "App.tsx": "…", "Hero.tsx": "…", "Sections.tsx": "…" } } },
      ["App.tsx", "Hero.tsx", "Sections.tsx"],
    ),
  };
}

/** SKILL.md alone, for callers that only want the entry file. */
export function generateSkill(): string {
  return generateSkillFiles()["SKILL.md"];
}
