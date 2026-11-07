import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Linked focus: one value (a region, a part, a person) the reader is pointing at, shared by every item of a view.
 * Charts dim everything else, tables mark the row, prose highlights the word, designs hear it through aurora.focus.
 * It lives only on this screen: nothing is sent to the server.
 */
export type Focus = { value: string | null; set(v: string | null): void };

const Ctx = createContext<Focus>({ value: null, set: () => {} });

export function FocusProvider({ resetKey, children }: { resetKey: unknown; children: ReactNode }) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => setValue(null), [resetKey]);
  const ctx = useMemo<Focus>(() => ({ value, set: (v) => setValue(v == null || v === "" ? null : String(v).slice(0, 200)) }), [value]);
  return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
}

export const useFocus = () => useContext(Ctx);
