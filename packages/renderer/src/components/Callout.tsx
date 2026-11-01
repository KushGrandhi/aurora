import { useMemo } from "react";
import { Info, Lightbulb, Scale, TriangleAlert } from "lucide-react";
import type { Callout as CalloutC, QueryResult } from "@genui/spec";
import { fillPlaceholders } from "../format.ts";
import { renderMarkdown } from "../markdown.ts";
import type { RenderCtx } from "../registry.tsx";

const TONES = {
  note: { word: "Note", Icon: Info },
  tip: { word: "Tip", Icon: Lightbulb },
  warning: { word: "Warning", Icon: TriangleAlert },
  decision: { word: "Decision", Icon: Scale },
} as const;

/** Tone always shows as an icon plus its word, never colour alone. */
export function Callout({ c, results }: { c: CalloutC; results: Record<string, QueryResult> }) {
  const { word, Icon } = TONES[c.tone];
  const html = useMemo(() => renderMarkdown(fillPlaceholders(c.md, results)), [c.md, results]);
  return (
    <div className={`callout tone-${c.tone}`} role="note">
      <div className="callout-head">
        <Icon size={16} strokeWidth={2.2} aria-hidden />
        <span className="tone-word">{word}</span>
        {c.title && <span className="callout-title">{c.title}</span>}
      </div>
      <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export default function CalloutRenderer({ c, ctx }: { c: CalloutC; ctx: RenderCtx }) {
  return <Callout c={c} results={ctx.results} />;
}
