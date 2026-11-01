export type LlmTask = "compose" | "repair";
export type LlmRequest = { system: string; user: string; schema: object; signal?: AbortSignal; task?: LlmTask };

export interface LlmProvider {
  name: string;
  stream(req: LlmRequest): AsyncIterable<string>;
}
