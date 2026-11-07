// Adapter for text diagrams. Only this file knows the engine (Mermaid); it loads on first use.
import type { Stage } from "../theme.ts";
import { mix } from "@aurora/spec";

export type DiagramEngine = { render(id: string, source: string, stage: Stage, font?: string): Promise<{ svg: string } | { error: string }> };

type Mermaid = typeof import("mermaid").default;
let engine: Promise<Mermaid> | undefined;
let configured: string | undefined; // the stage it was configured for: Mermaid's config is global
let queue: Promise<unknown> = Promise.resolve(); // Mermaid's config is global: one render at a time

function configure(m: Mermaid, t: Stage, font = "Inter, system-ui, sans-serif") {
  const key = JSON.stringify(t) + font;
  if (configured === key) return;
  const mode = t.mode;
  const raised = t.raised;
  const tint = (n: number) => mix(t.page, t.ink, n);
  m.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: font,
    themeVariables: {
      darkMode: mode === "dark",
      background: t.surface,
      fontFamily: font,
      fontSize: "14px",
      primaryColor: raised,
      primaryTextColor: t.ink,
      primaryBorderColor: t.axis,
      secondaryColor: tint(0.06),
      tertiaryColor: tint(0.03),
      lineColor: t.muted,
      textColor: t.ink,
      mainBkg: raised,
      nodeBorder: t.axis,
      clusterBkg: tint(0.03),
      clusterBorder: t.grid,
      edgeLabelBackground: t.surface,
      actorBkg: raised,
      actorBorder: t.axis,
      actorTextColor: t.ink,
      signalColor: t.ink2,
      signalTextColor: t.ink,
      noteBkgColor: mix(t.surface, t.warn, 0.12),
      noteTextColor: t.ink,
      noteBorderColor: t.axis,
      accent: t.series[0],
    } as Record<string, unknown>,
  });
  configured = key;
}

export const mermaidEngine: DiagramEngine = {
  render(id, source, stage, font) {
    const job = queue.then(async () => {
      const m = await (engine ??= import("mermaid").then((x) => x.default));
      configure(m, stage, font);
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
