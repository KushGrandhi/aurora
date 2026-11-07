import { useEffect, useState } from "react";

type Bridge = { focus: string | null; onFocus(cb: (v: string | null) => void): () => void; setFocus(v: string | null): void };
const bridge = () => (window as unknown as { aurora?: Bridge }).aurora;

/**
 * Linked focus: `[focus, setFocus]`. `focus` is what the reader is pointing at anywhere on the view (a region in a
 * chart, a row in a table, a part in another scene); call `setFocus("West")` on hover and `setFocus(null)` on leave,
 * and every item of the view lights it up.
 */
export function useFocus(): [string | null, (v: string | null) => void] {
  const [focus, setLocal] = useState<string | null>(() => bridge()?.focus ?? null);
  useEffect(() => bridge()?.onFocus((v) => setLocal(v)), []);
  return [focus, (v) => bridge()?.setFocus(v)];
}
