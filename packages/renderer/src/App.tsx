import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScreenMessage, View, ViewEvent, ViewItem } from "@genui/spec";
import { fillPlaceholders } from "./format.ts";
import { useReducedMotion } from "motion/react";
import { Section } from "./components/Section.tsx";
import { MotionRoot, SPRING } from "./motion.tsx";
import { VersionStrip } from "./components/VersionStrip.tsx";
import { FilterBar } from "./components/FilterBar.tsx";
import { themeFor, type RenderCtx } from "./registry.tsx";
import { mergeReport, type Pending } from "./reports.ts";
import { emptyState, reduce, type State } from "./store.ts";
import type { Mode } from "./theme.ts";
import { connect, type Conn } from "./ws.ts";

const ago = (at: string) => {
  const s = Math.round((Date.now() - Date.parse(at)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(at).toLocaleTimeString();
};

function useMode(): [Mode, () => void] {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const stored = (() => { try { return localStorage.getItem("genui-theme") as Mode | null; } catch { return null; } })();
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
    try { localStorage.setItem("genui-theme", next); } catch { /* private mode */ }
    return next;
  });
  return [mode, toggle];
}

/** Collects per-item render reports and sends one `rendered` message per view version (debounced). */
function useReports(send: (m: ScreenMessage) => void) {
  const pending = useRef(new Map<string, Pending & { timer?: number }>());
  return useCallback((viewId: string, version: number, itemId: string, ok: boolean, message?: string) => {
    const prev = pending.current.get(viewId);
    const merged = mergeReport(prev, version, itemId, ok, message);
    if (!merged) return; // late report for an older version
    if (prev && merged !== prev && prev.timer) clearTimeout(prev.timer);
    const q: Pending & { timer?: number } = merged;
    pending.current.set(viewId, q);
    if (q.timer) clearTimeout(q.timer);
    q.timer = window.setTimeout(() => {
      send({ t: "rendered", viewId, version: q.version, ok: [...q.ok], failed: [...q.failed].map(([itemId, message]) => ({ itemId, message })) });
    }, 100);
  }, [send]);
}

export function App() {
  const [state, setState] = useState<State>(emptyState);
  const stateRef = useRef(state);
  const conn = useRef<Conn>();
  const [up, setUp] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(() => location.hash.slice(1) || undefined);
  const [preview, setPreview] = useState<{ viewId: string; version: number; view: View }>();
  const [mode, toggleMode] = useMode();
  const reduced = useReducedMotion() ?? false;

  const send = useCallback((m: ScreenMessage) => conn.current?.send(m), []);
  const report = useReports(send);
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
    report: (ok, message) => { if (currentId && !showing) report(currentId, version, item.id, ok, message); },
  }), [results, mode, theme, media, currentId, version, showing, report, reduced]);
  const params = currentId ? state.params[currentId] : undefined;

  const viewProblems = problems.filter((p) => !p.itemId && p.severity !== "unverified");
  const status = activity || (live ? `v${live.version} · ${live.source === "screen" ? "chosen on screen" : `from ${live.source}`}` : "");

  return (
    <MotionRoot>
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="mark" />genui<span className={`conn${up ? " up" : ""}`} title={up ? "connected" : "reconnecting"} /></div>
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
        <div className="page">
          {!view || !currentId ? (
            <div className="empty">
              <div><div className="big">Nothing on screen yet</div>
              <p>Ask your assistant to show something with genui, and it will build itself here.</p></div>
            </div>
          ) : (
            <>
              <div className="topbar">
                <div className="status">{activity ? <span className="spin" /> : <span className="ok" />}{status}</div>
                <VersionStrip viewId={currentId} version={live?.version ?? version} previewing={showing?.version} onPreview={choosePreview} />
              </div>
              {showing && (
                <div className="preview-banner">
                  <span>Viewing v{showing.version} (read-only)</span>
                  <button className="primary" onClick={() => { send({ t: "pick", viewId: currentId, version: showing.version }); setPreview(undefined); }}>Use this version</button>
                  <button onClick={() => setPreview(undefined)}>Back to current</button>
                </div>
              )}
              <h1>{view.title}</h1>
              {view.summary && <p className="summary">{fillPlaceholders(view.summary, results)}</p>}
              {view.params && Object.keys(view.params).length > 0 && (
                <FilterBar params={view.params} values={params?.values ?? {}} options={params?.options ?? {}} onChange={(name, value) => send({ t: "param", viewId: currentId, name, value })} />
              )}
              <div key={currentId} className="view-body">{/* a different view is a fresh mount, even when ids repeat */}
                {view.sections.map((s) => (
                  <Section key={s.id} section={s} version={version} problems={problems} ctxFor={ctxFor} heroId={heroId} viewId={currentId} changed={showing ? {} : live?.changed ?? {}} />
                ))}
              </div>
              {viewProblems.length > 0 && <div className="errors">{viewProblems.map((p, i) => <div key={i}>{p.message}</div>)}</div>}
            </>
          )}
        </div>
      </main>
    </div>
    </MotionRoot>
  );
}
