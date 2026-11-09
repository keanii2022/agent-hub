import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HUB_DATABASE_PATH, IN_MEMORY_DATABASE } from "../../lib/store";
import {
  DEMO_SCRIPTS,
  HUB_DATABASE_PATH_VARIABLE,
  closeDemoHub,
  demoHub,
  hubDatabasePath,
} from "../../lib/demo";
import { A_MOMENT_IN_THE_DEMO, clockAt, handTimer } from "./helpers";
import { keepTheNetworkOff } from "./network-off";

keepTheNetworkOff();

const temporaryFolders: string[] = [];

function temporaryDatabasePath(): string {
  const folder = mkdtempSync(join(tmpdir(), "agent-hub-demo-"));
  temporaryFolders.push(folder);
  return join(folder, "nested", "hub.sqlite");
}

afterEach(() => {
  closeDemoHub();
  vi.unstubAllEnvs();
  for (const folder of temporaryFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe("where the hub keeps its record", () => {
  it("uses the store's own place when nothing else is chosen", () => {
    expect(hubDatabasePath({})).toBe(HUB_DATABASE_PATH);
    expect(hubDatabasePath({ [HUB_DATABASE_PATH_VARIABLE]: "  " })).toBe(HUB_DATABASE_PATH);
  });

  it("uses the place the environment names", () => {
    expect(hubDatabasePath({ [HUB_DATABASE_PATH_VARIABLE]: "elsewhere/hub.sqlite" })).toBe(
      "elsewhere/hub.sqlite",
    );
  });

  it("opens the hub's record at the place the environment names", () => {
    const databasePath = temporaryDatabasePath();
    vi.stubEnv(HUB_DATABASE_PATH_VARIABLE, databasePath);

    const hub = demoHub({ now: () => A_MOMENT_IN_THE_DEMO, timer: handTimer().timer });

    expect(hub.databasePath).toBe(databasePath);
    expect(existsSync(databasePath)).toBe(true);
  });
});

describe("starting the hub", () => {
  it("loads the demo: every demo project already has lines, all marked demo (H10)", () => {
    const hub = demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: () => A_MOMENT_IN_THE_DEMO,
      timer: handTimer().timer,
    });

    for (const script of DEMO_SCRIPTS) {
      const lines = hub.store.readLines({ project: script.project });
      expect(lines.length).toBeGreaterThan(0);
      for (const stored of lines) expect(stored.line.demo).toBe(true);
    }
    expect(hub.player.firstPlay.added).toBe(hub.store.readLines().length);
  });

  it("keeps playing new events after it has started", () => {
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    const hub = demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: clock.now,
      timer: hand.timer,
    });
    const atStart = hub.store.readLines().length;

    clock.moveOn(300);
    hand.tick();

    expect(hub.store.readLines().length).toBeGreaterThan(atStart);
  });

  it("starts one player, however often the hub is asked for", () => {
    const hand = handTimer();
    const options = {
      databasePath: IN_MEMORY_DATABASE,
      now: () => A_MOMENT_IN_THE_DEMO,
      timer: hand.timer,
    };

    const first = demoHub(options);
    const second = demoHub(options);

    expect(second).toBe(first);
    expect(hand.timesStarted()).toBe(1);
  });

  it("still has one player after the code is loaded again, as a hot reload does", async () => {
    const hand = handTimer();
    const first = demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: () => A_MOMENT_IN_THE_DEMO,
      timer: hand.timer,
    });

    vi.resetModules();
    const reloaded = await import("../../lib/demo/hub");

    expect(reloaded.demoHub).not.toBe(demoHub);
    expect(reloaded.demoHub({ timer: hand.timer })).toBe(first);
    expect(hand.timesStarted()).toBe(1);
  });

  it("can be closed and started afresh", () => {
    const hand = handTimer();
    const first = demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: () => A_MOMENT_IN_THE_DEMO,
      timer: hand.timer,
    });

    closeDemoHub();
    expect(hand.isRunning()).toBe(false);

    const second = demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: () => A_MOMENT_IN_THE_DEMO,
      timer: hand.timer,
    });
    expect(second).not.toBe(first);
    expect(second.player.firstPlay.added).toBe(first.player.firstPlay.added);
    expect(second.store.readLines()).toHaveLength(second.player.firstPlay.added);
  });
});
