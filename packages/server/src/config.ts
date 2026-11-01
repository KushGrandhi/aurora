import { readFileSync } from "node:fs";
import path from "node:path";
import { createOllamaProvider, createOpenAIProvider, type LlmProvider, type OpenAIOpts } from "@genui/engine";

export type Config = {
  port: number;
  provider: "ollama" | "openai"; // "openai" = any OpenAI-compatible server, e.g. the LLM routing server
  model: string;
  ollamaUrl: string;
  baseUrl?: string;
  apiKey?: string;
  models?: OpenAIOpts["models"]; // per-task model names: { compose, repair }
  jsonMode?: OpenAIOpts["jsonMode"];
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cfg: Config = { port: 4317, provider: "ollama", model: "qwen3:8b", ollamaUrl: "http://127.0.0.1:11434" };
  try {
    const file = JSON.parse(readFileSync(path.join(env.HOME ?? "", ".genui", "config.json"), "utf8"));
    Object.assign(cfg, file);
  } catch {
    // no config file: defaults
  }
  if (env.GENUI_PROVIDER === "ollama" || env.GENUI_PROVIDER === "openai") cfg.provider = env.GENUI_PROVIDER;
  if (env.GENUI_MODEL) cfg.model = env.GENUI_MODEL;
  if (env.GENUI_OLLAMA_URL) cfg.ollamaUrl = env.GENUI_OLLAMA_URL;
  if (env.GENUI_BASE_URL) cfg.baseUrl = env.GENUI_BASE_URL;
  if (env.GENUI_API_KEY) cfg.apiKey = env.GENUI_API_KEY;
  if (env.GENUI_PORT) cfg.port = Number(env.GENUI_PORT);
  return cfg;
}

export function providerFromConfig(cfg: Config): LlmProvider {
  if (cfg.provider === "openai") {
    if (!cfg.baseUrl) throw new Error("provider 'openai' needs baseUrl (config.json) or GENUI_BASE_URL");
    return createOpenAIProvider({ baseUrl: cfg.baseUrl, model: cfg.model, models: cfg.models, apiKey: cfg.apiKey, jsonMode: cfg.jsonMode });
  }
  return createOllamaProvider({ url: cfg.ollamaUrl, model: cfg.model });
}
