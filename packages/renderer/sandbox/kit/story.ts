import { useEffect, useState } from "react";

type Story = { index: number; state: unknown } | null;
type Bridge = { story: Story; onStory(cb: (s: Story) => void): () => void; params: Record<string, unknown>; onParams(cb: (p: Record<string, unknown>) => void): () => void };
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
