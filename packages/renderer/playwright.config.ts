import { defineConfig } from "@playwright/test";

const PORT = 4398;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome" },
  webServer: {
    command: "npx vite build && cd ../.. && npx tsx packages/server/src/cli.ts serve",
    url: `http://localhost:${PORT}/api/health`,
    env: { GENUI_PORT: String(PORT), GENUI_FAKE_PROVIDER: "1", GENUI_NO_OPEN: "1" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
