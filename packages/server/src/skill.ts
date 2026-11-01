import { readFileSync } from "node:fs";
import { allComponents } from "@aurora/spec";

const DESCRIPTION =
  "Show things to the user on a live generated screen instead of the terminal: data analyses (KPIs, charts, tables over CSV/JSON/Parquet), project and flow explanations, JSON, and other visuals. Build a view up part by part and refine it in place with patches. Use when results are worth seeing, or when the user asks to show, visualize, chart, explain visually or put something on the screen.";

/** SKILL.md for any harness: the static guide plus one section per registered component, so new components document themselves. */
export function generateSkill(): string {
  const guide = readFileSync(new URL("./skillGuide.md", import.meta.url), "utf8").trimEnd();
  const components = allComponents()
    .map((d) => `### \`${d.type}\`\n\n${d.doc.summary}\n\n${d.doc.guidance}\n\n\`\`\`json\n${JSON.stringify(d.doc.example)}\n\`\`\``)
    .join("\n\n");
  return `---\nname: aurora\ndescription: ${JSON.stringify(DESCRIPTION)}\n---\n\n${guide}\n\n## Components\n\nEach item's \`c\` is one of these (the \`type\` field picks it).\n\n${components}\n`;
}
