import { fontFamilies, fontSlug, type Fonts } from "@aurora/spec";

/**
 * A view's typefaces on the screen and in design frames: each family's CSS comes from aurora's server
 * (/lib/fonts/family/<slug>.css: bundled, cached from Google Fonts, or a stand-in), and the roles become variables.
 */
export const HOUSE_BODY = '"Hanken Grotesk Variable", "Hanken Grotesk", system-ui, sans-serif';
export const HOUSE_MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
const quote = (f: string) => `"${f.replace(/["\\]/g, "")}"`;

export const fontHrefs = (f: Fonts | undefined, origin = "") => fontFamilies(f).map((name) => `${origin}/lib/fonts/family/${fontSlug(name)}.css`);

/** --aurora-body, --aurora-display and --aurora-mono for a view (house defaults for roles it leaves out). */
export function fontVars(f?: Fonts): Record<string, string> {
  const body = f?.body ? `${quote(f.body)}, ${HOUSE_BODY}` : HOUSE_BODY;
  return { "--aurora-body": body, "--aurora-display": f?.display ? `${quote(f.display)}, ${body}` : body, "--aurora-mono": f?.mono ? `${quote(f.mono)}, ${HOUSE_MONO}` : HOUSE_MONO };
}
