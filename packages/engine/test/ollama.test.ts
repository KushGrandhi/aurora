import { expect, test } from "vitest";
import { createOllamaProvider } from "../src/llm/ollama.ts";

const enc = new TextEncoder();
function streamOf(chunks: string[]) {
  return new ReadableStream<Uint8Array>({ start(c) { chunks.forEach((s) => c.enqueue(enc.encode(s))); c.close(); } });
}
async function collect(it: AsyncIterable<string>) { let s = ""; for await (const x of it) s += x; return s; }
const req = { system: "S", user: "U", schema: { type: "object" } };

test("ollama provider streams content", async () => {
  let body: any;
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    const lines = [
      JSON.stringify({ message: { content: '{"ti' } }) + "\n" + JSON.stringify({ message: { content: 'tle":' } }).slice(0, 10),
      JSON.stringify({ message: { content: 'tle":' } }).slice(10) + "\n",
      JSON.stringify({ message: { content: '"x"}' }, done: true }) + "\n",
    ];
    return new Response(streamOf(lines), { status: 200 });
  }) as typeof fetch;
  const p = createOllamaProvider({ url: "http://h:1", model: "m", fetch: fakeFetch });
  expect(await collect(p.stream(req))).toBe('{"title":"x"}');
  expect(body).toMatchObject({ model: "m", stream: true, think: false, keep_alive: "30m", format: { type: "object" } });
  expect(body.messages).toEqual([{ role: "system", content: "S" }, { role: "user", content: "U" }]);
});

test("ollama provider error on 500", async () => {
  const fakeFetch = (async () => new Response("boom", { status: 500 })) as typeof fetch;
  const p = createOllamaProvider({ url: "http://h:1", model: "m", fetch: fakeFetch });
  await expect(collect(p.stream(req))).rejects.toThrow("ollama: 500 boom");
});

test("ollama unreachable", async () => {
  const fakeFetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  const p = createOllamaProvider({ url: "http://h:1", model: "m", fetch: fakeFetch });
  await expect(collect(p.stream(req))).rejects.toThrow("ollama unreachable at http://h:1");
});
