// Adapter for text diagrams. Only this file knows the engine (Mermaid); it loads on first use.
import type { Mode } from "../theme.ts";
import { TOKENS } from "../theme.ts";

export type DiagramEngine = { render(id: string, source: string, mode: Mode): Promise<{ svg: string } | { error: string }> };

type Mermaid = typeof import("mermaid").default;
let engine: Promise<Mermaid> | undefined;
let configured: Mode | undefined;
let queue: Promise<unknown> = Promise.resolve(); // Mermaid's config is global: one render at a time

function configure(m: Mermaid, mode: Mode) {
  if (configured === mode) return;
  const t = TOKENS[mode];
  const raised = mode === "dark" ? "#1f1f1d" : "#ffffff";
  m.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "Inter, system-ui, sans-serif",
    themeVariables: {
      darkMode: mode === "dark",
      background: t.surface,
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "14px",
      primaryColor: raised,
      primaryTextColor: t.ink,
      primaryBorderColor: t.axis,
      secondaryColor: mode === "dark" ? "#24242a" : "#f2f1ee",
      tertiaryColor: mode === "dark" ? "#202020" : "#f7f6f3",
      lineColor: t.muted,
      textColor: t.ink,
      mainBkg: raised,
      nodeBorder: t.axis,
      clusterBkg: mode === "dark" ? "#202020" : "#f7f6f3",
      clusterBorder: t.grid,
      edgeLabelBackground: t.surface,
      actorBkg: raised,
      actorBorder: t.axis,
      actorTextColor: t.ink,
      signalColor: t.ink2,
      signalTextColor: t.ink,
      noteBkgColor: mode === "dark" ? "#2a2617" : "#fdf6e3",
      noteTextColor: t.ink,
      noteBorderColor: t.axis,
      accent: t.series[0],
    } as Record<string, unknown>,
  });
  configured = mode;
}

export const mermaidEngine: DiagramEngine = {
  render(id, source, mode) {
    const job = queue.then(async () => {
      const m = await (engine ??= import("mermaid").then((x) => x.default));
      configure(m, mode);
      try {
        await m.parse(source);
        const { svg } = await m.render(id, source);
        return { svg };
      } catch (e) {
        document.getElementById(`d${id}`)?.remove(); // Mermaid leaves its scratch element behind on failure
        const msg = String((e as Error)?.message ?? e).split("\n").map((l) => l.trim()).find(Boolean) ?? "could not parse the diagram";
        return { error: msg };
      }
    });
    queue = job.catch(() => {});
    return job;
  },
};
