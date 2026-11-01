import { useMemo } from "react";
import type { Component, QueryResult } from "@aurora/spec";
import { fillPlaceholders } from "../format.ts";
import { renderMarkdown } from "../markdown.ts";

type TextC = Extract<Component, { type: "text" }>;

export function Text({ c, results }: { c: TextC; results: Record<string, QueryResult> }) {
  const html = useMemo(() => {
    const src = "md" in c ? fillPlaceholders(c.md, results) : String(results[c.doc.query]?.rows[0]?.[c.doc.field] ?? "");
    return renderMarkdown(src);
  }, [c, results]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
