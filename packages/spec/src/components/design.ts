import { z } from "zod";
import { IdSchema } from "../base.ts";
import type { ComponentDef } from "../registry.ts";

export const DESIGN_LIBRARIES = ["react", "react-dom", "motion", "lucide-react", "three", "d3", "gsap"] as const;
const MAX_FILES = 100;
const MAX_BYTES = 2_000_000;
const PathSchema = z.string().regex(/^[\w./-]+\.(tsx|ts|jsx|js|css|json|html|svg|md)$/, "file paths use letters, digits, _ . / - and end in tsx, ts, jsx, js, css, json, html, svg or md")
  .refine((p) => !p.split("/").includes("..") && !p.startsWith("/"), "file paths are relative and never contain ..");

const shared = {
  height: z.number().int().min(200).max(2400).optional(),
  display: z.enum(["card", "page"]).optional(),
  data: z.array(IdSchema).optional(),
  assets: z.record(z.string().regex(/^[\w.-]+$/), z.string().min(1)).optional(),
};

export const DesignSchema = z.object({
  type: z.literal("design"),
  framework: z.enum(["react", "html"]),
  files: z.record(PathSchema, z.string()),
  entry: PathSchema.optional(),
  viewport: z.enum(["desktop", "tablet", "phone"]).optional(),
  ...shared,
});
export type Design = z.infer<typeof DesignSchema>;

export const CustomSchema = z.object({ type: z.literal("custom"), html: z.string().min(1).max(500_000), ...shared });
export type Custom = z.infer<typeof CustomSchema>;

export const designEntry = (c: Pick<Design, "framework" | "entry">) => c.entry ?? (c.framework === "react" ? "App.tsx" : "index.html");

function checkDesign(c: Design): string | null {
  const paths = Object.keys(c.files);
  if (paths.length > MAX_FILES) return `a design has at most ${MAX_FILES} files (this one has ${paths.length})`;
  const bytes = Object.values(c.files).reduce((n, s) => n + s.length, 0);
  if (bytes > MAX_BYTES) return `a design's files total at most 2 MB (this one is ${(bytes / 1e6).toFixed(1)} MB); put large media in "assets"`;
  const entry = designEntry(c);
  if (!(entry in c.files)) return `entry file "${entry}" is missing from files (have: ${paths.slice(0, 8).join(", ")})`;
  return null;
}

const LIBS = DESIGN_LIBRARIES.join(", ");
const BRIDGE = "`window.aurora`: `data` (rows of the queries named in `data`), `onData(cb)`, `theme` (\"light\" | \"dark\", also the `dark` class on <html> for Tailwind `dark:`), `onTheme(cb)`, `asset(name)` (URL of an entry in `assets`), `send(name, payload)` (tell the caller what the person did; read with the `events` tool)";

export const design: ComponentDef<Design> = {
  type: "design",
  schema: DesignSchema,
  doc: {
    summary: "Build anything: a website, landing page, interactive explainer, game, 3D scene or product mockup, as a React + Tailwind (or plain HTML/JS) project running in a sandbox on the screen.",
    example: {
      type: "design",
      framework: "react",
      display: "card",
      files: {
        "App.tsx": "import Hero from \"./Hero\";\n\nexport default function App() {\n  return (\n    <main className=\"min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white\">\n      <Hero />\n    </main>\n  );\n}\n",
        "Hero.tsx": "import { motion } from \"motion/react\";\nimport { Sparkles } from \"lucide-react\";\n\nexport default function Hero() {\n  return (\n    <section className=\"mx-auto max-w-3xl px-6 py-20 text-center\">\n      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className=\"inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-sm text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300\">\n        <Sparkles size={14} /> Now with a design canvas\n      </motion.div>\n      <h1 className=\"mt-6 text-5xl font-semibold tracking-tight\">Show, don't tell.</h1>\n      <p className=\"mt-4 text-lg text-slate-600 dark:text-slate-400\">Any idea, rendered live and refined in place.</p>\n      <button onClick={() => window.aurora?.send(\"cta\", { from: \"hero\" })} className=\"mt-8 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white hover:bg-indigo-500\">Try it</button>\n    </section>\n  );\n}\n",
      },
    },
    guidance: [
      "Reach for it whenever the catalog components can't express what you want to show, or when the result should feel like a real product or website. You have full freedom: layout, typography, animation, interaction.",
      "`framework: \"react\"` runs `App.tsx` (or `entry`), whose default export is mounted; files import each other with relative paths. `framework: \"html\"` runs `index.html`, whose `<script type=\"module\" src=\"./main.js\">` and `<link rel=\"stylesheet\" href=\"./style.css\">` refer to files.",
      `Tailwind classes work everywhere (including \`dark:\`). Importable libraries (bundled, offline): ${LIBS}; also \`motion/react\` and the Inter font. Nothing else can be imported and there is no network: fetch, external images and CDNs are blocked and reported as problems.`,
      `Bridge: ${BRIDGE}.`,
      "`display: \"page\"` on a view's only item shows it full screen like a real site; cards get a desktop/tablet/phone switcher (`viewport`). `height` fixes a card's height; otherwise it fits the content.",
      "Iterate with `editFile` ops (`edits: [{find, replace}]` for small changes, `content` to replace a file, `deleteFile`), never by resending everything. Offer options with the `variants` tool and wait for the pick with `events`.",
      "Compile errors (file:line), runtime errors and blocked requests come back as problems on the item: fix them with `editFile`.",
    ].join(" "),
  },
  dataBound: (c) => c.data ?? [],
  media: (c) => Object.values(c.assets ?? {}),
  check: checkDesign,
};

export const custom: ComponentDef<Custom> = {
  type: "custom",
  schema: CustomSchema,
  doc: {
    summary: "One self-contained HTML document (with inline CSS and JS) in the same sandbox as `design`: the quickest way to show something bespoke.",
    example: { type: "custom", height: 240, html: "<div class=\"grid min-h-screen place-items-center bg-gradient-to-br from-indigo-500 to-fuchsia-500 p-10 text-white\"><h2 class=\"text-3xl font-semibold\">Hello from custom HTML</h2></div>" },
    guidance: `Same sandbox, bridge and libraries as \`design\` (module scripts can \`import\` ${LIBS}). Use \`design\` once it grows past one file. \`editFile\` with path \`index.html\` edits it.`,
  },
  dataBound: (c) => c.data ?? [],
  media: (c) => Object.values(c.assets ?? {}),
};
