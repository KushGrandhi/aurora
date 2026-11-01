import { useEffect, useState } from "react";

type Entry = { version: number; at: string; source: string; note?: string };

const when = (at: string) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** Current version, plus the history list: choosing a past version previews it; the App offers "Use this version". */
export function VersionStrip({ viewId, version, previewing, onPreview, onCompare }: { viewId: string; version: number; previewing?: number; onPreview(v: number | undefined): void; onCompare?(versions: number[]): void }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (v: number) => setPicked((p) => (p.includes(v) ? p.filter((x) => x !== v) : p.length >= 3 ? p : [...p, v].sort((a, b) => a - b)));
  const [history, setHistory] = useState<Entry[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch(`/api/views/${encodeURIComponent(viewId)}/history`).then((r) => r.json()).then((h: Entry[]) => setHistory([...h].reverse())).catch(() => {});
  }, [open, viewId, version]);
  return (
    <div className="versions">
      <button className="version-chip" onClick={() => setOpen(!open)} aria-expanded={open}>v{previewing ?? version}{previewing ? " (preview)" : ""} ▾</button>
      {open && (
        <ul className="version-list" role="listbox">
          {history.map((h) => (
            <li key={h.version} className="version-row">
              {onCompare && <input type="checkbox" data-compare={h.version} aria-label={`compare v${h.version}`} checked={picked.includes(h.version)} onChange={() => toggle(h.version)} />}
              <button className={h.version === (previewing ?? version) ? "sel" : ""} data-version={h.version}
                onClick={() => { onPreview(h.version === version ? undefined : h.version); setOpen(false); }}>
                <span className="vn">v{h.version}</span><span className="vs">{h.note ?? h.source}</span><span className="vt">{when(h.at)}</span>
              </button>
            </li>
          ))}
          {onCompare && picked.length >= 2 && (
            <li className="compare-row"><button className="compare primary" onClick={() => { onCompare(picked); setPicked([]); setOpen(false); }}>Compare {picked.length} versions</button></li>
          )}
        </ul>
      )}
    </div>
  );
}
