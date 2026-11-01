import { spawn as nodeSpawn } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";
import type { LlmProvider, LlmRequest, LlmTask } from "./types.ts";

export type ClaudeCliOpts = {
  model: string; // claude CLI model or alias: "sonnet", "haiku", "opus", or a full id
  models?: Partial<Record<LlmTask, string>>;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  bin?: string;
  spawn?: typeof nodeSpawn;
};

/**
 * Composes with the local `claude` CLI in headless mode, on the user's Claude Code subscription.
 * No tools, no hooks or settings (`--setting-sources=`), no MCP servers, nothing persisted.
 * Not `--bare`: that mode skips the subscription login.
 */
export function createClaudeCliProvider(opts: ClaudeCliOpts): LlmProvider {
  const spawn = opts.spawn ?? nodeSpawn;
  return {
    name: `claude:${opts.model}`,
    async *stream(req: LlmRequest) {
      const model = (req.task && opts.models?.[req.task]) || opts.model;
      const args = [
        "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages",
        "--model", model, "--system-prompt", req.system, "--tools", "",
        "--setting-sources=", "--strict-mcp-config", "--no-session-persistence",
        ...(opts.effort ? ["--effort", opts.effort] : []),
      ];
      const child = spawn(opts.bin ?? "claude", args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
      const onAbort = () => child.kill();
      req.signal?.addEventListener("abort", onAbort);
      let stderr = "";
      child.stderr?.on("data", (d) => (stderr += d));
      const closed = new Promise<number>((resolve) => child.on("close", (code: number | null) => resolve(code ?? 0)));
      child.on("error", () => {}); // surfaced via exit code / missing output
      child.stdin?.end(req.user);

      let failure: string | undefined;
      try {
        for await (const line of createInterface({ input: child.stdout! })) {
          if (!line.trim()) continue;
          let msg: { type?: string; is_error?: boolean; result?: string; event?: { type?: string; delta?: { type?: string; text?: string } } };
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          const ev = msg.event;
          if (msg.type === "stream_event" && ev?.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
            yield ev.delta.text;
          } else if (msg.type === "result" && msg.is_error) {
            failure = msg.result ?? "unknown error";
          }
        }
        const code = await closed;
        if (failure) throw new Error(`claude: ${failure}`);
        if (code !== 0) throw new Error(`claude exited ${code}: ${stderr.trim().slice(0, 300)}`);
      } finally {
        req.signal?.removeEventListener("abort", onAbort);
        child.kill();
      }
    },
  };
}
