import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WAITING_STATUS, type FeedLine } from "../../lib/feed";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore } from "../../lib/store";
import {
  DEMO_SCRIPTS,
  DEMO_TICK_MS,
  FIRST_DEMO_DAY_STARTS,
  compileDemoScript,
  createDemoPlayer,
  dayNumberAt,
  everyInterval,
  startDemoPlayer,
  startOfDay,
  type DemoScript,
} from "../../lib/demo";
import {
  A_MOMENT_IN_THE_DEMO,
  clockAt,
  handTimer,
  tinyScript,
  unixSeconds,
} from "./helpers";
import { keepTheNetworkOff } from "./network-off";

keepTheNetworkOff();

const openStores: HubStore[] = [];
const temporaryFolders: string[] = [];

function storeAt(databasePath: string): HubStore {
  const store = openHubStore(databasePath);
  openStores.push(store);
  return store;
}

const memoryStore = () => storeAt(IN_MEMORY_DATABASE);

function temporaryDatabasePath(): string {
  const folder = mkdtempSync(join(tmpdir(), "agent-hub-demo-"));
  temporaryFolders.push(folder);
  return join(folder, "hub.sqlite");
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.close();
  for (const folder of temporaryFolders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

const linesIn = (store: HubStore): FeedLine[] =>
  store.readLines({ order: "stored" }).map((stored) => stored.line);

const linesOfProjectSince = (store: HubStore, project: string, since: Date) =>
  store.readLines({ project, happenedSince: since }).map((stored) => stored.line);

function historyStartOf(script: DemoScript, moment: Date): Date {
  const compiled = compileDemoScript(script);
  return startOfDay(compiled, dayNumberAt(compiled, moment) - 1);
}

function minutesAfter(moment: Date, minutes: number): Date {
  return new Date(moment.getTime() + minutes * 60_000);
}

describe("filling in the recent past", () => {
  it("stores what already happened in every demo project, back to the start of the scripted day before", () => {
    const store = memoryStore();
    const report = createDemoPlayer({
      store,
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();

    expect(report.added).toBeGreaterThan(60);
    expect(report.refused).toEqual([]);
    expect(report.brokenScripts).toEqual([]);
    expect(report.upTo).toBe("2026-10-05T14:07:00Z");

    for (const script of DEMO_SCRIPTS) {
      const lines = store.readLines({ project: script.project });
      const historyStarts = historyStartOf(script, A_MOMENT_IN_THE_DEMO);
      expect(lines.length).toBeGreaterThan(script.requests.length);
      expect(unixSeconds(lines[0].line.when)).toBeGreaterThanOrEqual(
        historyStarts.getTime() / 1000,
      );
      expect(unixSeconds(lines[0].line.when)).toBeLessThan(
        historyStarts.getTime() / 1000 + 60,
      );
    }
  });

  it("stores nothing that hasn't happened yet", () => {
    const store = memoryStore();
    createDemoPlayer({ store, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
    for (const line of linesIn(store)) {
      expect(unixSeconds(line.when)).toBeLessThanOrEqual(
        A_MOMENT_IN_THE_DEMO.getTime() / 1000,
      );
    }
  });

  it("leaves the village busy: agents at work and requests waiting for the owner", () => {
    const store = memoryStore();
    createDemoPlayer({ store, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
    const lines = linesIn(store);

    const stillWaiting = lines.filter(
      (waiting) =>
        waiting.status === WAITING_STATUS &&
        !lines.some(
          (later) =>
            later.project === waiting.project &&
            later.request === waiting.request &&
            later.id !== waiting.id &&
            unixSeconds(later.when) >= unixSeconds(waiting.when),
        ),
    );
    expect(stillWaiting.length).toBeGreaterThanOrEqual(2);

    for (const script of DEMO_SCRIPTS) {
      const newest = store.readLines({
        project: script.project,
        newestFirst: true,
        limit: 1,
      })[0];
      const secondsAgo =
        A_MOMENT_IN_THE_DEMO.getTime() / 1000 - unixSeconds(newest.line.when);
      expect(secondsAgo).toBeLessThan(120);
    }
  });

  it("H10: stores only lines marked demo", () => {
    const store = memoryStore();
    createDemoPlayer({ store, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
    for (const line of linesIn(store)) expect(line.demo).toBe(true);
  });

  it("plays nothing before the first demo day", () => {
    const store = memoryStore();
    const report = createDemoPlayer({
      store,
      now: () => new Date(FIRST_DEMO_DAY_STARTS.getTime() - 86_400_000),
    }).playDueLines();
    expect(report.added).toBe(0);
    expect(linesIn(store)).toEqual([]);
  });
});

describe("running the demo twice", () => {
  it("gives identical data in two fresh records", () => {
    const first = memoryStore();
    const second = memoryStore();
    createDemoPlayer({ store: first, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
    createDemoPlayer({ store: second, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();

    expect(first.readLines({ order: "stored" }).length).toBeGreaterThan(60);
    expect(second.readLines({ order: "stored" })).toEqual(
      first.readLines({ order: "stored" }),
    );
  });

  it("adds nothing when it plays again over a record that already has the lines", () => {
    const store = memoryStore();
    const firstRun = createDemoPlayer({
      store,
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();
    const before = store.readLines({ order: "stored" });

    const secondRun = createDemoPlayer({
      store,
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();

    expect(secondRun.added).toBe(0);
    expect(secondRun.alreadyStored).toBe(firstRun.added);
    expect(secondRun.refused).toEqual([]);
    expect(store.readLines({ order: "stored" })).toEqual(before);
  });

  it("gives the same lines whether it plays along second by second or fills them in at one go", () => {
    const later = minutesAfter(A_MOMENT_IN_THE_DEMO, 35);

    const playedAlong = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    startDemoPlayer({ store: playedAlong, now: clock.now, timer: hand.timer });
    while (clock.now() < later) {
      clock.moveOn(1);
      hand.tick();
    }

    const filledIn = memoryStore();
    createDemoPlayer({ store: filledIn, now: () => later }).playDueLines();

    for (const script of DEMO_SCRIPTS) {
      const historyStarts = historyStartOf(script, later);
      const expected = linesOfProjectSince(filledIn, script.project, historyStarts);
      expect(expected.length).toBeGreaterThan(script.requests.length);
      expect(linesOfProjectSince(playedAlong, script.project, historyStarts)).toEqual(
        expected,
      );
    }
  });

  it("picks up after a restart without storing anything twice", () => {
    const later = minutesAfter(A_MOMENT_IN_THE_DEMO, 5);
    const databasePath = temporaryDatabasePath();

    const beforeRestart = storeAt(databasePath);
    createDemoPlayer({ store: beforeRestart, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
    beforeRestart.close();

    const afterRestart = storeAt(databasePath);
    const report = createDemoPlayer({ store: afterRestart, now: () => later }).playDueLines();

    const neverStopped = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const player = createDemoPlayer({ store: neverStopped, now: clock.now });
    player.playDueLines();
    clock.moveTo(later);
    player.playDueLines();

    expect(report.added).toBeGreaterThan(0);
    expect(report.alreadyStored).toBeGreaterThan(0);
    expect(afterRestart.readLines({ order: "stored" })).toEqual(
      neverStopped.readLines({ order: "stored" }),
    );
  });
});

describe("playing on a clock", () => {
  it("starts by filling in the past, then adds each new line when its moment comes", () => {
    const store = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    const running = startDemoPlayer({ store, now: clock.now, timer: hand.timer });

    expect(running.firstPlay.added).toBe(linesIn(store).length);
    expect(hand.everyMs()).toBe(DEMO_TICK_MS);

    let stored = linesIn(store).length;
    let ticksThatAddedSomething = 0;
    for (let second = 0; second < 10 * 60; second += 1) {
      clock.moveOn(1);
      hand.tick();
      const lines = linesIn(store);
      for (const line of lines.slice(stored)) {
        expect(line.when).toBe(clock.now().toISOString().replace(".000Z", "Z"));
      }
      if (lines.length > stored) ticksThatAddedSomething += 1;
      stored = lines.length;
    }

    expect(ticksThatAddedSomething).toBeGreaterThan(10);
    expect(ticksThatAddedSomething).toBeLessThan(10 * 60);
    expect(running.lastProblem()).toBeNull();
  });

  it("keeps the record in the order things happened", () => {
    const store = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    startDemoPlayer({ store, now: clock.now, timer: hand.timer });
    for (let tick = 0; tick < 40; tick += 1) {
      clock.moveOn(30);
      hand.tick();
    }
    const times = linesIn(store).map((line) => unixSeconds(line.when));
    expect(times).toEqual([...times].sort((earlier, later) => earlier - later));
  });

  it("stops playing when it is stopped", () => {
    const store = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    const running = startDemoPlayer({ store, now: clock.now, timer: hand.timer });
    const stored = linesIn(store).length;

    running.stop();
    clock.moveOn(600);
    hand.tick();

    expect(hand.isRunning()).toBe(false);
    expect(linesIn(store)).toHaveLength(stored);
  });

  it("skips the gap after a long sleep instead of replaying every day it missed", () => {
    const store = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    startDemoPlayer({ store, now: clock.now, timer: hand.timer });

    const wokeUp = minutesAfter(A_MOMENT_IN_THE_DEMO, 9 * 60);
    clock.moveTo(wokeUp);
    hand.tick();

    const freshStart = memoryStore();
    createDemoPlayer({ store: freshStart, now: () => wokeUp }).playDueLines();
    for (const script of DEMO_SCRIPTS) {
      const historyStarts = historyStartOf(script, wokeUp);
      expect(linesOfProjectSince(store, script.project, historyStarts)).toEqual(
        linesOfProjectSince(freshStart, script.project, historyStarts),
      );
      const gapStarts = minutesAfter(A_MOMENT_IN_THE_DEMO, 1);
      const inTheGap = store
        .readLines({ project: script.project, happenedSince: gapStarts })
        .filter((stored) => unixSeconds(stored.line.when) < historyStarts.getTime() / 1000);
      expect(inTheGap).toEqual([]);
    }
  });

  it("plays nothing when the clock jumps backwards", () => {
    const store = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const player = createDemoPlayer({ store, now: clock.now });
    player.playDueLines();

    clock.moveTo(minutesAfter(A_MOMENT_IN_THE_DEMO, -3));
    const report = player.playDueLines();

    expect(report.added).toBe(0);
    expect(report.alreadyStored).toBe(0);
  });

  it("survives a tick that can't write, and stores those lines on the next one", () => {
    const store = memoryStore();
    const clock = clockAt(A_MOMENT_IN_THE_DEMO);
    const hand = handTimer();
    let recordIsStuck = false;
    const running = startDemoPlayer({
      store: {
        addLines(candidates) {
          if (recordIsStuck) throw new Error("the record is stuck");
          return store.addLines(candidates);
        },
      },
      now: clock.now,
      timer: hand.timer,
    });
    const stored = linesIn(store).length;

    recordIsStuck = true;
    clock.moveOn(300);
    expect(() => hand.tick()).not.toThrow();
    expect(running.lastProblem()).toBeInstanceOf(Error);
    expect(linesIn(store)).toHaveLength(stored);

    recordIsStuck = false;
    clock.moveOn(1);
    hand.tick();
    expect(running.lastProblem()).toBeNull();

    const neverStuck = memoryStore();
    createDemoPlayer({ store: neverStuck, now: clock.now }).playDueLines();
    expect(linesIn(store)).toEqual(linesIn(neverStuck));
  });

  it("has a real timer that can be stopped before it ever ticks", () => {
    let ticks = 0;
    const stop = everyInterval(DEMO_TICK_MS, () => {
      ticks += 1;
    });
    stop();
    expect(ticks).toBe(0);
  });
});

describe("the list of scripts", () => {
  it("plays a third demo project from one more entry in the list", () => {
    const store = memoryStore();
    const report = createDemoPlayer({
      store,
      scripts: [...DEMO_SCRIPTS, tinyScript("garden")],
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();

    expect(report.refused).toEqual([]);
    expect(report.brokenScripts).toEqual([]);
    const garden = store.readLines({ project: "garden" });
    expect(garden.length).toBeGreaterThan(0);
    for (const stored of garden) expect(stored.line.demo).toBe(true);
    for (const script of DEMO_SCRIPTS) {
      expect(store.readLines({ project: script.project }).length).toBeGreaterThan(0);
    }
  });

  it("H9: a script that can't be read is set aside and the others keep playing", () => {
    const garden = tinyScript("garden");
    const unreadable: DemoScript = { ...garden, dayLength: "all day" };
    const store = memoryStore();
    const report = createDemoPlayer({
      store,
      scripts: [unreadable, ...DEMO_SCRIPTS],
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();

    expect(report.brokenScripts).toHaveLength(1);
    expect(report.brokenScripts[0].project).toBe("garden");
    expect(store.readLines({ project: "garden" })).toEqual([]);
    for (const script of DEMO_SCRIPTS) {
      expect(store.readLines({ project: script.project }).length).toBeGreaterThan(0);
    }
  });

  it("H9: a script with lines the checker refuses never stops the other lines", () => {
    const garden = tinyScript("garden");
    const halfBroken: DemoScript = {
      ...garden,
      requests: [
        [{ ...garden.requests[0][0], step: "two words" }, garden.requests[0][1]],
      ],
    };

    const withBrokenHouse = memoryStore();
    const report = createDemoPlayer({
      store: withBrokenHouse,
      scripts: [halfBroken, ...DEMO_SCRIPTS],
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();

    const withoutIt = memoryStore();
    createDemoPlayer({ store: withoutIt, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();

    expect(report.refused.length).toBeGreaterThan(0);
    for (const refused of report.refused) expect(refused.project).toBe("garden");
    expect(withBrokenHouse.readLines({ project: "garden" }).length).toBeGreaterThan(0);
    for (const script of DEMO_SCRIPTS) {
      expect(
        withBrokenHouse.readLines({ project: script.project }).map((stored) => stored.line),
      ).toEqual(withoutIt.readLines({ project: script.project }).map((stored) => stored.line));
    }
  });

  it("plays only the first of two scripts for the same project", () => {
    const store = memoryStore();
    const report = createDemoPlayer({
      store,
      scripts: [tinyScript("garden"), tinyScript("garden")],
      now: () => A_MOMENT_IN_THE_DEMO,
    }).playDueLines();

    expect(report.brokenScripts).toHaveLength(1);
    expect(report.refused).toEqual([]);
    expect(report.alreadyStored).toBe(0);
  });
});
