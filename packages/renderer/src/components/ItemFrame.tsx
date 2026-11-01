import { Component as ReactComponent, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getComponent, parsePlaceholders, type Problem, type ViewItem } from "@genui/spec";
import { rendererFor, type RenderCtx } from "../registry.tsx";
import { FallbackCard } from "./FallbackCard.tsx";

class Boundary extends ReactComponent<{ onError(message: string): void; children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { error: String((e as Error)?.message ?? e) };
  }
  componentDidCatch(e: unknown) {
    this.props.onError(String((e as Error)?.message ?? e));
  }
  render() {
    return this.state.error ? <FallbackCard reason={this.state.error} /> : this.props.children;
  }
}

/** Queries an item needs before it can draw: its bound queries plus queries named in placeholders. */
function needs(item: ViewItem): string[] {
  const def = getComponent(item.c.type);
  if (!def) return [];
  const bound = def.dataBound?.(item.c) ?? [];
  const prose = (def.placeholders?.(item.c) ?? []).flatMap((t) => parsePlaceholders(t).map((r) => r.queryId));
  return [...bound, ...prose];
}

export function ItemFrame({ item, version, changedAt = 0, ctx, problem, showTitle }: {
  item: ViewItem; version: number; changedAt?: number; ctx: RenderCtx; problem?: Problem; showTitle: boolean;
}) {
  const R = rendererFor(item.c.type);
  const ready = useMemo(() => needs(item).every((q) => ctx.results[q]), [item, ctx.results]);
  const reason = problem?.message ?? (R ? undefined : `no renderer for "${item.c.type}" on this screen`);
  // A self-reporting component that wasn't redrawn for this version (its content didn't change) won't report again:
  // remember its last word and repeat it for each new version.
  const last = useRef<{ at: number; ok: boolean; message?: string }>();
  const selfCtx = useMemo<RenderCtx>(() => ({
    ...ctx,
    report: (ok, message) => {
      last.current = { at: changedAt, ok, message };
      ctx.report(ok, message);
    },
  }), [ctx, changedAt]);

  // Report once per version: shown fallbacks count as rendered (the caller already has the problem); self-reporting
  // components report when their engine finishes.
  useEffect(() => {
    if (problem) ctx.report(true);
    else if (!R) ctx.report(false, reason);
    else if (ready && !R.selfReport) ctx.report(true);
    else if (ready && last.current?.at === changedAt) ctx.report(last.current.ok, last.current.message);
  }, [version, ready, problem?.message, R]);

  let body: ReactNode;
  if (reason) body = <FallbackCard reason={reason} />;
  else if (!ready) body = <div className="skeleton" />;
  else if (R) body = <Boundary key={changedAt} onError={(m) => ctx.report(false, m)}><Suspense fallback={<div className="skeleton" />}><R c={item.c} ctx={selfCtx} /></Suspense></Boundary>;
  // A different component type (a `replace`) crossfades; the card around it morphs size via its layout animation.
  const face = reason ? "fallback" : ready ? item.c.type : "loading";
  return (
    <>
      {showTitle && item.title && <div className="card-title">{item.title}</div>}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={face} className="face" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {body}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
