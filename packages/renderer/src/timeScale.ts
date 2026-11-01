const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Step = { unit: "day" | "month" | "year"; n: number };
// Smallest first; the first that gives at most 7 ticks wins.
const STEPS: Step[] = [
  { unit: "day", n: 1 }, { unit: "day", n: 2 }, { unit: "day", n: 3 }, { unit: "day", n: 7 }, { unit: "day", n: 14 },
  { unit: "month", n: 1 }, { unit: "month", n: 2 }, { unit: "month", n: 3 },
  { unit: "year", n: 1 }, { unit: "year", n: 2 }, { unit: "year", n: 5 }, { unit: "year", n: 10 }, { unit: "year", n: 25 }, { unit: "year", n: 50 }, { unit: "year", n: 100 },
];
const MAX_TICKS = 7;

/** Tick times (UTC) at `step` inside [lo, hi]. */
function ticksFor(step: Step, lo: number, hi: number): number[] {
  const out: number[] = [];
  const d = new Date(lo);
  if (step.unit === "day") {
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (t < lo) t += DAY;
    for (; t <= hi && out.length <= MAX_TICKS; t += step.n * DAY) out.push(t);
  } else if (step.unit === "month") {
    let y = d.getUTCFullYear();
    let m = d.getUTCMonth();
    if (Date.UTC(y, m, 1) < lo) m += 1;
    m = Math.ceil(m / step.n) * step.n; // quarters start in Jan/Apr/Jul/Oct
    for (let t = Date.UTC(y, m, 1); t <= hi && out.length <= MAX_TICKS; m += step.n, t = Date.UTC(y, m, 1)) out.push(t);
  } else {
    let y = d.getUTCFullYear();
    if (Date.UTC(y, 0, 1) < lo) y += 1;
    y = Math.ceil(y / step.n) * step.n;
    for (let t = Date.UTC(y, 0, 1); t <= hi && out.length <= MAX_TICKS; y += step.n, t = Date.UTC(y, 0, 1)) out.push(t);
  }
  return out;
}

function label(t: number, step: Step): string {
  const d = new Date(t);
  if (step.unit === "day") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  if (step.unit === "month") return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return String(d.getUTCFullYear());
}

/** A linear time scale over the dates (padded 4% each side) with 3–7 ticks at a calendar step. */
export function timeScale(dates: string[], width: number): { x(date: string): number; ticks: { at: number; label: string }[] } {
  const ts = dates.map((s) => Date.parse(s)).filter((t) => !isNaN(t));
  let min = ts.length ? Math.min(...ts) : Date.now();
  let max = ts.length ? Math.max(...ts) : min;
  if (max - min < DAY) {
    min -= 3 * DAY;
    max += 3 * DAY;
  }
  const pad = (max - min) * 0.04;
  const lo = min - pad;
  const hi = max + pad;
  const x = (date: string) => ((Date.parse(date) - lo) / (hi - lo)) * width;
  let chosen: { step: Step; at: number[] } | undefined;
  for (const step of STEPS) {
    const at = ticksFor(step, lo, hi);
    if (at.length <= MAX_TICKS) {
      chosen = { step, at };
      break;
    }
  }
  const { step, at } = chosen ?? { step: STEPS[STEPS.length - 1], at: ticksFor(STEPS[STEPS.length - 1], lo, hi) };
  return { x, ticks: at.map((t) => ({ at: ((t - lo) / (hi - lo)) * width, label: label(t, step) })) };
}
