import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * The model's eyes: pictures of a view as a person sees it. A headless browser on this machine (the system Chrome,
 * else Playwright's Chromium) opens the screen in capture mode (`/?capture#<id>`: no corner chrome, no reports back,
 * never counted as the person's screen, never following other views), waits for every item to draw, and takes
 * viewport shots top to bottom: one per story step, centred on it, and evenly spread through everything else.
 * Motion is reduced so each frame is a settled state. Shots are JPEG, sized to about 1,200 image tokens each.
 */
export type Size = "desktop" | "phone";
export type Shot = { size: Size; file: string; caption: string };
type Box = { id: string; top: number; height: number };
// A step is a story step, or a reel panel: where to scroll (and, for a reel swiped sideways on a phone, how far).
type Step = Box & { section: string; label?: string; left?: number };
type Layout = { height: number; sections: (Box & { title?: string })[]; steps: Step[] };

const SIZES: Record<Size, { width: number; height: number; scale: number; max: number }> = {
  desktop: { width: 1440, height: 900, scale: 0.8334, max: 6 }, // shot at 1200x750: ~1,200 tokens
  phone: { width: 390, height: 844, scale: 1, max: 4 }, // ~440 tokens
};
const READY_MS = 15_000;
// Sent as source text: the TypeScript runner wraps named functions in a helper that doesn't exist in the page.
const LAYOUT_JS = `(() => {
  const top = (el) => el.getBoundingClientRect().top + window.scrollY;
  return {
    height: document.documentElement.scrollHeight,
    sections: [...document.querySelectorAll("[data-section]")].map((el) => ({ id: el.dataset.section, top: top(el), height: el.getBoundingClientRect().height, title: el.querySelector(".section-title")?.textContent ?? undefined })),
    steps: [
      ...[...document.querySelectorAll(".story-step[data-item]")].map((el) => ({ id: el.dataset.item, section: el.closest("[data-section]")?.dataset.section ?? "", top: top(el), height: el.getBoundingClientRect().height })),
      // Reel panels: pinned and slid sideways (scroll to k/(n-1) of the stretch), or swiped on a phone (scroll the track).
      ...[...document.querySelectorAll(".reel")].flatMap((reel) => {
        const sec = reel.closest("[data-section]")?.dataset.section ?? "";
        const panels = [...reel.querySelectorAll(".reel-panel[data-item]")];
        const track = reel.querySelector(".reel-track");
        const n = panels.length, t = top(reel), h = reel.getBoundingClientRect().height, vh = innerHeight;
        const line = (innerWidth < 860 ? 0.73 : 0.5) * vh;
        const swipe = track && track.scrollWidth > track.clientWidth + 2;
        const pinned = !swipe && h > vh * 1.5;
        return panels.map((p, k) => {
          const y = pinned ? t + (n > 1 ? (k * (h - vh)) / (n - 1) : 0) : swipe ? t : top(p);
          return { id: p.dataset.item, section: sec, top: y + line - 1, height: 2, label: "panel " + (k + 1) + " of " + n, ...(swipe ? { left: p.offsetLeft } : {}) };
        });
      }),
    ],
  };
})()`;
const SETTLE_MS = 700;
const IDLE_MS = 60_000;

/** Where to scroll for each shot: every story step centred, the rest of the page spread evenly; at most `max`. */
/** `line` is the reading line as a fraction of the window height: where the screen considers a step "read" (0.73 on a phone, see renderer/src/scroll.ts). */
export type Planned = { y: number; step?: string; label?: string; section?: string; left?: number };
export function planShots(l: Layout, vh: number, max: number, section?: string, line = 0.5): Planned[] {
  const lo = section ? l.sections.find((s) => s.id === section) : undefined;
  if (section && !lo) return [];
  const from = lo ? lo.top : 0, to = lo ? lo.top + lo.height : l.height;
  const last = Math.max(0, l.height - vh);
  const clamp = (y: number) => Math.round(Math.max(0, Math.min(last, y)));
  const steps = l.steps.filter((s) => s.top >= from && s.top < to).map((s): Planned => ({ y: clamp(s.top + s.height / 2 - vh * line), step: s.id, ...(s.label ? { label: s.label } : {}), ...(s.left !== undefined ? { left: s.left, section: s.section } : {}) }));
  const inStory = (y: number) => l.sections.some((sec) => l.steps.some((st) => st.section === sec.id) && y + vh / 2 >= sec.top && y + vh / 2 < sec.top + sec.height);
  const n = Math.max(1, Math.ceil((to - from) / (vh * 0.9)));
  const even: Planned[] = Array.from({ length: n }, (_, i) => ({ y: clamp(from + (n === 1 ? 0 : ((to - from - vh) * i) / (n - 1))) })).filter((p) => !inStory(p.y));
  // The opening screen always comes first: it is what a reader sees before anything else.
  // The opening and the closing screens always come in: what a reader sees first, and where the story lands.
  const opening: Planned[] = section ? [] : [{ y: 0 }, { y: last }];
  const all = [...opening, ...even, ...steps].sort((a, b) => a.y - b.y).filter((p, i, a) => i === 0 || p.y - a[i - 1].y > vh * 0.25 || p.step);
  if (all.length <= max) return all;
  // too many: keep the first and last, and an even spread between
  return Array.from({ length: max }, (_, i) => all[Math.round((i * (all.length - 1)) / (max - 1))]);
}

type Browser = { newContext(o: unknown): Promise<Context>; close(): Promise<void>; isConnected(): boolean };
type Context = { newPage(): Promise<Page>; close(): Promise<void> };
type Frame = { evaluate<T>(fn: string): Promise<T> };
type Page = {
  mainFrame(): Frame; frames(): Frame[];
  goto(url: string): Promise<unknown>; waitForSelector(s: string, o: unknown): Promise<unknown>; waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(fn: (arg: never) => T, arg?: unknown): Promise<T>; screenshot(o: unknown): Promise<Buffer>;
};

export class Looker {
  private browser?: Promise<Browser>;
  private idle?: NodeJS.Timeout;
  private running = 0;
  private queue: (() => void)[] = [];
  private perView = new Map<string, Promise<unknown>>();
  constructor(private o: { base: () => string; dir: string }) {}

  private async launch(): Promise<Browser> {
    let pw: { chromium: { launch(o: unknown): Promise<Browser> } };
    try {
      pw = (await import("playwright-core")) as never;
    } catch {
      throw new Error("looking needs playwright-core (npm install playwright-core)");
    }
    // Software WebGL where there is no GPU (Linux, CI); a fresh temporary profile, never the person's own.
    const args = ["--enable-unsafe-swiftshader"];
    // Playwright's own signal handlers would keep the server alive on SIGTERM; the browser is closed on exit anyway.
    const signals = { handleSIGTERM: false, handleSIGINT: false, handleSIGHUP: false };
    try {
      return await pw.chromium.launch({ channel: "chrome", headless: true, args, ...signals });
    } catch {
      try {
        return await pw.chromium.launch({ headless: true, args, ...signals });
      } catch {
        throw new Error("no Chrome or Chromium found to take pictures with; install Chrome, or run `npx playwright install chromium`");
      }
    }
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.running >= 2) await new Promise<void>((r) => this.queue.push(r));
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      this.queue.shift()?.();
    }
  }

  /** Pictures of a view at the given sizes; files land in `<dir>/<viewId>/v<version>/`. */
  async look(viewId: string, version: number, opts: { sizes?: Size[]; section?: string; maxShots?: number } = {}): Promise<Shot[]> {
    const prev = this.perView.get(viewId) ?? Promise.resolve();
    const run = prev.catch(() => {}).then(() => this.lookNow(viewId, version, opts));
    this.perView.set(viewId, run);
    try {
      return await run;
    } finally {
      if (this.perView.get(viewId) === run) this.perView.delete(viewId);
    }
  }

  private active = 0; // looks in flight (running or waiting for a slot): the browser is only closed when none are

  private async lookNow(viewId: string, version: number, opts: { sizes?: Size[]; section?: string; maxShots?: number }): Promise<Shot[]> {
    this.active++;
    if (this.idle) { clearTimeout(this.idle); this.idle = undefined; }
    this.browser ??= this.launch();
    let browser: Browser;
    try {
      browser = await this.browser;
      if (!browser.isConnected()) { this.browser = this.launch(); browser = await this.browser; } // it crashed or was closed
    } catch (e) {
      this.browser = undefined;
      this.active--;
      throw e;
    }
    const out = path.join(this.o.dir, viewId, `v${version}`);
    try {
      await mkdir(out, { recursive: true });
      const sizes = opts.sizes?.length ? opts.sizes : (["desktop"] as Size[]);
      const per = await Promise.all(sizes.map((size) => this.slot(() => this.shoot(browser, viewId, size, out, opts))));
      return per.flat();
    } finally {
      // Close the browser after a quiet minute, but never under a look that is still running or queued.
      if (--this.active === 0) {
        this.idle = setTimeout(() => { if (this.active) return; const b = this.browser; this.browser = undefined; void b?.then((x) => x.close()).catch(() => {}); }, IDLE_MS);
        this.idle.unref();
      }
    }
  }

  private async shoot(browser: Browser, viewId: string, size: Size, out: string, opts: { section?: string; maxShots?: number }): Promise<Shot[]> {
    const s = SIZES[size];
    const ctx = await browser.newContext({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.scale, reducedMotion: "reduce", isMobile: size === "phone", hasTouch: size === "phone" });
    try {
      const page = await ctx.newPage();
      await page.goto(`${this.o.base()}/?capture#${viewId}`);
      await page.waitForSelector("html[data-capture-ready]", { timeout: READY_MS }).catch(() => {});
      await page.evaluate("document.fonts.ready.then(() => undefined)" as never);
      // A whole-page design scrolls inside its own frame, not the window: walk that frame from top to bottom instead.
      if (await page.evaluate<boolean>("!!document.querySelector('.page-view iframe')" as never)) return await this.shootPage(page, size, out, opts);
      const layout = await page.evaluate<Layout>(LAYOUT_JS as never);
      const plan = planShots(layout, s.height, Math.max(1, Math.min(opts.maxShots ?? s.max, 12)), opts.section, s.width < 860 ? 0.73 : 0.5);
      const shots: Shot[] = [];
      for (const [i, p] of plan.entries()) {
        await page.evaluate(`window.scrollTo(0, ${p.y})` as never);
        if (p.left !== undefined) await page.evaluate(`(() => { const t = document.querySelector('[data-section="${p.section}"] .reel-track'); if (t) t.scrollLeft = ${p.left}; })()` as never);
        await page.waitForTimeout(SETTLE_MS);
        const file = path.join(out, `${size}-${String(i).padStart(2, "0")}.jpg`);
        await writeFile(file, await page.screenshot({ type: "jpeg", quality: 70 }));
        const inFrame = layout.sections.filter((sec) => sec.top < p.y + s.height && sec.top + sec.height > p.y).map((sec) => sec.title ? `"${sec.title}"` : sec.id);
        const pct = (y: number) => Math.round((100 * Math.min(y, layout.height)) / layout.height);
        shots.push({ size, file, caption: `${size} ${s.width}×${s.height}, ${pct(p.y)}–${pct(p.y + s.height)}% of the page${inFrame.length ? `, showing ${inFrame.join(", ")}` : ""}${p.step ? (p.label ? `, ${p.label} (${p.step})` : `, story step ${p.step} in view`) : ""}` });
      }
      return shots;
    } finally {
      await ctx.close().catch(() => {});
    }
  }

  private async shootPage(page: Page, size: Size, out: string, opts: { maxShots?: number }): Promise<Shot[]> {
    const s = SIZES[size];
    const main = page.mainFrame();
    const frame = page.frames().find((f) => f !== main);
    if (!frame) return [];
    const height = await frame.evaluate<number>("document.documentElement.scrollHeight");
    const vh = s.height, last = Math.max(0, height - vh);
    const max = Math.max(1, Math.min(opts.maxShots ?? s.max, 12));
    const n = Math.min(max, Math.max(1, Math.ceil(height / (vh * 0.9))));
    const shots: Shot[] = [];
    for (let i = 0; i < n; i++) {
      const y = Math.round(n === 1 ? 0 : (last * i) / (n - 1));
      await frame.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(SETTLE_MS);
      const file = path.join(out, `${size}-${String(i).padStart(2, "0")}.jpg`);
      await writeFile(file, await page.screenshot({ type: "jpeg", quality: 70 }));
      const pct = (v: number) => Math.round((100 * Math.min(v, height)) / height);
      shots.push({ size, file, caption: `${size} ${s.width}×${s.height}, ${pct(y)}–${pct(y + vh)}% of the page (a whole-page design)` });
    }
    return shots;
  }

  async close(): Promise<void> {
    if (this.idle) clearTimeout(this.idle);
    const b = this.browser;
    this.browser = undefined;
    await b?.then((x) => x.close()).catch(() => {});
  }
}
