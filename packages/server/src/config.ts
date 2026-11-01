import { readFileSync } from "node:fs";
import path from "node:path";

export type Config = { port: number; provider: "ollama"; model: string; ollamaUrl: string };

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const cfg: Config = { port: 4317, provider: "ollama", model: "qwen3:8b", ollamaUrl: "http://127.0.0.1:11434" };
  try {
    const file = JSON.parse(readFileSync(path.join(env.HOME ?? "", ".genui", "config.json"), "utf8"));
    Object.assign(cfg, file);
  } catch {
    // no config file: defaults
  }
  if (env.GENUI_MODEL) cfg.model = env.GENUI_MODEL;
  if (env.GENUI_OLLAMA_URL) cfg.ollamaUrl = env.GENUI_OLLAMA_URL;
  if (env.GENUI_PORT) cfg.port = Number(env.GENUI_PORT);
  return cfg;
}
