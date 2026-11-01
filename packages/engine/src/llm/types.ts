export type LlmRequest = { system: string; user: string; schema: object; signal?: AbortSignal };

export interface LlmProvider {
  name: string;
  stream(req: LlmRequest): AsyncIterable<string>;
}
