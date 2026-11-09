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
  const head = `# Example: ${title}\n\n${intro}\n\n## The ${what}\n\n\`\`\`json\n${JSON.stringify(item, null, 2)}\n\`\`\`\n`;
  return files.length ? `${head}\nEach key in \`files\` holds the full text of the file below.\n\n## Files\n\n${body}\n` : head;
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
    "references/forms.md": `${src("forms.md")}\n`,
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
    "examples/data-story.md": storyExample(
      "data-story",
      "a data story (bike trips, hour by hour)",
      "A story told with data and catalog components only, no design: an editorial look (warm paper, Fraunces over Source Serif, one burnt-orange accent). It opens on one enormous number from a query (`height: \"screen\"`), walks through the day with a pinned chart whose bars light up as each step names an hour (`story.focus`), slides through who is riding in a `reel`, lands the one point on an `ink` ground and ends with the full table to explore. Every number is a `{query.field|format}` placeholder, so nothing is typed by hand. Copy its shape for any finding in data; give it the look your subject needs.",
      [],
    ),
    "examples/cinematic.md": storyExample(
      "cinematic",
      "a cinematic 3D story (a solar eclipse)",
      "A dark, cinematic story: near-black stage, Space Grotesk, a warm accent for the sun. A 3D scene from `aurora/kit` sits behind the steps (a design defaults to `variant: \"behind\"`; the kit keeps the scene and panels clear of the steps). `model.ts` holds the moments as keyframes; `Sky.tsx` reads the live scroll value (`useScroll`) inside `useFrame` and interpolates between them, so the moon glides into line as the reader scrolls; `App.tsx` shows the step being read (`useScrollStep`). It ends on a full-screen number. Copy this for anything where motion is the explanation.",
      ["App.tsx", "Sky.tsx", "model.ts"],
    ),
    "examples/blueprint.md": storyExample(
      "blueprint",
      "a technical blueprint (how a suspension bridge hangs)",
      "A technical drawing that builds itself: deep blueprint blue, IBM Plex Mono labels, a yellow accent for the cable and the load. The story is `variant: \"split\"` with the steps on the right. `geometry.ts` holds the bridge as numbers and says when each part is drawn (in story steps); `Drawing.tsx` is one SVG whose strokes are revealed with `span(s.position, from, to)` from one animation loop, and once the load is on, dots run the force's path. Labels appear with their part and stay readable on a phone. It ends on an `accent` ground. Copy this for any process that is built, assembled or flows.",
      ["App.tsx", "Drawing.tsx", "geometry.ts"],
    ),
    "examples/ranking.md": storyExample(
      "ranking",
      "rank options by what matters to you (Swiss poster)",
      "A Swiss-poster page: near-white, black, one red, Archivo, hard rules and giant numerals. Four weights are `number` params the reader drags; the score is computed in SQL from them, so the list re-sorts live, and each bar is split by what earned the score. Copy it for any choice among options with trade-offs.",
      ["App.tsx"],
    ),
    "examples/quakes.md": storyExample(
      "quakes",
      "scrub through time and space (seismograph terminal)",
      "A phosphor-green terminal: black, VT323 over JetBrains Mono, scanlines. The day and a magnitude floor are params; a play button steps the day, a seismograph strip scrubs it, quakes in the last 30 days glow and the newest pulse (still under reduced motion). The whole year stays as faint dots so the pattern shows. Copy it for events over time and place.",
      ["App.tsx"],
    ),
    "examples/fieldguide.md": storyExample(
      "fieldguide",
      "look things up and compare (botanical field guide)",
      "A botanical plate: deep green, Cormorant Garamond italic over Karla, gold and pink. Specimens sit in a numbered grid with drawn leaves; a family filter and the picked specimen are params, search narrows the grid in the page, and the detail compares the pick with its family on a flavour wheel. Copy it for any catalogue people browse and compare.",
      ["App.tsx"],
    ),
    "examples/dial.md": storyExample(
      "dial",
      "explore a cycle (brutalist 24-hour dial)",
      "A brutalist page: acid yellow on black, Anton over Chivo Mono, blocky borders. A radial chart of the day stacks each hour by source; the reader drags the hand (the hour is a param, arrow keys work) or switches the season, and giant readouts follow. Copy it for anything cyclical: a day, a week, a year.",
      ["App.tsx"],
    ),
    "examples/water.md": storyExample(
      "water",
      "a personal what-if with a picture (picture-book tank)",
      "A picture-book page: sky blue, Fredoka over Nunito, bright layers. Each habit is a param set with chunky +/\u2212 buttons; litres are computed in SQL; a tank fills layer by layer against an average-person line. Copy it when the reader's own numbers decide the answer and a physical metaphor makes it land.",
      ["App.tsx"],
    ),
    "examples/inspector.md": storyExample(
      "inspector",
      "an inspector: one case through its steps, with the knob that decides them all (a spam filter)",
      "A whole-page design (`display: \"page\"`) built from the view's queries, with its own look (pale sage, Space Grotesk over IBM Plex, a dot-grid `Surface`). The reader picks an email in a `Picker` (a rail on desktop, a select on a phone), sees each rule that scored it as a running total in `Bars` with the cutoff drawn across, and drags the cutoff in the corner to see how many emails it catches. The pick and the cutoff are params the design sets with `useParamState`, so the queries re-run and `useQuery` brings the new rows. A second tab is the whole list in a `SearchTable`; clicking a row inspects it. Copy its shape for anything people want to understand case by case: a pipeline, a ranking, a pricing rule, a model's decision.",
      ["App.tsx"],
    ),
    "examples/tool.md": storyExample(
      "tool",
      "a what-if tool (when solar panels pay back)",
      "A tool with no data file: the fixed assumptions sit in a one-row `inline` dataset, the reader's own numbers are `number` params written into the sentence as `{{size}}` and `{{price}}`, and every result is a query over both, so the payback, the money and the chart move as the reader drags. The inputs and their result share the first row; the chart shows where the money crosses from loss to gain; a callout says what is assumed. Copy its shape for any what-if; give it the look your subject needs.",
      [],
    ),
    "examples/monitor.md": storyExample(
      "monitor",
      "a monitor that puts the exception first (cold rooms)",
      "A dense monitor (`density: \"compact\"`) opened every morning: a stable title; a summary and a callout whose sentences are built in SQL (`CASE WHEN … END AS headline`), so they name the room over its limit, or say all is clear when none is; the numbers beside a table sorted worst first; one line per room measured against its own limit, the exception in the accent and the rest muted, so nothing is averaged away. Readable column names come from quoted SQL aliases. Copy how it surfaces the exception; give it the look your subject needs.",
      [],
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

/** A whole story from examples/<dir>/view.json; a design's files are shown in full below the view. */
function storyExample(dir: string, title: string, intro: string, files: string[]): string {
  const view = JSON.parse(src(`examples/${dir}/view.json`)) as { sections: { items: { c: { type: string; files?: Record<string, string> } }[] }[] };
  for (const s of view.sections) for (const it of s.items) if (it.c.files) it.c.files = Object.fromEntries(Object.keys(it.c.files).map((k) => [k, "…"]));
  return example(dir, title, intro, view as unknown as Record<string, unknown>, files, "view");
}

/** SKILL.md alone, for callers that only want the entry file. */
export function generateSkill(): string {
  return generateSkillFiles()["SKILL.md"];
}
