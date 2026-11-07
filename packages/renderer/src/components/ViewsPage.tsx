import type { ListEntry } from "@aurora/spec";

/** The way back to every view: aurora's mark (with the connection dot), in a corner of each view. */
export function HomeLink({ up }: { up: boolean }) {
  return (
    <a className="home-link" href="#/views" title="All views" aria-label="All views">
      <span className="mark" /><span className={`conn${up ? " up" : ""}`} title={up ? "connected" : "reconnecting"} />
    </a>
  );
}

/**
 * Every view, on a page of its own (#/views): each view gets the whole screen, so the list lives here instead of
 * beside it. Opening one goes to #<id>.
 */
export function ViewsPage({ list, activity, currentId, up, ago, themeToggle }: {
  list: ListEntry[]; activity: Record<string, string | undefined>; currentId?: string; up: boolean; ago(at: string): string; themeToggle: React.ReactNode;
}) {
  return (
    <div className="views-page">
      <header className="views-head">
        <div className="brand"><span className="mark" />aurora<span className={`conn${up ? " up" : ""}`} title={up ? "connected" : "reconnecting"} /></div>
        {themeToggle}
      </header>
      <h1 className="views-title">Views</h1>
      {list.length === 0 ? (
        <p className="views-empty">Nothing yet. Ask your assistant to show something with aurora, and it will appear here.</p>
      ) : (
        <ul className="views-list">
          {list.map((l) => (
            <li key={l.id}>
              <a href={`#${l.id}`} className={l.id === currentId ? "sel" : ""} data-view={l.id}>
                <span className="t">{l.title}</span>
                <span className="s">{activity[l.id] && <span className="live-dot" />}{activity[l.id] ? "live" : ago(l.at)} · v{l.version}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
