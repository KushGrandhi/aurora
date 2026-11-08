import { useEffect, useRef } from "react";
import { useScroll, span } from "aurora/kit";
import { ANCHORS, BUILD, CABLE, DECK, GROUND, HANGERS, TOP, TOWERS, cableY } from "./geometry";

const mono = { fontFamily: "var(--aurora-mono)", fontSize: 12 };

/**
 * The bridge draws itself as the reader scrolls: each part's stroke is revealed between two story positions
 * (BUILD), and once the load is on, dots run the force's path: deck → hangers → cable → towers → ground.
 * One animation loop reads the live scroll value and writes attributes directly: no React state per frame.
 */
export default function Drawing() {
  const s = useScroll();
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      const root = svg.current;
      if (root) {
        for (const [part, [a, b]] of Object.entries(BUILD)) {
          const k = span(s.position, a, b);
          root.querySelectorAll<SVGElement>(`[data-part="${part}"]`).forEach((el) => {
            if (el.dataset.draw !== undefined) el.style.strokeDashoffset = String(1 - k);
            else el.style.opacity = String(k);
          });
        }
        // the force's path, only while the load is on
        const on = span(s.position, ...BUILD.load) > 0.5;
        root.querySelectorAll<SVGCircleElement>("[data-flow]").forEach((dot, i) => {
          const u = ((t / 2400 + i / 6) % 1);
          const x = HANGERS[5] + (TOWERS[1] - HANGERS[5]) * u;
          dot.setAttribute("cx", String(u < 0.25 ? HANGERS[5] : x));
          dot.setAttribute("cy", String(u < 0.25 ? DECK - (DECK - cableY(HANGERS[5])) * (u / 0.25) : cableY(x)));
          dot.style.opacity = on ? "1" : "0";
        });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const draw = { pathLength: 1, strokeDasharray: 1, "data-draw": "" } as const;
  return (
    <svg ref={svg} viewBox="0 0 800 480" className="h-auto w-full" role="img" aria-label="A suspension bridge, drawn part by part">
      {/* labels stay about 12px on screen: on a phone the drawing shrinks, so their size in drawing units grows */}
      <style>{"@media (max-width: 640px) { text { font-size: 26px !important; } }"}</style>
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--line)" strokeWidth="0.6" /></pattern>
      </defs>
      <rect width="800" height="480" fill="url(#grid)" />
      <line x1="0" x2="800" y1={GROUND} y2={GROUND} stroke="var(--ink-2)" strokeWidth="1.5" />
      {TOWERS.map((x) => <path key={x} data-part="towers" {...draw} d={`M${x} ${GROUND} V${TOP - 10}`} stroke="var(--ink)" strokeWidth="6" fill="none" />)}
      <path data-part="cable" {...draw} d={CABLE} stroke="var(--accent)" strokeWidth="3" fill="none" />
      {HANGERS.map((x) => <path key={x} data-part="hangers" {...draw} d={`M${x} ${cableY(x)} V${DECK}`} stroke="var(--ink-2)" strokeWidth="1.5" fill="none" />)}
      <path data-part="deck" {...draw} d={`M${ANCHORS[0]} ${DECK} H${ANCHORS[1]}`} stroke="var(--ink)" strokeWidth="5" fill="none" />
      <g data-part="load">
        <rect x={HANGERS[5] - 26} y={DECK - 22} width="52" height="18" rx="3" fill="var(--accent)" />
        <path d={`M${HANGERS[5]} ${DECK + 8} v28 m-6 -8 l6 8 l6 -8`} stroke="var(--accent)" strokeWidth="2" fill="none" />
        <text x={HANGERS[5] - 12} y={DECK + 36} textAnchor="end" fill="var(--ink-2)" style={mono}>40 t truck</text>
      </g>
      {Array.from({ length: 6 }, (_, i) => <circle key={i} data-flow r="3.5" fill="var(--accent)" />)}
      <text x={TOWERS[0] - 14} y={TOP - 18} textAnchor="end" fill="var(--ink-2)" style={mono}>tower</text>
      <text data-part="cable" x={TOWERS[0] + 60} y={cableY(TOWERS[0] + 60) - 14} fill="var(--ink-2)" style={mono}>main cable</text>
      <text x={ANCHORS[0]} y={GROUND + 24} fill="var(--ink-2)" style={mono}>anchorage</text>
      <text data-part="deck" x={(TOWERS[1] + ANCHORS[1]) / 2} y={DECK + 22} textAnchor="middle" fill="var(--ink-2)" style={mono}>deck</text>
    </svg>
  );
}
