import { expect, test } from "vitest";
import { createOpenAIProvider } from "../src/llm/openai.ts";

const enc = new TextEncoder();
const sse = (chunks: string[]) => new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((s) => c.enqueue(enc.encode(s))); c.close(); } });
const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}\n\n`;
async function collect(it: AsyncIterable<string>) { let s = ""; for await (const x of it) s += x; return s; }
const req = { system: "S", user: "U", schema: { type: "object", properties: { a: { type: "string", pattern: "x" } } } };

test("streams SSE deltas from an OpenAI-compatible endpoint", async () => {
  let url = "", body: any, headers: any;
  const fakeFetch = (async (u: string, init: RequestInit) => {
    url = u; body = JSON.parse(String(init.body)); headers = init.headers;
    const all = delta('{"ti') + delta('tle":"x"}') + "data: [DONE]\n\n";
    return new Response(sse([all.slice(0, 17), all.slice(17)]), { status: 200 });
  }) as typeof fetch;
  const p = createOpenAIProvider({ baseUrl: "http://router:8000/v1/", model: "auto", apiKey: "k", fetch: fakeFetch });
  expect(await collect(p.stream(req))).toBe('{"title":"x"}');
  expect(url).toBe("http://router:8000/v1/chat/completions");
  expect(headers.authorization).toBe("Bearer k");
  expect(body).toMatchObject({ model: "auto", stream: true, messages: [{ role: "system", content: "S" }, { role: "user", content: "U" }] });
  expect(body.response_format.type).toBe("json_schema");
  expect(JSON.stringify(body.response_format)).not.toContain("pattern");
});

test("uses the per-task model when configured", async () => {
  let body: any;
  const fakeFetch = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(sse(["data: [DONE]\n\n"]), { status: 200 }); }) as typeof fetch;
  const p = createOpenAIProvider({ baseUrl: "http://r/v1", model: "auto", models: { repair: "fast" }, fetch: fakeFetch });
  await collect(p.stream({ ...req, task: "repair" }));
  expect(body.model).toBe("fast");
  await collect(p.stream({ ...req, task: "compose" }));
  expect(body.model).toBe("auto");
});

test("json mode can be relaxed for backends without schema support", async () => {
  let body: any;
  const fakeFetch = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(sse(["data: [DONE]\n\n"]), { status: 200 }); }) as typeof fetch;
  await collect(createOpenAIProvider({ baseUrl: "http://r/v1", model: "m", jsonMode: "object", fetch: fakeFetch }).stream(req));
  expect(body.response_format).toEqual({ type: "json_object" });
  await collect(createOpenAIProvider({ baseUrl: "http://r/v1", model: "m", jsonMode: "none", fetch: fakeFetch }).stream(req));
  expect(body.response_format).toBeUndefined();
});

test("reports HTTP errors and unreachable endpoints", async () => {
  const bad = (async () => new Response("nope", { status: 429 })) as typeof fetch;
  await expect(collect(createOpenAIProvider({ baseUrl: "http://r/v1", model: "m", fetch: bad }).stream(req))).rejects.toThrow("llm: 429 nope");
  const down = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  await expect(collect(createOpenAIProvider({ baseUrl: "http://r/v1", model: "m", fetch: down }).stream(req))).rejects.toThrow("llm endpoint unreachable at http://r/v1");
});
