import { Component as ReactComponent, useEffect, useMemo, type ReactNode } from "react";
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

export function ItemFrame({ item, version, ctx, problem, showTitle }: {
  item: ViewItem; version: number; ctx: RenderCtx; problem?: Problem; showTitle: boolean;
}) {
  const R = rendererFor(item.c.type);
  const ready = useMemo(() => needs(item).every((q) => ctx.results[q]), [item, ctx.results]);
  const reason = problem?.message ?? (R ? undefined : `no renderer for "${item.c.type}" on this screen`);

  // Report once per version: shown fallbacks count as rendered (the caller already has the problem); self-reporting
  // components report when their engine finishes.
  useEffect(() => {
    if (problem) ctx.report(true);
    else if (!R) ctx.report(false, reason);
    else if (ready && !R.selfReport) ctx.report(true);
  }, [version, ready, problem?.message, R]);

  let body: ReactNode;
  if (reason) body = <FallbackCard reason={reason} />;
  else if (!ready) body = <div className="skeleton" />;
  else if (R) body = <Boundary key={version} onError={(m) => ctx.report(false, m)}><R c={item.c} ctx={ctx} /></Boundary>;
  return (
    <>
      {showTitle && item.title && <div className="card-title">{item.title}</div>}
      {body}
    </>
  );
}
