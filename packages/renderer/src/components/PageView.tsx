import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Monitor, Smartphone, Tablet, X } from "lucide-react";
import type { Problem, ViewItem } from "@genui/spec";
import { SPRING } from "../motion.tsx";
import type { RenderCtx, Viewport } from "../registry.tsx";
import { ItemFrame } from "./ItemFrame.tsx";

const IDLE_MS = 2000;

/** A design shown as the whole screen: a floating glass bar (title, versions, viewport, exit) that hides when idle. */
export function PageView({ item, version, changedAt, ctx, problem, title, versions, onExit }: {
  item: ViewItem; version: number; changedAt?: number; ctx: RenderCtx; problem?: Problem; title: string; versions: ReactNode; onExit?: () => void;
}) {
  const initial = (item.c as { viewport?: Viewport }).viewport ?? "desktop";
  const [viewport, setViewport] = useState<Viewport>(initial);
  const [idle, setIdle] = useState(false);
  const timer = useRef<number>();
  const wake = () => {
    setIdle(false);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    wake();
    addEventListener("mousemove", wake);
    return () => { removeEventListener("mousemove", wake); clearTimeout(timer.current); };
  }, []);
  useEffect(() => {
    if (!onExit) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onExit(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onExit]);

  return (
    <motion.div className="page-view" data-item={item.id} data-type={item.c.type} initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING}>
      {/* Pointer moves over the design go to its frame, not here: a thin strip along the top brings the bar back. */}
      <div className={`page-hot${idle ? " live" : ""}`} onMouseEnter={wake} onMouseMove={wake} aria-hidden />
      <div className={`page-bar${idle ? " idle" : ""}`} onMouseEnter={wake} onMouseMove={wake}>
        <span className="page-title">{title}</span>
        {versions}
        <div className="viewports" role="group" aria-label="Viewport">
          {([["desktop", Monitor], ["tablet", Tablet], ["phone", Smartphone]] as const).map(([v, Icon]) => (
            <button key={v} data-viewport={v} className={viewport === v ? "sel" : ""} onClick={() => setViewport(v)} aria-label={v} title={v}><Icon size={14} /></button>
          ))}
        </div>
        {onExit && <button className="page-exit" onClick={onExit} aria-label="Exit full screen" title="Exit (Esc)"><X size={15} /></button>}
      </div>
      <div className="page-stage">
        <ItemFrame item={item} version={version} changedAt={changedAt} ctx={{ ...ctx, page: { viewport } }} problem={problem} showTitle={false} />
      </div>
    </motion.div>
  );
}
