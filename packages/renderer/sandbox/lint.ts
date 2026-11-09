// aurora's design checks: run inside the frame after a design has drawn, where the real layout is visible.
// Each finding is a short instruction the model can act on. They are warnings: the design still counts as rendered.

export type Display = "card" | "page" | "hero";

const visible = (r: DOMRect) => r.width > 0 && r.height > 0;

function overflow(doc: Document): string | undefined {
  const win = doc.defaultView!;
  let worst: Element | undefined;
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (el instanceof SVGElement || el.closest("svg, canvas, [data-kit-label]")) continue;
    const h = el as HTMLElement;
    if (!h.clientWidth || h.scrollWidth <= h.clientWidth + 2) continue;
    if (!(h.textContent ?? "").trim()) continue;
    const cs = win.getComputedStyle(h);
    if (/auto|scroll/.test(cs.overflowX) || (cs.overflowX === "hidden" && cs.textOverflow === "ellipsis")) continue;
    if (cs.overflowX === "hidden" || cs.overflowX === "clip") continue; // deliberately clipped
    worst = h; // the last overflowing box in document order (usually the innermost one holding the text)
  }
  if (!worst) return undefined;
  const tag = worst.tagName.toLowerCase();
  const cls = (worst.getAttribute("class") ?? "").split(/\s+/).filter(Boolean)[0];
  const text = (worst.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
  return `text overflows its box in ${tag}${cls ? "." + cls : ""} ("${text}"): let it wrap (flex-wrap, min-w-0) or give it room`;
}

function boxed3d(doc: Document, display: Display): string | undefined {
  if (display !== "card") return undefined;
  const win = doc.defaultView!;
  const area = win.innerWidth * win.innerHeight;
  const big = Array.from(doc.querySelectorAll("canvas[data-engine]")).some((c) => {
    const r = c.getBoundingClientRect();
    return r.width * r.height >= 0.4 * area;
  });
  return big ? 'a 3D scene is shown in a card: use display "hero" (with sections below) or "page" so it fills the screen' : undefined;
}

const RICH = "linearGradient, radialGradient, filter, pattern, image, foreignObject, mask";
function flatDrawing(doc: Document): string | undefined {
  if (doc.querySelector("canvas")) return undefined;
  const svgs = Array.from(doc.querySelectorAll("svg")).filter((s) => {
    const r = s.getBoundingClientRect();
    return r.width > 200 && r.height > 150;
  });
  if (!svgs.length) return undefined;
  // Outline boxes (stroke, no fill) are parts drawn as wireframes; filled bars with value labels are a chart.
  const outlines = (s: SVGSVGElement) => Array.from(s.querySelectorAll("rect")).filter((r) => {
    const cs = doc.defaultView!.getComputedStyle(r);
    return (cs.fill === "none" || /rgba\([^)]*,\s*0\)/.test(cs.fill)) && cs.stroke !== "none";
  }).length;
  const flat = svgs.every((s) => !s.querySelector(RICH) && outlines(s) >= 4 && !Array.from(s.querySelectorAll("path")).some((p) => /[CcQqAaSs]/.test(p.getAttribute("d") ?? "")));
  return flat ? "the drawing is flat boxes and lines: for a mechanism, build it as a 3D scene with aurora/kit (Scene, Metal, Glass, Glow)" : undefined;
}

/** A visible ring: a box-shadow layer with a non-transparent colour and a spread of at least 1px (Tailwind `ring-*`). */
function hasRing(shadow: string): boolean {
  if (!shadow || shadow === "none") return false;
  return shadow.split(/,(?![^(]*\))/).some((layer) => {
    const color = layer.match(/rgba?\(([^)]*)\)/);
    const alpha = color ? Number(color[1].split(",")[3] ?? 1) : 1;
    const px = (layer.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) ?? []).map(parseFloat);
    return alpha > 0 && px.length >= 4 && px[3] >= 1;
  });
}

function boxSoup(doc: Document): string | undefined {
  const win = doc.defaultView!;
  let n = 0;
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (el instanceof SVGElement || el.closest("svg")) continue;
    const r = el.getBoundingClientRect();
    if (!visible(r) || r.width >= 260 || r.height >= 140 || r.width < 40 || r.height < 24) continue;
    if (el.closest("[data-kit-label], [data-kit-controls], [data-kit-legend]") || el instanceof HTMLButtonElement || el.tagName === "INPUT") continue;
    const cs = win.getComputedStyle(el);
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    if (radius <= 0 || radius >= r.height / 2 - 1) continue; // square corners, or a pill: not a panel
    if ((parseFloat(cs.borderTopWidth) || 0) > 0 || hasRing(cs.boxShadow)) n++;
  }
  return n > 8 ? "many small boxed panels: group related readouts into one panel and let the main visual carry the page" : undefined;
}

/**
 * Text in a bare kit Panel that sits on top of the 3D model (the scene publishes the model's on-screen box as
 * data-kit-model). The box is a bounding box, so it is shrunk a little before comparing, and a warning needs a real
 * share of the panel's text on it.
 */
function textOverModel(doc: Document): string | undefined {
  const boxes = Array.from(doc.querySelectorAll("canvas[data-kit-model]")).map((c) => (c as HTMLElement).dataset.kitModel!.split(",").map(Number));
  if (!boxes.length) return undefined;
  const win = doc.defaultView!;
  for (const panel of Array.from(doc.querySelectorAll("[data-kit-panel]")) as HTMLElement[]) {
    const bg = win.getComputedStyle(panel).backgroundColor;
    if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") continue; // a glass panel carries its own backdrop
    let total = 0, over = 0;
    const walk = doc.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!(n.textContent ?? "").trim() || (n.parentElement && n.parentElement.closest("button, [data-kit-controls], [data-kit-scrubber]"))) continue;
      const range = doc.createRange();
      range.selectNodeContents(n);
      for (const r of Array.from(range.getClientRects())) {
        const area = r.width * r.height;
        total += area;
        for (const [l0, t0, r0, b0] of boxes) {
          const dx = (r0 - l0) * 0.12, dy = (b0 - t0) * 0.12;
          const w = Math.min(r.right, r0 - dx) - Math.max(r.left, l0 + dx), h = Math.min(r.bottom, b0 - dy) - Math.max(r.top, t0 + dy);
          if (w > 0 && h > 0) over += w * h;
        }
      }
    }
    if (total > 0 && over / total > 0.25) {
      const text = (panel.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      return `panel text sits over the 3D model ("${text}"): move the camera (Scene camera and target) so the model clears the panels, or give that panel glass`;
    }
  }
  return undefined;
}


// --- canvas-first guardrails: legible text, scrims on busy surfaces, reduced motion, something to change ---

const parseRgb = (c: string): [number, number, number, number] | undefined => {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return undefined;
  const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
};
const lum = ([r, g, b]: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** The solid colour behind an element: its ancestors' background colours, composited (images ignored). */
function backdrop(el: Element, win: Window): number[] | undefined {
  const layers: number[][] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    const cs = win.getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return undefined; // a gradient, image or surface: can't know
    const bgc = cs.backgroundColor;
    const c = parseRgb(bgc);
    if (!c && bgc && bgc !== "transparent") return undefined; // oklch, lab, color(): not measured here
    if (c && c[3] > 0) { layers.push(c); if (c[3] >= 0.99) break; }
  }
  let out = parseRgb(win.getComputedStyle(el.ownerDocument.documentElement).backgroundColor) ?? [255, 255, 255, 1];
  if (out[3] < 0.99) out = [255, 255, 255, 1];
  for (const c of layers.reverse()) out = [0, 1, 2].map((i) => c[i] * c[3] + out[i] * (1 - c[3])).concat(1) as typeof out;
  return out;
}

function lowContrast(doc: Document): string | undefined {
  const win = doc.defaultView!;
  for (const el of Array.from(doc.body.querySelectorAll("p, span, h1, h2, h3, h4, li, td, th, label, a, button, div"))) {
    if (el.closest("svg, canvas, [aria-hidden=true]")) continue;
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 2);
    if (!own) continue;
    const r = el.getBoundingClientRect();
    if (!visible(r)) continue;
    const cs = win.getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) < 0.5) continue;
    const fg = parseRgb(cs.color);
    if (!fg) continue;
    if (!/^rgba?\(/.test(cs.color)) continue;
    const bg = backdrop(el, win);
    if (!bg) continue;
    // flags text that is genuinely hard to read; quiet labels (text-muted, about 3.5:1) are a deliberate choice
    const need = 3;
    const got = ratio(fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3])), bg);
    if (got < need - 0.2) {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
      return `text is hard to read ("${text}", contrast ${got.toFixed(1)}:1, needs at least ${need}:1): use text-ink or text-ink-2 on this ground, or darken/lighten the ground`;
    }
  }
  return undefined;
}

const BUSY = new Set(["contour", "halftone", "thermal", "iridescent", "clouds", "blueprint"]);
function surfaceWithoutScrim(doc: Document): string | undefined {
  for (const s of Array.from(doc.querySelectorAll<HTMLElement>("[data-surface]"))) {
    if (!BUSY.has(s.dataset.surface ?? "") || s.dataset.scrim) continue;
    // a layer surface fills its parent: the text that matters is the parent's
    const host = s.getAttribute("aria-hidden") === "true" ? s.parentElement : s;
    const text = (host?.textContent ?? "").trim();
    if (text.length > 40) return `text sits on the "${s.dataset.surface}" surface without a scrim: add scrim="left" (or "bottom", "center", "all") where the text is`;
  }
  return undefined;
}

function motionUnderReduce(doc: Document): string | undefined {
  const win = doc.defaultView!;
  if (!win.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !doc.getAnimations) return undefined;
  const running = doc.getAnimations().filter((a) => a.playState === "running" && (a.effect?.getTiming().iterations ?? 1) === Infinity);
  return running.length ? `${running.length} animation${running.length > 1 ? "s keep" : " keeps"} running although the reader asked for reduced motion: stop looping animations under prefers-reduced-motion (Tailwind motion-reduce:, or check aurora's useScroll().reduced)` : undefined;
}

function nothingToChange(doc: Document, display: Display, hasData: boolean): string | undefined {
  if (display !== "page" || !hasData) return undefined;
  const controls = doc.querySelectorAll("input, select, textarea, button, [role=tab], [role=option], [role=slider], [onclick], a[href]");
  return controls.length ? undefined : "this page reads data but gives the reader nothing to change: add what the job needs (pick a case with Picker, a slider via useParamState, Tabs, a SearchTable)";
}

/** Every check that finds something, at most one message per kind. Never throws. */
export function lintDocument(doc: Document, opts: { display: Display; hasData?: boolean }): string[] {
  const out: string[] = [];
  for (const check of [() => overflow(doc), () => boxed3d(doc, opts.display), () => flatDrawing(doc), () => boxSoup(doc), () => textOverModel(doc), () => lowContrast(doc), () => surfaceWithoutScrim(doc), () => motionUnderReduce(doc), () => nothingToChange(doc, opts.display, !!opts.hasData)]) {
    try {
      const m = check();
      if (m) out.push(m);
    } catch {
      /* a check that fails says nothing */
    }
  }
  return out;
}
