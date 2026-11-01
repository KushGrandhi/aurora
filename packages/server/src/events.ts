import type { AuroraEvent, Problem } from "@aurora/spec";

const KEEP = 500;
const MAX_PAYLOAD = 16_000;
const MAX_WAIT = 60_000;

/** What the person did on screen (aurora.send from designs, variant picks), per view, in memory, for the caller to read. */
export class EventLog {
  private logs = new Map<string, AuroraEvent[]>();
  private seq = new Map<string, number>();
  private waiters = new Map<string, Set<() => void>>();

  add(viewId: string, e: { itemId?: string; name: string; payload: unknown }): AuroraEvent | { problem: Problem } {
    if (typeof e.name !== "string" || e.name.length < 1 || e.name.length > 64) return { problem: { severity: "warning", message: "event names are 1 to 64 characters" } };
    let size: number;
    try {
      size = JSON.stringify(e.payload ?? null).length;
    } catch {
      return { problem: { severity: "warning", message: `event "${e.name}": payload must be JSON` } };
    }
    if (size > MAX_PAYLOAD) return { problem: { severity: "warning", message: `event "${e.name}": payload is ${size} bytes; the limit is 16 KB` } };
    const seq = (this.seq.get(viewId) ?? 0) + 1;
    this.seq.set(viewId, seq);
    const ev: AuroraEvent = { seq, at: new Date().toISOString(), ...(e.itemId ? { itemId: e.itemId } : {}), name: e.name, payload: e.payload ?? null };
    const log = this.logs.get(viewId) ?? [];
    log.push(ev);
    if (log.length > KEEP) log.splice(0, log.length - KEEP);
    this.logs.set(viewId, log);
    for (const w of this.waiters.get(viewId) ?? []) w();
    return ev;
  }

  since(viewId: string, after = 0): AuroraEvent[] {
    return (this.logs.get(viewId) ?? []).filter((e) => e.seq > after);
  }

  stats(viewId: string): { count: number; lastSeq: number } {
    return { count: this.logs.get(viewId)?.length ?? 0, lastSeq: this.seq.get(viewId) ?? 0 };
  }

  /** Events after `after`, waiting up to `ms` for the first one to arrive. */
  wait(viewId: string, after: number, ms: number): Promise<AuroraEvent[]> {
    const now = this.since(viewId, after);
    if (now.length || ms <= 0) return Promise.resolve(now);
    return new Promise((resolve) => {
      const set = this.waiters.get(viewId) ?? new Set();
      this.waiters.set(viewId, set);
      const done = () => {
        set.delete(done);
        clearTimeout(timer);
        resolve(this.since(viewId, after));
      };
      const timer = setTimeout(done, Math.min(ms, MAX_WAIT));
      timer.unref?.();
      set.add(done);
    });
  }
}
