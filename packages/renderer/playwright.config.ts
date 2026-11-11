import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 4398;
// Fonts never come from the network in tests: an empty cache that tests fill themselves, and fetching turned off.
export const FONTS_DIR = path.join(tmpdir(), "aurora-e2e-fonts");
// A second server in hosted mode (bearer keys, share links), for hosted.spec.ts only.
const HOSTED_PORT = 4396;
export const HOSTED_URL = `http://localhost:${HOSTED_PORT}`;
export const HOSTED_INVITE = "e2e-invite";
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  workers: 1, // one shared server: the screen follows new views, so tests must not create views concurrently
  use: { baseURL: `http://localhost:${PORT}`, channel: "chrome" },
  webServer: [{
    command: "npm run build && cd ../.. && npx tsx packages/server/src/cli.ts serve",
    url: `http://localhost:${PORT}/api/health`,
    env: { AURORA_PORT: String(PORT), AURORA_FAKE_PROVIDER: "1", AURORA_NO_OPEN: "1", AURORA_FONTS_OFFLINE: "1", AURORA_FONTS_DIR: FONTS_DIR, AURORA_SHOTS_DIR: path.join(tmpdir(), `aurora-e2e-shots-${Date.now()}`), AURORA_VIEWS_DIR: path.join(tmpdir(), `aurora-e2e-${Date.now()}`) },
    reuseExistingServer: false,
    timeout: 60_000,
  }, {
    command: "cd ../.. && npx tsx packages/server/src/cli.ts serve",
    url: `${HOSTED_URL}/api/health`,
    env: {
      AURORA_MODE: "hosted", AURORA_PORT: String(HOSTED_PORT), AURORA_FAKE_PROVIDER: "1", AURORA_FONTS_OFFLINE: "1", AURORA_FONTS_DIR: FONTS_DIR,
      AURORA_SECRET: "e2e-secret-0123456789abcdef0123456789", AURORA_INVITE: HOSTED_INVITE, AURORA_PUBLIC_URL: HOSTED_URL,
      AURORA_DATA_DIR: path.join(tmpdir(), `aurora-e2e-hosted-${Date.now()}`),
    },
    reuseExistingServer: false,
    timeout: 60_000,
  }],
});
