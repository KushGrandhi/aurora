import { portableSchema } from "./schema.ts";
import type { LlmProvider, LlmRequest } from "./types.ts";

export function createOllamaProvider(opts: { url: string; model: string; fetch?: typeof fetch }): LlmProvider {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.url.replace(/\/$/, "");
  return {
    name: `ollama:${opts.model}`,
    async *stream(req: LlmRequest) {
      let res: Response;
      try {
        res = await doFetch(`${base}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: req.signal,
          body: JSON.stringify({
            model: opts.model,
            stream: true,
            think: false,
            keep_alive: "30m",
            format: portableSchema(req.schema),
            options: { temperature: 0.2, num_ctx: 8192 },
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
          }),
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new Error(`ollama unreachable at ${opts.url}`);
      }
      if (!res.ok || !res.body) throw new Error(`ollama: ${res.status} ${await res.text()}`);
      const decoder = new TextDecoder();
      let pending = "";
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        pending += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, nl).trim();
          pending = pending.slice(nl + 1);
          if (!line) continue;
          const msg = JSON.parse(line);
          if (msg.error) throw new Error(`ollama: ${msg.error}`);
          if (msg.message?.content) yield msg.message.content as string;
        }
      }
      if (pending.trim()) {
        const msg = JSON.parse(pending);
        if (msg.message?.content) yield msg.message.content as string;
      }
    },
  };
}
