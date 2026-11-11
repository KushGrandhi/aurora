import { expect, test } from "@playwright/test";
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
