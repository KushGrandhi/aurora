import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 4398;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  workers: 1, // one shared server: the screen follows new views, so tests must not create views concurrently
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome" },
  webServer: {
    command: "npx vite build && cd ../.. && npx tsx packages/server/src/cli.ts serve",
    url: `http://localhost:${PORT}/api/health`,
    env: { GENUI_PORT: String(PORT), GENUI_FAKE_PROVIDER: "1", GENUI_NO_OPEN: "1", GENUI_VIEWS_DIR: path.join(tmpdir(), `genui-e2e-${Date.now()}`) },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
