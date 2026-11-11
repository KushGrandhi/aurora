import { expect, test } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { HOSTED_INVITE, HOSTED_URL } from "../playwright.config.ts";

test.use({ baseURL: HOSTED_URL });

test("a share link shows one view read-only; a rotated one doesn't work", async ({ page, request }) => {
  const minted = await request.post("/api/keys", { data: { invite: HOSTED_INVITE } });
  expect(minted.status()).toBe(200);
  const headers = { authorization: `Bearer ${(await minted.json()).key}` };
  const view = { v: 2, id: "shared", title: "Shared numbers", sections: [{ id: "s", layout: "grid", items: [{ id: "t", c: { type: "text", md: "Hello from a link" } }] }] };
  const r = await request.post("/api/views", { data: { view }, headers });
  expect(r.status()).toBe(200);
  const { url } = await r.json();
  expect(url).toMatch(new RegExp(`^${HOSTED_URL}/v/[a-z0-9]{16}_[0-9a-f]{32}$`));

  await page.goto(url);
  await expect(page.locator("h1")).toHaveText("Shared numbers");
  await expect(page.locator('[data-item="t"]')).toContainText("Hello from a link");
  await expect(page.locator(".versions")).toHaveCount(0);
  await expect(page.locator(".home-link")).toHaveCount(0);

  expect((await request.post("/api/views/shared/share", { data: { rotate: true }, headers })).status()).toBe(200);
  await expect(page.getByText("This link doesn't work")).toBeVisible(); // the open page's socket closes (4401)
  await page.reload();
  await expect(page.getByText("This link doesn't work")).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(0);
});

test("hosted: a harness renders through /mcp; the share link draws it in a browser; another key can't read it", async ({ page, request }) => {
  const mint = async () => (await (await request.post("/api/keys", { data: { invite: HOSTED_INVITE } })).json()).key as string;
  const [keyA, keyB] = [await mint(), await mint()];
  const client = new Client({ name: "e2e", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${HOSTED_URL}/mcp`), { requestInit: { headers: { authorization: `Bearer ${keyA}` } } }));
  try {
    const view = {
      v: 2, id: "e2e_mcp", title: "Sales by region",
      datasets: { s: { inline: [{ region: "North", revenue: 120 }, { region: "South", revenue: 90 }, { region: "East", revenue: 150 }] } },
      queries: { byRegion: { sql: "SELECT region, sum(revenue) AS revenue FROM s GROUP BY 1" } },
      sections: [{ id: "s", layout: "grid", items: [{ id: "c", c: { type: "chart", query: "byRegion", vegaLite: { mark: "bar", encoding: { x: { field: "region", type: "nominal" }, y: { field: "revenue", type: "quantitative" } } } } }] }],
    };
    const res = await client.callTool({ name: "render", arguments: { view } });
    const text = (res.content as { type: string; text: string }[]).map((c) => c.text).join("\n");
    const url = text.match(/https?:\/\/\S+\/v\/[a-z0-9]{16}_[0-9a-f]{32}/)?.[0];
    expect(url, text).toBeTruthy();
    await page.goto(url!);
    await expect(page.locator("h1")).toHaveText("Sales by region");
    await expect(page.locator('[data-item="c"] svg').first()).toBeVisible();
  } finally {
    await client.close();
  }
  const own = await request.get("/api/views/e2e_mcp/status", { headers: { authorization: `Bearer ${keyA}` } });
  expect(own.status()).toBe(200);
  const other = await request.get("/api/views/e2e_mcp/status", { headers: { authorization: `Bearer ${keyB}` } });
  expect(other.status()).toBe(404);
});
