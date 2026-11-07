import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { css2Family, fallbackFamily, fontEntry, fontEntryBySlug, fontFamilies, suggestFonts, type FontEntry, type Fonts } from "@aurora/spec";

/**
 * Google Fonts, kept locally. A view names families; before the view is stored, the server makes sure each one is
 * on disk: aurora's bundled faces always are, any other family is fetched once from Google's CSS2 API (every
 * subset, woff2) into the cache folder and served from there forever after. Design frames only ever load from
 * aurora (`/lib/fonts/…`), never from Google. When a family can't be had (offline, fetching turned off), its CSS
 * is a bundled face of the same kind under the requested name, and the view gets a warning saying so.
 *
 * Network use: only `fonts.googleapis.com` and `fonts.gstatic.com`, only for families not yet cached, and never with
 * `offline` set (config `fonts: "offline"` or AURORA_FONTS_OFFLINE=1).
 */
export const BUNDLED: Record<string, { css: string; family: string }> = {
  "hanken-grotesk": { css: "aurora.css", family: "Hanken Grotesk Variable" },
  newsreader: { css: "aurora.css", family: "Newsreader Variable" },
  inter: { css: "inter.css", family: "Inter Variable" },
};
// A modern browser's user agent: without one, CSS2 answers with static TTF files instead of variable woff2.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const FETCH_MS = 8000;

export type FontStoreOpts = { dir: string; libDir?: string; offline?: boolean; fetch?: typeof fetch };

export class FontStore {
  private failed = new Map<string, string>(); // slug → why it couldn't be fetched (this run)
  private pending = new Map<string, Promise<void>>();
  constructor(private o: FontStoreOpts) {}

  private cached = (slug: string) => existsSync(path.join(this.o.dir, slug, "font.css"));

  /** Fetches every named family that isn't bundled or cached yet. Never throws; failures become problems. */
  async prepare(fonts?: Fonts): Promise<void> {
    await Promise.all(fontFamilies(fonts).map((name) => {
      const e = fontEntry(name);
      if (!e || BUNDLED[e.slug] || this.cached(e.slug) || this.failed.has(e.slug)) return;
      let p = this.pending.get(e.slug);
      if (!p) {
        p = this.fetchFamily(e).catch((err) => { this.failed.set(e.slug, (err as Error).message); }).finally(() => this.pending.delete(e.slug));
        this.pending.set(e.slug, p);
      }
      return p;
    }));
  }

  /** Warnings for the view's fonts: unknown names (with suggestions) and families shown with a stand-in. */
  problems(fonts?: Fonts): string[] {
    return fontFamilies(fonts).flatMap((name) => {
      const e = fontEntry(name);
      if (!e) return [`font "${name}" is not a Google Fonts family; did you mean ${suggestFonts(name).map((s) => `"${s}"`).join(", ")}?`];
      if (BUNDLED[e.slug] || this.cached(e.slug)) return [];
      const instead = fallbackFamily(e.category) ?? "the system monospace font";
      const why = this.o.offline ? "fetching fonts is turned off" : this.failed.get(e.slug) ?? "it could not be fetched";
      return [`font "${e.family}" is shown as ${instead}: ${why}`];
    });
  }

  /** The @font-face CSS for a family slug (bundled, cached or a stand-in under the family's name), or undefined. */
  async css(slug: string): Promise<string | undefined> {
    const e = fontEntryBySlug(slug);
    if (!e) return undefined;
    if (BUNDLED[slug]) return this.bundled(slug, e.family);
    if (this.cached(slug)) return readFile(path.join(this.o.dir, slug, "font.css"), "utf8");
    const instead = fallbackFamily(e.category);
    return instead ? this.bundled(slugOf(instead), e.family) : "";
  }

  /** A cached font file's path, or undefined (the slug and name never leave the cache folder). */
  file(slug: string, name: string): string | undefined {
    if (!/^[a-z0-9-]+$/.test(slug) || !/^[\w.-]+\.woff2$/.test(name)) return undefined;
    const f = path.resolve(this.o.dir, slug, name);
    return f.startsWith(path.resolve(this.o.dir) + path.sep) && existsSync(f) ? f : undefined;
  }

  // A bundled face's rules from its CSS file, renamed to the requested family, with font URLs made relative to /lib/fonts/family/.
  private async bundled(slug: string, as: string): Promise<string> {
    const b = BUNDLED[slug];
    if (!this.o.libDir) return "";
    const css = await readFile(path.join(this.o.libDir, "fonts", b.css), "utf8").catch(() => "");
    const faces = css.split("@font-face").slice(1).filter((f) => f.includes(`'${b.family}'`) || f.includes(`"${b.family}"`));
    return faces.map((f) => `@font-face${f.replace(/font-family:\s*['"][^'"]+['"]/, `font-family: '${as}'`).replace(/url\(\.\/files\//g, "url(../files/")}`).join("\n");
  }

  private async fetchFamily(e: FontEntry): Promise<void> {
    if (this.o.offline) throw new Error("fetching fonts is turned off");
    const f = this.o.fetch ?? fetch;
    const get = async (url: string) => {
      const res = await f(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(FETCH_MS) });
      if (!res.ok) throw new Error(`Google Fonts answered ${res.status}`);
      return res;
    };
    const css = await (await get(`https://fonts.googleapis.com/css2?family=${css2Family(e)}&display=swap`)).text();
    const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)].map((m) => m[1]))];
    if (!urls.length) throw new Error("Google Fonts sent no font files");
    const tmp = path.join(this.o.dir, `.${e.slug}-${process.pid}`);
    await mkdir(tmp, { recursive: true });
    let out = css;
    await Promise.all(urls.map(async (u, i) => {
      const name = `${i}.woff2`;
      await writeFile(path.join(tmp, name), Buffer.from(await (await get(u)).arrayBuffer()));
      out = out.split(`url(${u})`).join(`url(../g/${e.slug}/${name})`);
    }));
    await writeFile(path.join(tmp, "font.css"), out);
    await rename(tmp, path.join(this.o.dir, e.slug)).catch(async () => { /* another run got there first */ });
  }
}

const slugOf = (family: string) => fontEntry(family)!.slug;
