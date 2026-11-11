import path from "node:path";
import type { Core } from "../core.ts";

/** Hosted mode: one core per workspace under <dataDir>/ws/<id>/, made on first use and kept for the process. */
export class Tenants {
  private cores = new Map<string, Promise<Core>>();
  private opts: { dataDir: string; make: (ws: string, dir: string) => Promise<Core> };

  constructor(opts: { dataDir: string; make: (ws: string, dir: string) => Promise<Core> }) {
    this.opts = opts;
  }

  dir(ws: string): string {
    return path.join(this.opts.dataDir, "ws", ws);
  }

  /** Concurrent gets of one workspace share a single creation; a failed creation is forgotten so the next get retries. */
  get(ws: string): Promise<Core> {
    let p = this.cores.get(ws);
    if (!p) {
      p = this.opts.make(ws, this.dir(ws));
      this.cores.set(ws, p);
      p.catch(() => {
        if (this.cores.get(ws) === p) this.cores.delete(ws);
      });
    }
    return p;
  }

  async closeAll(): Promise<void> {
    const all = [...this.cores.values()];
    this.cores.clear();
    await Promise.all(all.map((p) => p.then((c) => c.close(), () => {})));
  }
}
