import { useState } from "react";

const MAX_OPEN_DEPTH = 1;

function Leaf({ v }: { v: unknown }) {
  if (v === null) return <span className="j-null">null</span>;
  if (typeof v === "string") return <span className="j-str">"{v}"</span>;
  if (typeof v === "number") return <span className="j-num">{String(v)}</span>;
  if (typeof v === "boolean") return <span className="j-bool">{String(v)}</span>;
  return <span>{String(v)}</span>;
}

function Node({ k, v, depth }: { k?: string; v: unknown; depth: number }) {
  const [open, setOpen] = useState(depth <= MAX_OPEN_DEPTH);
  const key = k !== undefined && <span className="j-key">{k}: </span>;
  if (v === null || typeof v !== "object") return <div className="j-row">{key}<Leaf v={v} /></div>;
  const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v as Record<string, unknown>);
  const [o, c] = Array.isArray(v) ? ["[", "]"] : ["{", "}"];
  return (
    <div className="j-row">
      <button className="j-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`j-caret${open ? " open" : ""}`}>▸</span>{key}{o}{!open && <span className="j-more">{entries.length} {entries.length === 1 ? "entry" : "entries"}</span>}{!open && c}
      </button>
      {open && (
        <>
          <div className="j-children">{entries.map(([ck, cv]) => <Node key={ck} k={Array.isArray(v) ? undefined : ck} v={cv} depth={depth + 1} />)}</div>
          <div>{c}</div>
        </>
      )}
    </div>
  );
}

export function Json({ value }: { value: unknown }) {
  return <div className="json"><Node v={value} depth={0} /></div>;
}
