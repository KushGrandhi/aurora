import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import type { Component, QueryResult } from "@genui/spec";
import { fillPlaceholders } from "../format.ts";

type TextC = Extract<Component, { type: "text" }>;

export function Text({ c, results }: { c: TextC; results: Record<string, QueryResult> }) {
  const html = useMemo(() => {
    const src = "md" in c ? fillPlaceholders(c.md, results) : String(results[c.doc.query]?.rows[0]?.[c.doc.field] ?? "");
    return DOMPurify.sanitize(marked.parse(src, { async: false }) as string);
  }, [c, results]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}
