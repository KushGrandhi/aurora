import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { flushSync } from "react-dom";
import type { RenderEvent } from "@genui/spec";
import { fillPlaceholders } from "./format.ts";
import { Grid } from "./components/Grid.tsx";
import { reduce, type RenderState } from "./store.ts";
import type { Mode } from "./theme.ts";
import { connect } from "./ws.ts";

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString();
};
const secs = (ms?: number) => (ms === undefined ? "" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

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

function statusText(r: RenderState, provider: string): string {
  if (r.done) return r.cached ? `Ready instantly from cache` : `Composed in ${secs(r.timings?.total)}`;
  const panels = r.items.filter((i) => !i.id.startsWith("d_")).length;
  if (panels > 0) return `Composing with ${provider} · ${panels} panel${panels === 1 ? "" : "s"} so far`;
  if (r.items.length > 0) return `Composing a view with ${provider}…`;
  return "Reading and profiling your data…";
}

export function App() {
  const [renders, rawDispatch] = useReducer(reduce, {} as Record<string, RenderState>);
  const [up, setUp] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(() => location.hash.slice(1) || undefined);
  const [provider, setProvider] = useState("the model");
  const [mode, toggleMode] = useMode();

  // Layout-changing events morph via View Transitions; data-only events apply directly.
  const dispatch = useCallback((e: RenderEvent) => {
    const morph = (e.t === "item" || e.t === "default") && "startViewTransition" in document && !document.hidden;
    if (morph) (document as unknown as { startViewTransition(cb: () => void): void }).startViewTransition(() => flushSync(() => rawDispatch(e)));
    else rawDispatch(e);
  }, []);

  useEffect(() => connect(dispatch, setUp), [dispatch]);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => setProvider(String(h.provider ?? "").replace(/^ollama:/, "") || "the model")).catch(() => {});
    const onHash = () => setPicked(location.hash.slice(1) || undefined);
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const list = useMemo(() => Object.values(renders).sort((a, b) => b.startedAt - a.startedAt), [renders]);
  const current = (picked && renders[picked]) || list[0];

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="mark" />genui<span className={`conn${up ? " up" : ""}`} title={up ? "connected" : "reconnecting"} /></div>
        {list.length > 0 && <h2>Renders</h2>}
        <ul className="hist">
          {list.map((r) => (
            <li key={r.id}>
              <button className={r === current ? "sel" : ""} onClick={() => { location.hash = r.id; setPicked(r.id); }}>
                <div className="t">{r.title ?? "Rendering…"}</div>
                <div className="s">{!r.done && <span className="live-dot" />}{r.done ? ago(r.startedAt) : "live"}{r.cached ? " · cached" : ""}</div>
              </button>
            </li>
          ))}
        </ul>
        <button className="theme-toggle" onClick={toggleMode}>{mode === "dark" ? "☀︎ Light" : "☾ Dark"}</button>
      </aside>
      <main>
        <div className="page">
          {!current ? (
            <div className="empty">
              <div><div className="big">Nothing on screen yet</div>
              <p>Hand genui some data and a view will build itself here.</p>
              <code>genui render data.csv --intent "what you want to see"</code></div>
            </div>
          ) : (
            <>
              <div className="status">{current.done ? <span className="ok" /> : <span className="spin" />}{statusText(current, provider)}</div>
              <h1>{current.title ?? "Building your view…"}</h1>
              {current.summary && <p className="summary">{fillPlaceholders(current.summary, current.results)}</p>}
              <Grid items={current.items} results={current.results} mode={mode} />
              {current.errors.length > 0 && <div className="errors">{current.errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
              {current.timings && (
                <div className="footer">
                  {Object.entries(current.timings).map(([k, v]) => <span key={k}>{k} {secs(v)}</span>)}
                  {current.cached && <span>from cache</span>}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
