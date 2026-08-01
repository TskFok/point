import { defineConfig, devices } from "playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { resolveTestDatabaseUrl } from "./playwright/fixtures/database";

const apiOrigin = "http://127.0.0.1:3100";
const webOrigin = "http://127.0.0.1:3101";
const databaseUrl = resolveTestDatabaseUrl();
const uploadRoot = join(
  tmpdir(),
  `point-quest-playwright-uploads-${process.pid}`,
);

process.env.DATABASE_URL = databaseUrl;
process.env.PLAYWRIGHT_UPLOAD_ROOT = uploadRoot;
process.env.TEST_DATABASE_URL = databaseUrl;

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  globalSetup: "./playwright/fixtures/database.ts",
  outputDir: "test-results/playwright",
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  retries: process.env.CI ? 1 : 0,
  testDir: "./playwright",
  timeout: 45_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: webOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm --filter @point-quest/api start",
      env: {
        AUTH_JWT_SECRET:
          "point-quest-playwright-jwt-secret-with-at-least-32-characters",
        DATABASE_URL: databaseUrl,
        PORT: "3100",
        PRODUCT_UPLOAD_ROOT: uploadRoot,
        WEB_ORIGIN: webOrigin,
      },
      reuseExistingServer: false,
      stderr: "pipe",
      stdout: "pipe",
      timeout: 120_000,
      url: `${apiOrigin}/api/v1/health`,
    },
    {
      command:
        "pnpm --filter @point-quest/web exec next dev --hostname 127.0.0.1 --port 3101",
      env: {
        API_SERVER_BASE_URL: `${apiOrigin}/api/v1`,
      },
      reuseExistingServer: false,
      stderr: "pipe",
      stdout: "pipe",
      timeout: 120_000,
      url: webOrigin,
    },
  ],
  workers: 1,
});
