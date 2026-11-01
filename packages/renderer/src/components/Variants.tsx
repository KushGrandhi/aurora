import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import type { View } from "@aurora/spec";
import { SPRING, STAGGER_S } from "../motion.tsx";
import { useWidth } from "../useWidth.ts";

const DESIGN_WIDTH = 1280;
const PAGE_HEIGHT = 800;

/** Lays a view out at desktop width and scales it down to fit its column, so each option is seen as it will look. */
function VariantFrame({ children, page }: { children: ReactNode; page: boolean }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const inner = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(page ? PAGE_HEIGHT : 600);
  useLayoutEffect(() => {
    if (page || !inner.current) return;
    const el = inner.current;
    const ro = new ResizeObserver(() => setH(el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);
  const scale = width > 0 ? Math.min(1, width / DESIGN_WIDTH) : 0.3;
  return (
    <div ref={box} className="variant-frame" style={{ height: h * scale }}>
      <div ref={inner} className="variant-inner" style={{ width: DESIGN_WIDTH, height: page ? PAGE_HEIGHT : undefined, transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}

/** 2–3 options side by side (caller-sent variants, or versions to compare); choosing one makes it current. */
export function Variants({ title, items, chooseLabel, onChoose, onClose, render }: {
  title: string;
  items: { label: string; view: View }[];
  chooseLabel: string;
  onChoose(index: number): void;
  onClose(): void;
  render(view: View, index: number): { body: ReactNode; page: boolean };
}) {
  const [zoom, setZoom] = useState<number>();
  const [chosen, setChosen] = useState<number>();
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoom !== undefined) setZoom(undefined);
      else onClose();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [zoom, onClose]);

  return (
    <motion.div className="variants" role="dialog" aria-label={title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="variants-head">
        <h2>{title}</h2>
        <button className="variants-close" onClick={onClose} aria-label="Close (Esc)"><X size={16} /></button>
      </div>
      <div className={`variants-grid n${items.length}${zoom !== undefined ? " zoomed" : ""}`}>
        {items.map((it, i) => {
          const { body, page } = render(it.view, i);
          if (zoom !== undefined && zoom !== i) return null;
          return (
            <motion.section key={i} className="variant" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: i * STAGGER_S }}>
              <div className="variant-top">
                <span className="variant-label">{it.label}</span>
                <button className="zoom" onClick={() => setZoom(zoom === i ? undefined : i)}>{zoom === i ? "Back" : "Zoom"}</button>
                <button className="choose primary" disabled={chosen !== undefined} onClick={() => { setChosen(i); onChoose(i); }}>{chosen === i ? "Choosing…" : chooseLabel}</button>
              </div>
              <VariantFrame page={page}>{body}</VariantFrame>
            </motion.section>
          );
        })}
      </div>
    </motion.div>
  );
}
