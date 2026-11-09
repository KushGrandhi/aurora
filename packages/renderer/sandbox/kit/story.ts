import { useEffect, useState } from "react";

type Story = { index: number; state: unknown } | null;
type Bridge = { story: Story; onStory(cb: (s: Story) => void): () => void; params: Record<string, unknown>; onParams(cb: (p: Record<string, unknown>) => void): () => void; setParam(name: string, value: unknown): void; data: Record<string, unknown[]>; onData(cb: (d: Record<string, unknown[]>) => void): () => void };
const bridge = () => (window as unknown as { aurora?: Bridge }).aurora;

/**
 * In a `story` section: `{ index, state }` of the step the reader has scrolled to (state is the step's `story.state`),
 * or null outside a story. Drive the scene from it: `const phase = (useStory()?.state as { phase: number })?.phase`.
 */
export function useStory(): Story {
  const [s, setS] = useState<Story>(() => bridge()?.story ?? null);
  useEffect(() => bridge()?.onStory((v) => setS(v)), []);
  return s;
}

/** The current value of one of the view's params (a filter, or a number the reader drags in the prose). */
export function useParam<T = unknown>(name: string): T | undefined {
  const [v, setV] = useState<T | undefined>(() => bridge()?.params?.[name] as T | undefined);
  useEffect(() => bridge()?.onParams((p) => setV(p[name] as T | undefined)), [name]);
  return v;
}

/** Change one of the view's params from the design (a slider, a picked row): its queries run again, the view follows. */
export function setParam(name: string, value: unknown): void {
  bridge()?.setParam(name, value);
}

/** A param as React state: `const [cutoff, setCutoff] = useParamState<number>("cutoff")`. Setting it re-runs the queries that read it. */
export function useParamState<T = unknown>(name: string): [T | undefined, (v: T) => void] {
  const v = useParam<T>(name);
  return [v, (next: T) => setParam(name, next)];
}

/** The rows of one of the view's queries (list it in the design's `data`); updates when params change them. */
export function useQuery<R = Record<string, unknown>>(name: string): R[] {
  const [rows, setRows] = useState<R[]>(() => (bridge()?.data?.[name] ?? []) as R[]);
  useEffect(() => bridge()?.onData((d) => setRows((d[name] ?? []) as R[])), [name]);
  return rows;
}
