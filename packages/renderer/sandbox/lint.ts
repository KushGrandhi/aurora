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
    worst = h; // later elements are deeper in document order: keep the innermost box that overflows
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
  const flat = svgs.every((s) => !s.querySelector(RICH) && s.querySelectorAll("rect").length >= 6 && !Array.from(s.querySelectorAll("path")).some((p) => /[CcQqAaSs]/.test(p.getAttribute("d") ?? "")));
  return flat ? "the drawing is flat boxes and lines: for a mechanism, build it as a 3D scene with aurora/kit (Scene, Metal, Glass, Glow)" : undefined;
}

function boxSoup(doc: Document): string | undefined {
  const win = doc.defaultView!;
  let n = 0;
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (el instanceof SVGElement || el.closest("svg")) continue;
    const r = el.getBoundingClientRect();
    if (!visible(r) || r.width >= 260 || r.height >= 140 || r.width < 40 || r.height < 24) continue;
    const cs = win.getComputedStyle(el);
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    const bordered = (parseFloat(cs.borderTopWidth) || 0) > 0 || /\d+px \d+px 0px [1-9]/.test(cs.boxShadow) || cs.boxShadow.includes("0px 0px 0px");
    if (radius > 0 && bordered && !(el instanceof HTMLButtonElement) && el.tagName !== "INPUT") n++;
  }
  return n > 8 ? "many small boxed panels: group related readouts into one panel and let the main visual carry the page" : undefined;
}

/** Every check that finds something, at most one message per kind. Never throws. */
export function lintDocument(doc: Document, opts: { display: Display }): string[] {
  const out: string[] = [];
  for (const check of [() => overflow(doc), () => boxed3d(doc, opts.display), () => flatDrawing(doc), () => boxSoup(doc)]) {
    try {
      const m = check();
      if (m) out.push(m);
    } catch {
      /* a check that fails says nothing */
    }
  }
  return out;
}
