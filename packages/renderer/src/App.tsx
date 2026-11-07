import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenMessage, View, ViewEvent, ViewItem } from "@aurora/spec";
import { fillPlaceholders } from "./format.ts";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Section } from "./components/Section.tsx";
import { ENTER_EASE, MotionRoot, SPRING } from "./motion.tsx";
import { VersionStrip } from "./components/VersionStrip.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { PageView } from "./components/PageView.tsx";
import { ItemFrame } from "./components/ItemFrame.tsx";
import { Variants } from "./components/Variants.tsx";
import { itemProblem } from "./components/Section.tsx";
import { themeFor, type RenderCtx } from "./registry.tsx";
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
    document.documentElement.dataset.theme = mode;
  }, [mode]);
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
  const [preview, setPreview] = useState<{ viewId: string; version: number; view: View }>();
  const [opened, setOpened] = useState<string>(); // design item opened as the whole screen
  const [variantsClosed, setVariantsClosed] = useState<string>(); // key of the variants set the person dismissed
  const [compare, setCompare] = useState<{ viewId: string; items: { label: string; view: View; version: number }[] }>();
  const [mode, toggleMode] = useMode();
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
  const theme = useMemo(() => themeFor(mode), [mode]);
  const ctxFor = useCallback((item: ViewItem, hero: boolean): RenderCtx => ({
    results, mode, theme, hero, motion: { spring: SPRING, reduced },
    media: (src) => media?.[src],
    send: (name, payload) => { if (currentId && !showing) send({ t: "event", viewId: currentId, itemId: item.id, name, payload }); },
    ...(item.c.type === "design" || item.c.type === "custom" ? { openPage: () => setOpened(item.id) } : {}),
    report: (ok, message, retract) => { if (currentId && !showing) report(currentId, version, item.id, ok, message, retract); },
    warn: (messages) => { if (currentId && !showing) warn(currentId, version, item.id, messages); },
  }), [results, mode, theme, media, currentId, version, showing, report, warn, reduced]);
  const params = currentId ? state.params[currentId] : undefined;

  const viewProblems = problems.filter((p) => !p.itemId && p.severity !== "unverified");
  // Page display: a view whose only item is a design with display "page", or a design opened full screen.
  const allItems = view ? view.sections.flatMap((s) => s.items) : [];
  const only = allItems.length === 1 ? allItems[0] : undefined;
  const pageItem = (opened && allItems.find((i) => i.id === opened)) || (only && (only.c.type === "design" || only.c.type === "custom") && only.c.display === "page" ? only : undefined);
  useEffect(() => setOpened(undefined), [currentId]);

  // Variants: caller-sent alternatives (pick one) or versions to compare (use one). Items inside never report.
  const pending = currentId ? state.variants[currentId] : undefined;
  const pendingKey = pending ? `${currentId}:${pending.baseVersion}:${pending.items.map((i) => i.label).join("|")}` : undefined;
  const showVariants = !!pending && variantsClosed !== pendingKey;
  const quietCtx = (item: ViewItem, hero: boolean): RenderCtx => ({ ...ctxFor(item, hero), report: () => {}, send: () => {}, openPage: undefined });
  const renderVariant = (v: View, i: number) => {
    const items = v.sections.flatMap((s) => s.items);
    const one = items.length === 1 ? items[0] : undefined;
    if (one && (one.c.type === "design" || one.c.type === "custom") && one.c.display === "page")
      return { page: true, body: <div className="variant-page"><ItemFrame item={one} version={version} ctx={{ ...quietCtx(one, false), page: { viewport: "desktop" } }} showTitle={false} /></div> };
    return { page: false, body: <div className="view-body">{v.sections.map((s) => <Section key={s.id} section={s} version={version} problems={[]} ctxFor={quietCtx} heroId={undefined} viewId={`variant${i}:${currentId}`} changed={{}} />)}</div> };
  };
  const openCompare = (vs: number[]) => {
    if (!currentId) return;
    const id = currentId;
    Promise.all(vs.map((v) => fetch(`/api/views/${encodeURIComponent(id)}/versions/${v}`).then((r) => r.json()).then((e) => ({ label: `v${v}`, view: e.view as View, version: v }))))
      .then((items) => setCompare({ viewId: id, items }))
      .catch(() => {});
  };
  const reopen = pending && !showVariants ? <button className="variants-open" onClick={() => setVariantsClosed(undefined)}>{pending.items.length} options</button> : null;
  const status = activity || (live ? `v${live.version} · ${live.source === "screen" ? "chosen on screen" : `from ${live.source}`}` : "");

  return (
    <MotionRoot>
    <div className={`app${pageItem ? " page-mode" : ""}`}>
      <aside className="side">
        <div className="brand"><span className="mark" />aurora<span className={`conn${up ? " up" : ""}`} title={up ? "connected" : "reconnecting"} /></div>
        {list.length > 0 && <h2>Views</h2>}
        <ul className="hist">
          {list.map((l) => (
            <li key={l.id}>
              <button className={l.id === currentId ? "sel" : ""} onClick={() => { location.hash = l.id; setPicked(l.id); setPreview(undefined); }}>
                <div className="t">{l.title}</div>
                <div className="s">{state.activity[l.id] && <span className="live-dot" />}{state.activity[l.id] ? "live" : ago(l.at)} · v{l.version}</div>
              </button>
            </li>
          ))}
        </ul>
        <button className="theme-toggle" onClick={toggleMode}>{mode === "dark" ? "☀︎ Light" : "☾ Dark"}</button>
      </aside>
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
          />
        ) : (
        <div className="page">
          {!view || !currentId ? (
            <div className="empty">
              <div><div className="big">Nothing on screen yet</div>
              <p>Ask your assistant to show something with aurora, and it will build itself here.</p></div>
            </div>
          ) : (
            <>
              <div className="topbar">
                <div className="status">{activity ? <span className="spin" /> : <span className="ok" />}{status}</div>
                <div className="topbar-right">{reopen}<VersionStrip viewId={currentId} version={live?.version ?? version} previewing={showing?.version} onPreview={choosePreview} onCompare={openCompare} /></div>
              </div>
              {showing && (
                <div className="preview-banner">
                  <span>Viewing v{showing.version} (read-only)</span>
                  <button className="primary" onClick={() => { send({ t: "pick", viewId: currentId, version: showing.version }); setPreview(undefined); }}>Use this version</button>
                  <button onClick={() => setPreview(undefined)}>Back to current</button>
                </div>
              )}
              <motion.div key={`head:${currentId}`} className="view-head" initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: ENTER_EASE }}>
                <h1>{view.title}</h1>
                {view.summary && <p className="summary">{fillPlaceholders(view.summary, results)}</p>}
              </motion.div>
              {view.params && Object.keys(view.params).length > 0 && (
                <FilterBar params={view.params} values={params?.values ?? {}} options={params?.options ?? {}} onChange={(name, value) => send({ t: "param", viewId: currentId, name, value })} />
              )}
              <div key={currentId} className="view-body">{/* a different view is a fresh mount, even when ids repeat */}
                {view.sections.map((s, i) => (
                  <Section key={s.id} leads={i === 0} order={i} section={s} version={version} problems={problems} ctxFor={ctxFor} heroId={heroId} viewId={currentId} changed={showing ? {} : live?.changed ?? {}} />
                ))}
              </div>
              {viewProblems.length > 0 && <div className="errors">{viewProblems.map((p, i) => <div key={i}>{p.message}</div>)}</div>}
            </>
          )}
        </div>
        )}
      </main>
    </div>
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
    </MotionRoot>
  );
}
