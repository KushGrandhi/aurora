import { useEffect, useRef, useState } from "react";
import type { Param } from "@aurora/spec";
import { formatValue } from "../format.ts";

/**
 * A control that sits inside a sentence, written `{{name}}` in a text item: a number the reader drags sideways (or
 * nudges with the arrow keys), or a choice shown as an underlined word. It sets the view's param, so queries,
 * charts and designs follow.
 */
export function ProseControl({ name, def, value, options, onChange }: { name: string; def: Param; value: unknown; options: string[]; onChange(v: unknown): void }) {
  if (def.type === "number") return <DragNumber name={name} def={def} value={typeof value === "number" ? value : def.default ?? def.min} onChange={onChange} />;
  if (def.type === "select") {
    const opts = Array.isArray(def.options) ? def.options : options;
    return (
      <span className="prose-choice" data-param={name}>
        <select aria-label={def.label} value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
          <option value="">any</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </span>
    );
  }
  return <span className="prose-value" data-param={name}>{value == null ? "" : String(value)}</span>;
}

const PX_PER_STEP = 6;

function DragNumber({ name, def, value, onChange }: { name: string; def: Extract<Param, { type: "number" }>; value: number; onChange(v: number): void }) {
  const step = def.step ?? (def.max - def.min > 20 ? 1 : 0.1);
  const [shown, setShown] = useState(value);
  const drag = useRef<{ x: number; from: number } | undefined>();
  const timer = useRef<number>();
  useEffect(() => { if (!drag.current) setShown(value); }, [value]);
  const clamp = (v: number) => Math.min(def.max, Math.max(def.min, Math.round((v - def.min) / step) * step + def.min));
  // Show every change at once; send it a beat later so a drag doesn't flood the server.
  const set = (v: number, now = false) => {
    const c = Number(clamp(v).toFixed(6));
    setShown(c);
    clearTimeout(timer.current);
    if (now) onChange(c);
    else timer.current = window.setTimeout(() => onChange(c), 120);
  };
  return (
    <span className="prose-number" data-param={name} role="slider" tabIndex={0} aria-label={def.label} aria-valuemin={def.min} aria-valuemax={def.max} aria-valuenow={shown}
      title={`Drag to change ${def.label.toLowerCase()}`}
      onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, from: shown }; document.body.classList.add("dragging-number"); }}
      onPointerMove={(e) => { if (drag.current) set(drag.current.from + Math.round((e.clientX - drag.current.x) / PX_PER_STEP) * step); }}
      onPointerUp={() => { if (drag.current) { drag.current = undefined; document.body.classList.remove("dragging-number"); set(shown, true); } }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); set(shown + step, true); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); set(shown - step, true); }
      }}>
      {formatValue(shown, Number.isInteger(step) ? "integer" : "number")}{def.unit ? <span className="unit">{def.unit}</span> : null}
    </span>
  );
}
