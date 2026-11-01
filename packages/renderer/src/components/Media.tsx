import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import type { Media as MediaC } from "@genui/spec";
import { SPRING, STAGGER_S } from "../motion.tsx";
import type { RenderCtx } from "../registry.tsx";

type Item = MediaC["items"][number];
const VIDEO = /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i;
const kindOf = (i: Item) => i.kind ?? (VIDEO.test(i.src) ? "video" : "image");
const base = (src: string) => src.split(/[\\/]/).pop() || src;

function Asset({ item, url, onFail, large }: { item: Item; url: string; onFail(): void; large?: boolean }) {
  return kindOf(item) === "video"
    ? <video src={url} controls={large} muted={!large} playsInline preload="metadata" onError={onFail} />
    : <img src={url} alt={item.alt ?? item.caption ?? ""} loading="lazy" onError={onFail} />;
}

function Missing({ src }: { src: string }) {
  return <div className="media-missing"><span>Not available</span><code>{base(src)}</code></div>;
}

function Lightbox({ items, at, url, onMove, onClose }: { items: Item[]; at: number; url(i: Item): string | undefined; onMove(d: number): void; onClose(): void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onMove(1);
      else if (e.key === "ArrowLeft") onMove(-1);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [onMove, onClose]);
  const item = items[at];
  const u = url(item);
  return createPortal(
    <motion.div className="lightbox" role="dialog" aria-modal="true" aria-label={item.caption ?? base(item.src)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.figure key={at} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={SPRING} onClick={(e) => e.stopPropagation()}>
        {u ? <Asset item={item} url={u} onFail={() => {}} large /> : <Missing src={item.src} />}
        {item.caption && <figcaption>{item.caption}</figcaption>}
      </motion.figure>
      {items.length > 1 && <div className="lb-count">{at + 1} / {items.length}</div>}
    </motion.div>,
    document.body,
  );
}

/** Existing images and videos: one large, or a gallery with a lightbox (arrow keys, Escape). */
export default function Media({ c, ctx }: { c: MediaC; ctx: RenderCtx }) {
  const [open, setOpen] = useState<number>();
  const url = useCallback((i: Item) => ctx.media(i.src), [ctx]);
  const fail = (src: string) => ctx.report(false, `media: could not load ${src}`);
  const move = useCallback((d: number) => setOpen((o) => (o === undefined ? o : (o + d + c.items.length) % c.items.length)), [c.items.length]);
  const close = useCallback(() => setOpen(undefined), []);
  const layout = c.layout ?? (c.items.length === 1 ? "single" : "gallery");

  if (layout === "single") {
    const item = c.items[0];
    const u = url(item);
    return (
      <figure className="media-single">
        {u ? <Asset item={item} url={u} onFail={() => fail(item.src)} large /> : <Missing src={item.src} />}
        {item.caption && <figcaption>{item.caption}</figcaption>}
      </figure>
    );
  }
  return (
    <>
      <div className="media-grid">
        {c.items.map((item, i) => {
          const u = url(item);
          return (
            <motion.figure key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: Math.min(i, 12) * STAGGER_S }}>
              <button className="thumb" onClick={() => setOpen(i)} aria-label={`Open ${item.caption ?? base(item.src)}`}>
                {u ? <Asset item={item} url={u} onFail={() => fail(item.src)} /> : <Missing src={item.src} />}
              </button>
              {item.caption && <figcaption>{item.caption}</figcaption>}
            </motion.figure>
          );
        })}
      </div>
      <AnimatePresence>{open !== undefined && <Lightbox items={c.items} at={open} url={url} onMove={move} onClose={close} />}</AnimatePresence>
    </>
  );
}
