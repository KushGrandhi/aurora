import type { LlmProvider, LlmRequest } from "./types.ts";

export type FakeOpts = { chunkSize?: number; delayMs?: number; repair?: object; repairDelayMs?: number; throwError?: string; truncateAt?: number };

/** Deterministic provider for tests and GENUI_FAKE_PROVIDER: streams a canned document in chunks. */
export function createFakeProvider(doc: object, opts: FakeOpts = {}): LlmProvider & { calls: number } {
  const p = {
    name: "fake",
    calls: 0,
    async *stream(req: LlmRequest) {
      p.calls++;
      if (opts.throwError) throw new Error(opts.throwError);
      const isRepair = req.user.includes("This part was rejected");
      if (isRepair && opts.repairDelayMs) await new Promise((r) => setTimeout(r, opts.repairDelayMs));
      let text = isRepair ? JSON.stringify(opts.repair ?? {}) : JSON.stringify(doc);
      if (!isRepair && opts.truncateAt) text = text.slice(0, Math.floor(text.length * opts.truncateAt));
      const size = opts.chunkSize ?? 16;
      for (let i = 0; i < text.length; i += size) {
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        yield text.slice(i, i + size);
      }
    },
  };
  return p;
}
