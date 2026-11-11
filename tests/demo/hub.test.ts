import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HUB_DATABASE_PATH, IN_MEMORY_DATABASE } from "../../lib/store";
import {
  DEMO_SCRIPTS,
  HUB_DATABASE_PATH_VARIABLE,
  HUB_FROZEN_AT_VARIABLE,
  closeDemoHub,
  demoHub,
  hubDatabasePath,
  hubFrozenAt,
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

describe("freezing the hub, so every browser test sees the same village", () => {
  const FROZEN_AT = "2026-10-05T14:07:30Z";

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs live when nothing asks it to freeze: its clock is the real time", () => {
    expect(hubFrozenAt({})).toBeNull();
    expect(hubFrozenAt({ [HUB_FROZEN_AT_VARIABLE]: "  " })).toBeNull();
    vi.stubEnv(HUB_FROZEN_AT_VARIABLE, "");

    const before = Date.now();
    const hand = handTimer();
    const hub = demoHub({ databasePath: IN_MEMORY_DATABASE, timer: hand.timer });

    expect(hub.isFrozen).toBe(false);
    expect(hub.now().getTime()).toBeGreaterThanOrEqual(before);
    expect(hub.now().getTime()).toBeLessThanOrEqual(Date.now());
    expect(hand.isRunning()).toBe(true);
  });

  it("reads the moment to freeze at from the environment", () => {
    expect(hubFrozenAt({ [HUB_FROZEN_AT_VARIABLE]: FROZEN_AT })).toEqual(new Date(FROZEN_AT));
  });

  it.each(["tomorrow", "2026-10-05", "2026-10-05T14:07:30", "2026-13-45T14:07:30Z"])(
    "refuses a freezing moment written as %s, and never guesses",
    (written) => {
      expect(() => hubFrozenAt({ [HUB_FROZEN_AT_VARIABLE]: written })).toThrow(
        "isn't a time the hub can read",
      );
    },
  );

  it("a frozen hub stays on its moment: its clock never moves and its player never ticks", () => {
    vi.useFakeTimers();
    vi.stubEnv(HUB_FROZEN_AT_VARIABLE, FROZEN_AT);

    const hub = demoHub({ databasePath: IN_MEMORY_DATABASE });
    const atStart = hub.store.readLines();

    expect(hub.isFrozen).toBe(true);
    expect(hub.now()).toEqual(new Date(FROZEN_AT));
    expect(vi.getTimerCount()).toBe(0);

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(hub.now()).toEqual(new Date(FROZEN_AT));
    expect(hub.store.readLines()).toEqual(atStart);
  });

  it("a frozen hub holds the demo up to its moment and not a line further", () => {
    vi.stubEnv(HUB_FROZEN_AT_VARIABLE, FROZEN_AT);
    const hub = demoHub({ databasePath: IN_MEMORY_DATABASE });

    for (const script of DEMO_SCRIPTS) {
      const times = hub.store
        .readLines({ project: script.project })
        .map((stored) => Date.parse(stored.line.when));
      expect(times.length, script.project).toBeGreaterThan(0);
      expect(Math.max(...times), script.project).toBeLessThanOrEqual(Date.parse(FROZEN_AT));
    }
  });

  it("two hubs frozen at the same moment hold the very same lines", () => {
    vi.stubEnv(HUB_FROZEN_AT_VARIABLE, FROZEN_AT);
    const first = demoHub({ databasePath: IN_MEMORY_DATABASE }).store.readLines();
    closeDemoHub();
    const second = demoHub({ databasePath: IN_MEMORY_DATABASE }).store.readLines();

    expect(second).toEqual(first);
  });
});
