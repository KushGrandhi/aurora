import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAuroraMcpServer } from "../mcp.ts";
import { MAX_BODY, readBody } from "./auth.ts";

/**
 * One stateless MCP exchange over Streamable HTTP (`POST /mcp`). The caller has already checked the bearer key.
 * A fresh transport and MCP server per request (the SDK refuses reuse when stateless), both closed with `res`.
 * Tool calls go back through the HTTP API at `internalBase` with the same key: auth stays by the key, never the address.
 * The body is read here under the 4 MB cap; a BodyTooLarge rejection is left to the caller to answer (413).
 */
export async function handleMcp(req: IncomingMessage, res: ServerResponse, ctx: { key: string; internalBase: string }): Promise<void> {
  const raw = await readBody(req, MAX_BODY);
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
    return;
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createAuroraMcpServer({ baseUrl: ctx.internalBase, cwd: "/", hosted: true, headers: { authorization: `Bearer ${ctx.key}` } });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}
