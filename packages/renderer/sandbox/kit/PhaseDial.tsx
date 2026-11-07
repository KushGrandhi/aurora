type Phase = { name: string; color: string };

const cssVar = (c: string) => (c.startsWith("--") ? `var(${c})` : c);

/** Where something is in a repeating cycle: equal coloured arcs, the current one bright, and a needle. */
export function PhaseDial({ phases, value, size = 80 }: { phases: Phase[]; value: number; size?: number }) {
  const v = ((value % 1) + 1) % 1;
  const n = Math.max(1, phases.length);
  const active = Math.min(n - 1, Math.floor(v * n));
  const point = (f: number, r: number) => [44 + r * Math.sin(f * 2 * Math.PI), 44 - r * Math.cos(f * 2 * Math.PI)];
  const arc = (i: number) => {
    const gap = 0.012;
    const [x1, y1] = point(i / n + gap, 34), [x2, y2] = point((i + 1) / n - gap, 34);
    return `M ${x1} ${y1} A 34 34 0 ${1 / n > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const [nx, ny] = point(v, 24);
  return (
    <svg data-kit-dial viewBox="0 0 88 88" width={size} height={size} className="shrink-0" role="img" aria-label={`${phases[active]?.name ?? ""}`}>
      {phases.map((p, i) => (
        <path key={p.name} d={arc(i)} fill="none" stroke={cssVar(p.color)} strokeWidth={7} strokeLinecap="round" opacity={i === active ? 1 : 0.28} />
      ))}
      <line x1={44} y1={44} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={44} cy={44} r={4} fill="var(--ink)" />
    </svg>
  );
}

/** A row of coloured keys; pass `onClick` to make them filters or selectors. */
export function Legend({ items }: { items: { name: string; color: string; active?: boolean; onClick?: () => void }[] }) {
  return (
    <div data-kit-legend className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const body = (
          <>
            <span className="h-2 w-2 rounded-full" style={{ background: cssVar(it.color) }} />
            {it.name}
          </>
        );
        const cls = `flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium transition ${it.active ? "text-ink underline decoration-2 underline-offset-4" : "text-ink-2"}`;
        return it.onClick ? <button key={it.name} onClick={it.onClick} className={cls}>{body}</button> : <span key={it.name} className={cls}>{body}</span>;
      })}
    </div>
  );
}
