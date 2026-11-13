import { defineConfig, devices } from "@playwright/test";
import { FROZEN_HUB_MOMENT } from "./e2e/frozen-hub";
import { HUB_DATABASE_PATH_VARIABLE, HUB_FROZEN_AT_VARIABLE } from "./lib/demo/hub";
import { IN_MEMORY_DATABASE } from "./lib/store/database";
import { HUB_PLANS_FOLDER_VARIABLE } from "./lib/village/clipboard";
import { SCRIPTED_PLANS_FOLDER } from "./e2e/scripted-plans";

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
    // A live hub adds lines for the real time, so no two runs would see the
    // same village. The tests' own hub stays on one moment, and keeps its
    // record in memory so nothing is left behind and no run sees another's.
    env: {
      [HUB_FROZEN_AT_VARIABLE]: FROZEN_HUB_MOMENT,
      [HUB_DATABASE_PATH_VARIABLE]: IN_MEMORY_DATABASE,
      // The clipboard reads invented plans kept in this repo, never the owner's own projects.
      [HUB_PLANS_FOLDER_VARIABLE]: SCRIPTED_PLANS_FOLDER,
    },
  },
});
