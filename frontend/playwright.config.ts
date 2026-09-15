import { defineConfig, devices } from "@playwright/test";

// Real end-to-end run against the docker-compose stack.
// WEB_PORT/API_PORT mirror the compose overrides (defaults 8080/8000).
const webPort = process.env.WEB_PORT ?? "8080";
const apiPort = process.env.API_PORT ?? "8000";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
