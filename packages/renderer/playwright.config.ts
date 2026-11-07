import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 4398;
// Fonts never come from the network in tests: an empty cache that tests fill themselves, and fetching turned off.
export const FONTS_DIR = path.join(tmpdir(), "aurora-e2e-fonts");
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  workers: 1, // one shared server: the screen follows new views, so tests must not create views concurrently
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome" },
  webServer: {
    command: "npm run build && cd ../.. && npx tsx packages/server/src/cli.ts serve",
    url: `http://localhost:${PORT}/api/health`,
    env: { AURORA_PORT: String(PORT), AURORA_FAKE_PROVIDER: "1", AURORA_NO_OPEN: "1", AURORA_FONTS_OFFLINE: "1", AURORA_FONTS_DIR: FONTS_DIR, AURORA_VIEWS_DIR: path.join(tmpdir(), `aurora-e2e-${Date.now()}`) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
