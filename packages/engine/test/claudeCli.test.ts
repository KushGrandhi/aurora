import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, test } from "vitest";
import { createClaudeCliProvider } from "../src/llm/claudeCli.ts";

const delta = (text: string) => JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } });

function fakeSpawn(lines: string[], opts: { code?: number; stderr?: string } = {}) {
  const calls: { bin: string; args: string[]; stdin: string; cwd?: string }[] = [];
  const spawn = (bin: string, args: string[], o: { cwd?: string }) => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    const call = { bin, args, stdin: "", cwd: o.cwd };
    calls.push(call);
    child.stdin.on("data", (d: Buffer) => (call.stdin += d));
    setTimeout(() => {
      for (const l of lines) child.stdout.write(l + "\n");
      if (opts.stderr) child.stderr.write(opts.stderr);
      child.stdout.end();
      child.stderr.end();
      child.emit("close", opts.code ?? 0);
    }, 5);
    return child;
  };
  return { spawn: spawn as any, calls };
}
async function collect(it: AsyncIterable<string>) { let s = ""; for await (const x of it) s += x; return s; }
const req = { system: "SYS", user: "USER PROMPT", schema: {} };

test("streams text deltas from claude -p stream-json using the subscription login", async () => {
  const f = fakeSpawn([JSON.stringify({ type: "system", subtype: "init" }), delta('{"ti'), delta('tle":"x"}'), JSON.stringify({ type: "result", is_error: false })]);
  const p = createClaudeCliProvider({ model: "sonnet", spawn: f.spawn });
  expect(await collect(p.stream(req))).toBe('{"title":"x"}');
  const { args, stdin } = f.calls[0];
  expect(args).toEqual(expect.arrayContaining(["-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--no-session-persistence", "--strict-mcp-config"]));
  expect(args[args.indexOf("--model") + 1]).toBe("sonnet");
  expect(args[args.indexOf("--system-prompt") + 1]).toBe("SYS");
  expect(args[args.indexOf("--tools") + 1]).toBe("");
  expect(args).toContain("--setting-sources=");
  expect(args).not.toContain("--bare"); // --bare skips the subscription login
  expect(stdin).toBe("USER PROMPT");
  expect(p.name).toBe("claude:sonnet");
});

test("per-task model for repairs", async () => {
  const f = fakeSpawn([delta("{}")]);
  const p = createClaudeCliProvider({ model: "sonnet", models: { repair: "haiku" }, spawn: f.spawn });
  await collect(p.stream({ ...req, task: "repair" }));
  expect(f.calls[0].args[f.calls[0].args.indexOf("--model") + 1]).toBe("haiku");
});

test("surfaces CLI errors", async () => {
  const f = fakeSpawn([JSON.stringify({ type: "result", is_error: true, result: "Not logged in · Please run /login" })]);
  await expect(collect(createClaudeCliProvider({ model: "sonnet", spawn: f.spawn }).stream(req))).rejects.toThrow("claude: Not logged in");
  const g = fakeSpawn([], { code: 1, stderr: "boom" });
  await expect(collect(createClaudeCliProvider({ model: "sonnet", spawn: g.spawn }).stream(req))).rejects.toThrow("claude exited 1: boom");
});

test("passes effort when configured", async () => {
  const f = fakeSpawn([delta("{}")]);
  await collect(createClaudeCliProvider({ model: "sonnet", effort: "low", spawn: f.spawn }).stream(req));
  expect(f.calls[0].args[f.calls[0].args.indexOf("--effort") + 1]).toBe("low");
  const g = fakeSpawn([delta("{}")]);
  await collect(createClaudeCliProvider({ model: "sonnet", spawn: g.spawn }).stream(req));
  expect(g.calls[0].args).not.toContain("--effort");
});
