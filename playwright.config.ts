import { defineConfig, devices } from "@playwright/test";

// HUB_PORT lets two checkouts run their browser tests at the same time.
const port = process.env.HUB_PORT ?? "4040";
const hubUrl = `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: hubUrl },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run hub -- -p ${port}`,
    url: hubUrl,
    reuseExistingServer: true,
  },
});
