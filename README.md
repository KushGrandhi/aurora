# genui

A generative interface layer: hand it data, and an LLM composes the right view for it (KPIs, charts, tables, text), streamed into a browser tab. Every number on screen comes from a DuckDB query. The model never types data.

Design: `docs/specs/2026-10-31-genui-design.md` · Plan 1: `docs/superpowers/plans/2026-10-31-genui-plan-1-core.md`

## Run

Requires Node 24 and the `claude` CLI logged in (the default provider composes views on your Claude Code subscription: Sonnet at low effort, ~2 s to the first panel). For offline use, set `provider` to `ollama` and pull a model (default `qwen3:8b`).

```bash
npm install
(cd packages/renderer && npx vite build)     # build the screen once
npm run genui -- serve                       # http://localhost:4317
npm run genui -- render sales.csv --intent "monthly revenue by region"
npm run genui -- render orders=orders.parquet docs=./notes/   # several named datasets
```

`render` starts the server in-process if none is running and opens the screen if no tab is connected.

Inputs: CSV, TSV, JSON, NDJSON, Parquet, `.md`/`.txt` files or directories (loaded as a `(name, body)` table), or `http(s)` URLs.

HTTP: `POST /api/render {"data": "<path>" | {"name": "<path>", ...} | {"inline": [...]}, "intent": "..."}` → `{renderId, url}`; events stream on `GET /ws`.

## Config

`~/.genui/config.json` (all optional), overridden by env:

| key | env | default |
|---|---|---|
| `port` | `GENUI_PORT` | `4317` |
| `model` | `GENUI_MODEL` | `sonnet` for claude, `qwen3:8b` for ollama |
| `ollamaUrl` | `GENUI_OLLAMA_URL` | `http://127.0.0.1:11434` |
| `provider` | `GENUI_PROVIDER` | `claude` (Claude Code subscription), `ollama` (local, offline), or `openai` (any OpenAI-compatible server, e.g. the LLM routing server) |
| `effort` | | `low` (claude provider; higher effort thinks first and is slower) |
| `baseUrl` | `GENUI_BASE_URL` | — (required for `openai`, e.g. `http://localhost:8000/v1`) |
| `apiKey` | `GENUI_API_KEY` | — |
| `models` | | per-task model names, e.g. `{"compose": "auto", "repair": "fast"}` |
| `jsonMode` | | `schema` (default), `object`, or `none` if the backend lacks JSON-schema output |
| | `GENUI_FAKE_PROVIDER=1` | canned composition, no model |
| | `GENUI_NO_OPEN=1` | never open a browser |
| | `GENUI_DEBUG_DIR=<dir>` | save the raw model output of any incomplete composition there |

### Using the LLM routing server

```json
// ~/.genui/config.json
{ "provider": "openai", "baseUrl": "http://localhost:8000/v1", "model": "auto", "models": { "repair": "fast" } }
```

Every call is tagged as a `compose` or a `repair`, so the router can send repairs to a small fast model and full compositions to a bigger one.

## Test

```bash
npx vitest run                               # unit + integration
(cd packages/renderer && npx playwright test) # browser smoke test (uses installed Chrome)
npx tsx scripts/latency.ts [model]           # real-model timings
```

## Measured latency (MacBook Air M4, 16 GB, qwen3:8b Q4_K_M, Ollama 0.18.2)

`npx tsx scripts/latency.ts`, 2026-10-31:

| input | profile | default view | first LLM panel | total | panels | cache-hit total |
|---|---|---|---|---|---|---|
| sales.csv (240 rows) | 49 ms | 74 ms | 18.1 s (incl. cold model load) | 43.8 s | 4 | 37 ms |
| events.parquet (1M rows) | 107 ms | 120 ms | 10.7 s | 108.9 s | 9 | 120 ms |
| docs directory | 24 ms | 28 ms | 4.7 s | 16.2 s | 3 | 19 ms |

What these show:
- Profiling, the default view and cache hits all beat their targets (300 ms / 400 ms / 150 ms).
- The first LLM panel misses the 3 s local target. Breakdown on sales.csv: prompt 1,622 tokens, prefill 2.9 s cold → 0.1 s once Ollama has cached the static prefix; generation ~18.7 tok/s; ~600 output tokens per view. Constrained decoding costs nothing measurable (18.7 vs 18.5 tok/s for plain JSON).
- So the bottleneck is generation speed × output length. That's for Plan 4 (model choice via `genui eval`, smaller/faster models, a more compact part format), not fixed here.
