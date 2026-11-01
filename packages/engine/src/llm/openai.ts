import { portableSchema } from "./schema.ts";
import type { LlmProvider, LlmRequest, LlmTask } from "./types.ts";

export type OpenAIOpts = {
  baseUrl: string; // e.g. http://localhost:8000/v1 — any OpenAI-compatible server or router
  model: string;
  models?: Partial<Record<LlmTask, string>>; // per-task model names, so a router can send repairs to a fast model
  apiKey?: string;
  jsonMode?: "schema" | "object" | "none";
  fetch?: typeof fetch;
};

function responseFormat(mode: OpenAIOpts["jsonMode"], schema: object): object | undefined {
  if (mode === "none") return undefined;
  if (mode === "object") return { type: "json_object" };
  return { type: "json_schema", json_schema: { name: "genui", schema: portableSchema(schema), strict: false } };
}

export function createOpenAIProvider(opts: OpenAIOpts): LlmProvider {
  const doFetch = opts.fetch ?? fetch;
  const base = opts.baseUrl.replace(/\/+$/, "");
  return {
    name: opts.model,
    async *stream(req: LlmRequest) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (opts.apiKey) headers.authorization = `Bearer ${opts.apiKey}`;
      const body: Record<string, unknown> = {
        model: (req.task && opts.models?.[req.task]) || opts.model,
        stream: true,
        temperature: 0.2,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      };
      const format = responseFormat(opts.jsonMode ?? "schema", req.schema);
      if (format) body.response_format = format;
      let res: Response;
      try {
        res = await doFetch(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal: req.signal });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw e;
        throw new Error(`llm endpoint unreachable at ${opts.baseUrl}`);
      }
      if (!res.ok || !res.body) throw new Error(`llm: ${res.status} ${await res.text()}`);
      const decoder = new TextDecoder();
      let pending = "";
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        pending += decoder.decode(chunk, { stream: true });
        let nl: number;
        while ((nl = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, nl).trim();
          pending = pending.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          const msg = JSON.parse(data);
          if (msg.error) throw new Error(`llm: ${msg.error.message ?? JSON.stringify(msg.error)}`);
          const content = msg.choices?.[0]?.delta?.content;
          if (content) yield content as string;
        }
      }
    },
  };
}
