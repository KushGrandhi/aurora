import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenMessage, View, ViewEvent, ViewItem } from "@aurora/spec";
import { fillPlaceholders } from "./format.ts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Section } from "./components/Section.tsx";
import { ENTER_EASE, MotionRoot, SPRING } from "./motion.tsx";
import { VersionStrip } from "./components/VersionStrip.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { Hero } from "./components/Hero.tsx";
import { FocusProvider } from "./focus.tsx";
import { PageView } from "./components/PageView.tsx";
import { ItemFrame } from "./components/ItemFrame.tsx";
import { Variants } from "./components/Variants.tsx";
import { itemProblem } from "./components/Section.tsx";
import { themeFor, type RenderCtx } from "./registry.tsx";
import { stageVars } from "./theme.ts";
import { fontHrefs, fontVars } from "./fonts.ts";
import { HomeLink, ViewsPage } from "./components/ViewsPage.tsx";
import { mergeReport, mergeWarnings, type Pending } from "./reports.ts";
import { emptyState, reduce, type State } from "./store.ts";
import type { Mode } from "./theme.ts";
import { connect, type Conn } from "./ws.ts";

const ago = (at: string) => {
  const s = Math.round((Date.now() - Date.parse(at)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(at).toLocaleTimeString();
};

function useMode(): [Mode, () => void] {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const stored = (() => { try { return localStorage.getItem("aurora-theme") as Mode | null; } catch { return null; } })();
  const [mode, setMode] = useState<Mode>(stored ?? (media.matches ? "dark" : "light"));
  useEffect(() => {
    const on = () => { if (!stored) setMode(media.matches ? "dark" : "light"); };
    media.addEventListener("change", on);
    return () => media.removeEventListener("change", on);
  }, []);
  const toggle = () => setMode((m) => {
    const next = m === "dark" ? "light" : "dark";
    try { localStorage.setItem("aurora-theme", next); } catch { /* private mode */ }
    return next;
  });
  return [mode, toggle];
}

/** Collects per-item render reports and design warnings, and sends one `rendered` message per view version (debounced). */
function useReports(send: (m: ScreenMessage) => void) {
  const pending = useRef(new Map<string, Pending & { timer?: number }>());
  const flush = useCallback((viewId: string, merged: Pending | undefined) => {
    if (!merged) return; // late report for an older version
    const prev = pending.current.get(viewId);
    if (prev && merged !== prev && prev.timer) clearTimeout(prev.timer);
    const q: Pending & { timer?: number } = merged;
    pending.current.set(viewId, q);
    if (q.timer) clearTimeout(q.timer);
    q.timer = window.setTimeout(() => {
      send({
        t: "rendered", viewId, version: q.version, ok: [...q.ok],
        failed: [...q.failed].map(([itemId, message]) => ({ itemId, message })),
        warnings: [...q.warnings].flatMap(([itemId, ms]) => ms.map((message) => ({ itemId, message }))),
      });
    }, 100);
  }, [send]);
  const report = useCallback((viewId: string, version: number, itemId: string, ok: boolean, message?: string, retract?: boolean) =>
    flush(viewId, mergeReport(pending.current.get(viewId), version, itemId, ok, message, retract)), [flush]);
  const warn = useCallback((viewId: string, version: number, itemId: string, messages: string[]) =>
    flush(viewId, mergeWarnings(pending.current.get(viewId), version, itemId, messages)), [flush]);
  return { report, warn };
}

export function App() {
  const [state, setState] = useState<State>(emptyState);
  const stateRef = useRef(state);
  const conn = useRef<Conn>();
  const [up, setUp] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(() => location.hash.slice(1) || undefined);
  // #/views is the list of every view; any other hash is a view, shown on the whole screen.
  const onViews = picked === "/views";
  const [preview, setPreview] = useState<{ viewId: string; version: number; view: View }>();
  const [opened, setOpened] = useState<string>(); // design item opened as the whole screen
  const [variantsClosed, setVariantsClosed] = useState<string>(); // key of the variants set the person dismissed
  const [compare, setCompare] = useState<{ viewId: string; items: { label: string; view: View; version: number }[] }>();
  const [chosenMode, toggleMode] = useMode();
  const reduced = useReducedMotion() ?? false;

  const send = useCallback((m: ScreenMessage) => conn.current?.send(m), []);
  const { report, warn } = useReports(send);
  const onEvent = useCallback((e: ViewEvent) => {
    const r = reduce(stateRef.current, e);
    stateRef.current = r.state;
    setState(r.state);
    if (r.reload) return location.reload(); // the server now serves a newer screen
    if (r.need) send(r.need);
    if (r.follow) {
      location.hash = r.follow;
      setPicked(r.follow);
      setPreview(undefined);
    }
  }, [send]);

  useEffect(() => {
    conn.current = connect(onEvent, setUp);
    return () => conn.current?.close();
  }, [onEvent]);
  useEffect(() => {
    const onHash = () => { setPicked(location.hash.slice(1) || undefined); setPreview(undefined); };
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const list = state.list;
  const currentId = (picked && state.views[picked] ? picked : undefined) ?? list.find((l) => state.views[l.id])?.id;
  const live = currentId ? state.views[currentId] : undefined;
  const showing = preview && preview.viewId === currentId ? preview : undefined;
  const view = showing?.view ?? live?.view;
  const version = showing?.version ?? live?.version ?? 0;
  const results = (currentId && state.results[currentId]) || {};
  const activity = currentId ? state.activity[currentId] : undefined;
  const problems = showing ? [] : live?.problems ?? [];

  const choosePreview = useCallback((v: number | undefined) => {
    if (!currentId || v === undefined) return setPreview(undefined);
    fetch(`/api/views/${encodeURIComponent(currentId)}/versions/${v}`).then((r) => r.json()).then((e) => setPreview({ viewId: currentId, version: v, view: e.view })).catch(() => {});
  }, [currentId]);

  const heroId = useMemo(() => {
    const first = view?.sections[0];
    if (!first || first.layout !== "grid") return undefined;
    const k = first.items.find((i) => i.c.type === "kpi");
    return k && (k.span ?? 12) >= 4 ? k.id : undefined;
  }, [view]);
  const media = (currentId && state.media[currentId]) || undefined;
  // The list of views is aurora's own page: the house look, not the last view's.
  const palette = onViews ? undefined : view?.palette;
  const paletteKey = JSON.stringify(palette ?? null);
  const fonts = onViews ? undefined : view?.fonts;
  const fontsKey = JSON.stringify(fonts ?? null);
  const theme = useMemo(() => themeFor(chosenMode, palette, fonts), [chosenMode, paletteKey, fontsKey]);
  // The view's typefaces: their CSS from aurora's server, and the roles as variables on the whole document.
  useEffect(() => {
    const root = document.documentElement;
    for (const [k, v] of Object.entries(fontVars(fonts))) root.style.setProperty(k, v);
    const links = fontHrefs(fonts).map((href) => {
      const l = document.createElement("link");
      l.rel = "stylesheet"; l.href = href; l.dataset.viewFont = "";
      document.head.appendChild(l);
      return l;
    });
    return () => { for (const l of links) l.remove(); };
  }, [fontsKey]);
  // A view that sets its own page sets its own mode; otherwise the person's choice holds.
  const mode = theme.stage.mode;
  const ownStage = !!palette?.page;
  // The stage reaches the whole document (body, sidebar, portals), not just the app: the CSS variables and data-theme.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    for (const [k, v] of Object.entries(stageVars(theme.stage))) root.style.setProperty(k, v);
  }, [theme, mode]);
  const paramState = currentId ? state.params[currentId] : undefined;
  const setParam = useCallback((name: string, value: unknown) => { if (currentId && !showing) send({ t: "param", viewId: currentId, name, value }); }, [currentId, showing]);
  const ctxFor = useCallback((item: ViewItem, hero: boolean): RenderCtx => ({
    results, mode, theme, palette, fonts, hero, motion: { spring: SPRING, reduced },
    params: paramState?.values ?? {}, paramDefs: view?.params, paramOptions: paramState?.options ?? {}, setParam,
    media: (src) => media?.[src],
    send: (name, payload) => { if (currentId && !showing) send({ t: "event", viewId: currentId, itemId: item.id, name, payload }); },
    ...(item.c.type === "design" || item.c.type === "custom" ? { openPage: () => setOpened(item.id) } : {}),
    report: (ok, message, retract) => { if (currentId && !showing) report(currentId, version, item.id, ok, message, retract); },
    warn: (messages) => { if (currentId && !showing) warn(currentId, version, item.id, messages); },
  }), [results, mode, theme, palette, fonts, media, currentId, version, showing, report, warn, reduced, paramState, view?.params, setParam]);
  const params = paramState;
  // Params the prose already offers as inline controls (`{{name}}`) don't repeat in the filter row.
  const inProse = useMemo(() => new Set((view?.sections ?? []).flatMap((s) => s.items).flatMap((i) => i.c.type === "text" && typeof (i.c as { md?: unknown }).md === "string" ? [...((i.c as unknown as { md: string }).md.matchAll(/\{\{([A-Za-z_]\w*)\}\}/g))].map((m) => m[1]) : [])), [view]);
  const barParams = view?.params ? Object.fromEntries(Object.entries(view.params).filter(([n]) => !inProse.has(n))) : undefined;

  const viewProblems = problems.filter((p) => !p.itemId && p.severity !== "unverified");
  // Page display: a view whose only item is a design with display "page", or a design opened full screen.
  const allItems = view ? view.sections.flatMap((s) => s.items) : [];
  const only = allItems.length === 1 ? allItems[0] : undefined;
  // Immersive: the first item of the first section is a hero design. It becomes the first screen.
  const first = view?.sections[0];
  const heroItem = first && first.layout === "grid" && first.items[0] && (first.items[0].c.type === "design" || first.items[0].c.type === "custom") && first.items[0].c.display === "hero" ? first.items[0] : undefined;
  const pageItem = (opened && allItems.find((i) => i.id === opened)) || (only && (only.c.type === "design" || only.c.type === "custom") && only.c.display === "page" ? only : undefined);
  useEffect(() => setOpened(undefined), [currentId]);

  // Variants: caller-sent alternatives (pick one) or versions to compare (use one). Items inside never report.
  const pending = currentId ? state.variants[currentId] : undefined;
  const pendingKey = pending ? `${currentId}:${pending.baseVersion}:${pending.items.map((i) => i.label).join("|")}` : undefined;
  const showVariants = !!pending && variantsClosed !== pendingKey;
  const quietCtx = (item: ViewItem, hero: boolean): RenderCtx => ({ ...ctxFor(item, hero), report: () => {}, warn: () => {}, send: () => {}, openPage: undefined });
  // Each option is drawn on its own stage, so options that differ in colours look different.
  const renderVariant = (v: View, i: number) => {
    const vTheme = themeFor(chosenMode, v.palette, v.fonts);
    const vCtx = (item: ViewItem, hero: boolean): RenderCtx => ({ ...quietCtx(item, hero), theme: vTheme, mode: vTheme.stage.mode, palette: v.palette, fonts: v.fonts });
    const style = { ...stageVars(vTheme.stage), ...fontVars(v.fonts), background: "var(--page)", color: "var(--ink)", fontFamily: "var(--aurora-body)" } as React.CSSProperties;
    const items = v.sections.flatMap((s) => s.items);
    const one = items.length === 1 ? items[0] : undefined;
    if (one && (one.c.type === "design" || one.c.type === "custom") && one.c.display === "page")
      return { page: true, body: <div className="variant-page" style={style}><ItemFrame item={one} version={version} ctx={{ ...vCtx(one, false), page: { viewport: "desktop" } }} showTitle={false} /></div> };
    return { page: false, body: <div className="view-body" style={style}>{v.sections.map((s) => <Section key={s.id} section={s} version={version} problems={[]} ctxFor={vCtx} heroId={undefined} viewId={`variant${i}:${currentId}`} changed={{}} />)}</div> };
  };
  const openCompare = (vs: number[]) => {
    if (!currentId) return;
    const id = currentId;
    Promise.all(vs.map((v) => fetch(`/api/views/${encodeURIComponent(id)}/versions/${v}`).then((r) => r.json()).then((e) => ({ label: `v${v}`, view: e.view as View, version: v }))))
      .then((items) => setCompare({ viewId: id, items }))
      .catch(() => {});
  };
  const reopen = pending && !showVariants ? <button className="variants-open" onClick={() => setVariantsClosed(undefined)}>{pending.items.length} options</button> : null;
  // A first section that held only the hero has nothing left to show once the hero leads the page.
  const heroOnly = (i: number) => i === 0 && !!heroItem && view!.sections[0].items.length <= 1;
  // Titled sections are numbered in reading order (01, 02, …).
  const numbers = useMemo(() => {
    let n = 0;
    return (view?.sections ?? []).map((s, i) => (s.title && !heroOnly(i) ? ++n : undefined));
  }, [view, heroItem]);
  const filters = (variant?: "pill") => barParams && Object.keys(barParams).length > 0 && currentId ? (
    <FilterBar variant={variant} params={barParams} values={params?.values ?? {}} options={params?.options ?? {}} onChange={(name, value) => send({ t: "param", viewId: currentId, name, value })} />
  ) : undefined;
  const status = activity || (live ? `v${live.version} · ${live.source === "screen" ? "chosen on screen" : `from ${live.source}`}` : "");

  const themeToggle = <button className="theme-toggle" onClick={toggleMode} disabled={ownStage} title={ownStage ? "This view sets its own colours" : undefined}>{mode === "dark" ? "☀︎ Light" : "☾ Dark"}</button>;

  return (
    <MotionRoot>
    <FocusProvider resetKey={currentId}>
    {onViews ? (
      <ViewsPage list={list} activity={state.activity} currentId={currentId} up={up} ago={ago}
        themeToggle={themeToggle} />
    ) : (
    <div className={`app${pageItem ? " page-mode" : heroItem ? " immersive" : ""}`} >
      <main>
        {pageItem && view && currentId ? (
          <PageView
            key={`${currentId}:${pageItem.id}`}
            item={pageItem}
            version={version}
            changedAt={(showing ? {} : live?.changed ?? {})[pageItem.id]}
            ctx={ctxFor(pageItem, false)}
            problem={itemProblem(problems, pageItem.id)}
            title={view.title}
            versions={<>{reopen}<VersionStrip viewId={currentId} version={live?.version ?? version} previewing={showing?.version} onPreview={choosePreview} onCompare={openCompare} /></>}
            onExit={opened ? () => setOpened(undefined) : undefined}
            home={<HomeLink up={up} />}
          />
        ) : (
        <div className="page">
          {!view || !currentId ? (
            <div className="empty">
              <HomeLink up={up} />
              <div><div className="big">Nothing on screen yet</div>
              <p>Ask your assistant to show something with aurora, and it will build itself here.</p></div>
            </div>
          ) : (
            <>
              {heroItem && (
                <Hero key={`hero:${currentId}`} item={heroItem} version={version} ctx={ctxFor(heroItem, false)} problems={problems} changed={showing ? {} : live?.changed ?? {}}
                  title={view.title} summary={view.summary ? fillPlaceholders(view.summary, results) : undefined}
                  status={<div className="status-row"><HomeLink up={up} /><div className="status">{activity ? <span className="spin" /> : <span className="ok" />}{status}</div></div>}
                  versions={<div className="topbar-right">{reopen}{themeToggle}<VersionStrip viewId={currentId} version={live?.version ?? version} previewing={showing?.version} onPreview={choosePreview} onCompare={openCompare} /></div>}
                  filters={filters("pill")} />
              )}
              {!heroItem && <div className="topbar">
                <div className="status-row"><HomeLink up={up} /><div className="status">{activity ? <span className="spin" /> : <span className="ok" />}{status}</div></div>
                <div className="topbar-right">{reopen}{themeToggle}<VersionStrip viewId={currentId} version={live?.version ?? version} previewing={showing?.version} onPreview={choosePreview} onCompare={openCompare} /></div>
              </div>}
              {showing && (
                <div className="preview-banner">
                  <span>Viewing v{showing.version} (read-only)</span>
                  <button className="primary" onClick={() => { send({ t: "pick", viewId: currentId, version: showing.version }); setPreview(undefined); }}>Use this version</button>
                  <button onClick={() => setPreview(undefined)}>Back to current</button>
                </div>
              )}
              {!heroItem && <motion.div key={`head:${currentId}`} className="view-head" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: ENTER_EASE }}>
                <h1>{view.title}</h1>
                {view.summary && <p className="summary">{fillPlaceholders(view.summary, results)}</p>}
              </motion.div>}
              {!heroItem && filters()}
              <div key={currentId} className="view-body">{/* a different view is a fresh mount, even when ids repeat */}
                {view.sections.map((s, i) => i === 0 && heroItem ? (!heroOnly(0) ? <Section key={s.id} leads={false} order={i} number={numbers[i]} section={{ ...s, items: s.items.slice(1) }} version={version} problems={problems} ctxFor={ctxFor} heroId={heroId} viewId={currentId} changed={showing ? {} : live?.changed ?? {}} /> : null) : (
                  <Section key={s.id} leads={i === 0} order={i} number={numbers[i]} section={s} version={version} problems={problems} ctxFor={ctxFor} heroId={heroId} viewId={currentId} changed={showing ? {} : live?.changed ?? {}} />
                ))}
              </div>
              {viewProblems.length > 0 && <div className="errors">{viewProblems.map((p, i) => <div key={i}>{p.message}</div>)}</div>}
            </>
          )}
        </div>
        )}
      </main>
    </div>
    )}
    <AnimatePresence>
      {showVariants && pending && currentId && (
        <Variants key={pendingKey} title="Choose an option" items={pending.items} chooseLabel="Choose" render={renderVariant}
          onChoose={(index) => send({ t: "pickVariant", viewId: currentId, index })} onClose={() => setVariantsClosed(pendingKey)} />
      )}
      {compare && compare.viewId === currentId && !showVariants && (
        <Variants key="compare" title="Compare versions" items={compare.items} chooseLabel="Use this version" render={renderVariant}
          onChoose={(i) => { send({ t: "pick", viewId: compare.viewId, version: compare.items[i].version }); setCompare(undefined); }} onClose={() => setCompare(undefined)} />
      )}
    </AnimatePresence>
    </FocusProvider>
    </MotionRoot>
  );
}
