import { marked } from "marked";
import DOMPurify from "dompurify";

/** Markdown → sanitized HTML. No images: they can display typed numbers and leak filled values via their URL. */
export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(marked.parse(src, { async: false }) as string, { FORBID_TAGS: ["img", "picture", "source"] });
}
