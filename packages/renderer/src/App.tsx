import { useEffect, useMemo, useReducer, useState } from "react";
import { fillPlaceholders } from "./format.ts";
import { Grid } from "./components/Grid.tsx";
import { reduce, type RenderState } from "./store.ts";
import { connect } from "./ws.ts";

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleTimeString();
};

export function App() {
  const [renders, dispatch] = useReducer(reduce, {} as Record<string, RenderState>);
  const [up, setUp] = useState(false);
  const [picked, setPicked] = useState<string | undefined>(() => location.hash.slice(1) || undefined);

  useEffect(() => connect(dispatch, setUp), []);
  useEffect(() => {
    const onHash = () => setPicked(location.hash.slice(1) || undefined);
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const list = useMemo(() => Object.values(renders).sort((a, b) => b.startedAt - a.startedAt), [renders]);
  // Follow the newest render unless the user picked one that still exists.
  const current = (picked && renders[picked]) || list[0];

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className={`dot${up ? " up" : ""}`} title={up ? "connected" : "disconnected"} />genui</div>
        <ul className="hist">
          {list.map((r) => (
            <li key={r.id}>
              <button className={r === current ? "sel" : ""} onClick={() => { location.hash = r.id; setPicked(r.id); }}>
                <div className="t">{r.title ?? "Rendering…"}</div>
                <div className="s">{r.done ? ago(r.startedAt) : "streaming…"}{r.cached ? " · cached" : ""}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main>
        {!current ? (
          <div className="empty">Waiting for a render. Run <code>genui render file.csv</code>.</div>
        ) : (
          <>
            <h1>{current.title ?? "Rendering…"}</h1>
            {current.summary && <p className="summary">{fillPlaceholders(current.summary, current.results)}</p>}
            <Grid items={current.items} results={current.results} />
            {current.errors.length > 0 && <div className="errors">{current.errors.map((e, i) => <div key={i}>{e}</div>)}</div>}
            {current.timings && (
              <div className="footer">
                {Object.entries(current.timings).map(([k, v]) => `${k} ${v} ms`).join(" · ")}
                {current.cached ? " · from cache" : ""}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
