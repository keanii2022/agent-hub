import { defineConfig } from "@playwright/test";
import hubTests from "../../playwright.config";

// Takes the README's desk and build-board pictures from the tests' own frozen
// hub, so they come out the same every time. Kept out of `npm run e2e`.
const [frozenHub] = Array.isArray(hubTests.webServer) ? hubTests.webServer : [hubTests.webServer!];

export default defineConfig({
  ...hubTests,
  testDir: ".",
  testMatch: "readme.capture.ts",
  projects: [hubTests.projects![0]],
  webServer: { ...frozenHub, reuseExistingServer: false },
});
