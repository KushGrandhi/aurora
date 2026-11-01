// Renders a file through a running aurora server and saves a screenshot once the render is done.
// Usage: npx tsx scripts/screenshot.ts <file> "<intent>" <out.png>   (server: AURORA_NO_OPEN=1 npm run aurora -- serve)
import path from "node:path";
import { chromium } from "@playwright/test";

const [file, intent, out] = process.argv.slice(2);
const base = `http://localhost:${process.env.AURORA_PORT ?? 4317}`;
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(base);
await page.locator(".conn.up").waitFor();
const res = await fetch(`${base}/api/render`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: path.resolve(file), intent }) });
const { renderId } = await res.json();
await page.goto(`${base}/#${renderId}`);
await page.locator(".footer").waitFor({ timeout: 300_000 });
await page.waitForTimeout(500);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
