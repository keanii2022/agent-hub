import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/village/route";
import { houses } from "../../config/houses";
import {
  APPROVAL_DESK_DATABASE_VARIABLE,
  DEMO_SCRIPTS,
  REAL_FEEDS_ASKED_EVERY_MS,
  REAL_HOUSE_NO_NEWS_AFTER_MS,
  approvalDeskDatabasePath,
  closeDemoHub,
  configuredRealFeeds,
  createDemoPlayer,
  demoHub,
  readVillageOfHub,
  startRealFeeds,
  type DemoHub,
  type DemoTimer,
  type RealFeed,
} from "../../lib/demo";
import { APPROVAL_DESK_AGENT, APPROVAL_DESK_PROJECT } from "../../lib/feed/translators/approval-desk";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore } from "../../lib/store";
import { placeHouses } from "../../lib/village/houses";
import { DEMO_TAG } from "../../lib/village/houses/state";
import {
  NO_NEWS_AFTER_MS,
  houseStatusFrom,
  projectStateOf,
  projectsOf,
  readVillageState,
  type ProjectState,
  type VillageState,
} from "../../lib/village/state";
import {
  INVENTED_ENTRIES,
  NEWEST_INVENTED_ENTRY_AT,
  makeLogbookFixture,
  timeOn,
  type InventedEntry,
  type LogbookFixture,
} from "../feed/translators/logbook-fixture";
import { clockAt, handTimer } from "./helpers";
import { keepTheNetworkOff } from "./network-off";

const network = keepTheNetworkOff();

const villageProjects = projectsOf(houses);
const TEAM_HOUSE = villageProjects[1].project;
const HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY = new Date(NEWEST_INVENTED_ENTRY_AT.getTime() + 30_000);
const after = (ms: number) => new Date(NEWEST_INVENTED_ENTRY_AT.getTime() + ms);
const MINUTE = 60_000;

/** Timers that only tick when a test says so. Unlike the shared hand timer, it keeps every timer started on it. */
function handTimers() {
  const ticks: (() => void)[] = [];
  const everyMs: number[] = [];
  const timer: DemoTimer = (every, tick) => {
    ticks.push(tick);
    everyMs.push(every);
    return () => {
      ticks.splice(ticks.indexOf(tick), 1);
    };
  };
  return { timer, everyMs, tickAll: () => [...ticks].forEach((tick) => tick()), running: () => ticks.length };
}

const fixtures: LogbookFixture[] = [];
const stores: HubStore[] = [];

function fixture(...args: Parameters<typeof makeLogbookFixture>): LogbookFixture {
  const made = makeLogbookFixture(...args);
  fixtures.push(made);
  return made;
}

function emptyStore(): HubStore {
  const store = openHubStore(IN_MEMORY_DATABASE);
  stores.push(store);
  return store;
}

/** Starts the one hub the way the server does, told where approval-desk's database is. */
function hubToldAbout(databasePath: string, now: Date = HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY) {
  vi.stubEnv(APPROVAL_DESK_DATABASE_VARIABLE, databasePath);
  const clock = clockAt(now);
  const timers = handTimers();
  const hub = demoHub({ databasePath: IN_MEMORY_DATABASE, now: clock.now, timer: timers.timer });
  return { hub, clock, timers };
}

async function villageFromTheRoute(): Promise<VillageState> {
  const response = GET();
  expect(response.status).toBe(200);
  return (await response.json()) as VillageState;
}

function stateOf(village: VillageState, project: string): ProjectState {
  const state = projectStateOf(village, project);
  if (state === null) throw new Error(`The village has no ${project}.`);
  return state;
}

const linesOf = (hub: DemoHub, project: string) => hub.store.readLines({ project }).map((stored) => stored.line);

afterEach(() => {
  closeDemoHub();
  vi.unstubAllEnvs();
  for (const store of stores.splice(0)) store.close();
  for (const made of fixtures.splice(0)) made.remove();
  expect(network.attempts.splice(0)).toEqual([]);
});

describe("where approval-desk's database is", () => {
  it("comes from the hub's settings, and is nowhere when they don't say", () => {
    expect(APPROVAL_DESK_DATABASE_VARIABLE).toBe("APPROVAL_DESK_DATABASE");
    expect(approvalDeskDatabasePath({})).toBeNull();
    expect(approvalDeskDatabasePath({ APPROVAL_DESK_DATABASE: "" })).toBeNull();
    expect(approvalDeskDatabasePath({ APPROVAL_DESK_DATABASE: "   " })).toBeNull();
    expect(approvalDeskDatabasePath({ APPROVAL_DESK_DATABASE: "somewhere/desk.db" })).toBe("somewhere/desk.db");

    expect(configuredRealFeeds({})).toEqual([]);
    expect(configuredRealFeeds({ APPROVAL_DESK_DATABASE: "somewhere/desk.db" }).map((feed) => feed.project)).toEqual([
      APPROVAL_DESK_PROJECT,
    ]);
  });
});

describe("the hub when it isn't told where approval-desk's database is", () => {
  it("H10: runs as before: every house on its scripted day, marked demo, with one timer", async () => {
    vi.stubEnv(APPROVAL_DESK_DATABASE_VARIABLE, "");
    const hand = handTimer();
    const hub = demoHub({
      databasePath: IN_MEMORY_DATABASE,
      now: () => HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY,
      timer: hand.timer,
    });
    const village = await villageFromTheRoute();

    expect(hub.realFeeds.projects).toEqual([]);
    expect(hand.timesStarted()).toBe(1);
    expect(village).toEqual(
      readVillageState({ store: hub.store, projects: villageProjects, now: HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY }),
    );
    expect(village.projects.map((project) => project.isDemo)).toEqual([true, true]);
    expect(hub.store.readLines().every((stored) => stored.line.demo)).toBe(true);
    expect(linesOf(hub, APPROVAL_DESK_PROJECT).length).toBeGreaterThan(0);
  });
});

describe("the hub when it is told where approval-desk's database is", () => {
  it("feeds approval-desk's last ten logbook entries into the record as real lines", () => {
    const { hub } = hubToldAbout(fixture().databasePath);
    const lines = linesOf(hub, APPROVAL_DESK_PROJECT);

    expect(hub.realFeeds.projects).toEqual([APPROVAL_DESK_PROJECT]);
    expect(lines.map((line) => line.id)).toEqual(["5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
    expect(lines.every((line) => line.demo === false && line.agent === APPROVAL_DESK_AGENT)).toBe(true);
    expect(hub.realFeeds.latestReports()).toEqual([
      { project: APPROVAL_DESK_PROJECT, added: 10, alreadyStored: 0, refused: [], problem: null },
    ]);
  });

  it("H10: doesn't play approval-desk's scripted day, and still plays the other houses'", () => {
    const { hub } = hubToldAbout(fixture().databasePath);

    expect(linesOf(hub, APPROVAL_DESK_PROJECT).some((line) => line.demo)).toBe(false);
    expect(linesOf(hub, TEAM_HOUSE).length).toBeGreaterThan(0);
    expect(linesOf(hub, TEAM_HOUSE).every((line) => line.demo)).toBe(true);
  });

  it("H10: the village shows the house as real, with its agent at work and what waits for the owner", async () => {
    hubToldAbout(fixture().databasePath);
    const village = await villageFromTheRoute();
    const approvalDesk = stateOf(village, APPROVAL_DESK_PROJECT);

    expect(approvalDesk).toMatchObject({
      isDemo: false,
      isDark: false,
      whyDark: null,
      lastNewsAt: timeOn("14:15:00"),
      workingCount: 1,
    });
    expect(approvalDesk.agents.map((agent) => [agent.name, agent.isWorking, agent.latest.what])).toEqual([
      [APPROVAL_DESK_AGENT, true, "The gate allowed a $12.00 refund"],
    ]);
    // Entries 5 and 6 were answered by the owner; 9 and 13 still wait.
    expect(approvalDesk.waiting.map((item) => [item.line.id, item.line.request])).toEqual([
      ["9", "REQ-906"],
      ["13", "REQ-908"],
    ]);
    expect(stateOf(village, TEAM_HOUSE).isDemo).toBe(true);
  });

  it("H10: the real house wears no DEMO tag, and the scripted one next to it still does", async () => {
    hubToldAbout(fixture().databasePath);
    const village = await villageFromTheRoute();
    vi.stubEnv("HUB_APPROVAL_DESK_DATA", "real");
    vi.resetModules();
    const [approvalDeskHouse, teamHouse] = placeHouses((await import("../../config/houses")).houses);

    expect(houseStatusFrom(approvalDeskHouse, village)).toMatchObject({ tag: null, isDark: false, litWindows: 1 });
    expect(houseStatusFrom(teamHouse, village).tag).toBe(DEMO_TAG);
  });

  it("the other houses are exactly as they are without it", async () => {
    const { hub } = hubToldAbout(fixture().databasePath);
    const village = await villageFromTheRoute();
    const demoOnly = emptyStore();
    createDemoPlayer({ store: demoOnly, now: hub.now }).playDueLines();

    expect(stateOf(village, TEAM_HOUSE)).toEqual(
      stateOf(readVillageState({ store: demoOnly, projects: villageProjects, now: hub.now() }), TEAM_HOUSE),
    );
  });
});

describe("real lines keep their own time", () => {
  it("stores every line with the time its logbook entry was written", () => {
    const { hub } = hubToldAbout(fixture().databasePath, after(40 * 24 * 60 * MINUTE));

    expect(linesOf(hub, APPROVAL_DESK_PROJECT).map((line) => line.when)).toEqual(
      INVENTED_ENTRIES.slice(4).map((entry) => timeOn(entry.at)),
    );
  });

  it("gives a real house an hour without news before it goes dark, where a demo house gets five minutes", async () => {
    const { clock } = hubToldAbout(fixture().databasePath);
    expect(REAL_HOUSE_NO_NEWS_AFTER_MS).toBe(60 * MINUTE);
    expect(REAL_HOUSE_NO_NEWS_AFTER_MS).toBeGreaterThan(NO_NEWS_AFTER_MS);

    clock.moveTo(after(NO_NEWS_AFTER_MS + MINUTE));
    expect(stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT)).toMatchObject({ isDark: false, workingCount: 1 });

    clock.moveTo(after(REAL_HOUSE_NO_NEWS_AFTER_MS));
    expect(stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT).isDark).toBe(false);

    clock.moveTo(after(REAL_HOUSE_NO_NEWS_AFTER_MS + 1000));
    const quiet = stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT);
    expect(quiet).toMatchObject({ isDemo: false, isDark: true, whyDark: "no_news", agents: [], lastNewsAt: timeOn("14:15:00") });
    // What waits for the owner still waits while the house is dark.
    expect(quiet.waiting.map((item) => item.line.id)).toEqual(["9", "13"]);
  });

  it("H10: old entries are never made to look live: weeks later the house is dark with no news", async () => {
    const { hub } = hubToldAbout(fixture().databasePath, after(40 * 24 * 60 * MINUTE));
    const approvalDesk = stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT);

    expect(linesOf(hub, APPROVAL_DESK_PROJECT)).toHaveLength(10);
    expect(approvalDesk).toEqual({
      project: APPROVAL_DESK_PROJECT,
      isDemo: false,
      isDark: true,
      whyDark: "no_news",
      lastNewsAt: null,
      agents: [],
      workingCount: 0,
      waiting: [],
      ready: [],
    });
  });

  it("a logbook with no entries gives a real, dark house and no lines", async () => {
    const { hub } = hubToldAbout(fixture([]).databasePath);

    expect(linesOf(hub, APPROVAL_DESK_PROJECT)).toEqual([]);
    expect(stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT)).toMatchObject({
      isDemo: false,
      isDark: true,
      whyDark: "no_news",
    });
  });
});

describe("H10: real and scripted lines of one project are never shown together", () => {
  const playScriptedDay = (store: HubStore, now: Date) =>
    createDemoPlayer({ store, scripts: DEMO_SCRIPTS, now: () => now }).playDueLines();

  function feedOnce(store: HubStore, databasePath: string) {
    const feeds = configuredRealFeeds({ APPROVAL_DESK_DATABASE: databasePath });
    return startRealFeeds({ store, feeds, timer: handTimers().timer });
  }

  it("H10: a real house shows only its real lines, whatever scripted lines an earlier run left in the record", () => {
    const store = emptyStore();
    const now = HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY;
    playScriptedDay(store, now);
    const realFeeds = feedOnce(store, fixture().databasePath);
    const kept = store.readLines({ project: APPROVAL_DESK_PROJECT }).map((stored) => stored.line.demo);
    expect(kept).toContain(true);
    expect(kept).toContain(false);

    const approvalDesk = stateOf(readVillageOfHub({ store, projects: villageProjects, now, realFeeds }), APPROVAL_DESK_PROJECT);

    expect(approvalDesk.isDemo).toBe(false);
    expect(approvalDesk.agents.map((agent) => agent.latest.demo)).toEqual([false]);
    expect(approvalDesk.waiting.map((item) => item.line.id)).toEqual(["9", "13"]);
    expect([...approvalDesk.waiting, ...approvalDesk.ready].every((item) => item.line.demo === false)).toBe(true);
  });

  it("H10: a demo house shows only its scripted lines, whatever real lines an earlier run left in the record", () => {
    const store = emptyStore();
    const now = HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY;
    feedOnce(store, fixture().databasePath).stop();
    playScriptedDay(store, now);
    const scriptedOnly = emptyStore();
    playScriptedDay(scriptedOnly, now);
    const noRealFeeds = startRealFeeds({ store, feeds: [] });

    const village = readVillageOfHub({ store, projects: villageProjects, now, realFeeds: noRealFeeds });

    expect(village).toEqual(readVillageState({ store: scriptedOnly, projects: villageProjects, now }));
    expect(stateOf(village, APPROVAL_DESK_PROJECT).isDemo).toBe(true);
  });
});

describe("new logbook entries reach the village while the hub runs", () => {
  const twoMore: InventedEntry[] = [
    { at: "14:16:00", kind: "human_decision", request: "REQ-908", refersTo: 13, details: { decision: "reject", note: "Too late." } },
    { at: "14:16:30", kind: "refund_done", request: "REQ-909", refersTo: 14, details: { amountCents: 1200 } },
  ];

  it("asks again every few seconds and adds only what is new", async () => {
    const made = fixture();
    const { hub, clock, timers } = hubToldAbout(made.databasePath);
    expect(timers.everyMs).toContain(REAL_FEEDS_ASKED_EVERY_MS);

    timers.tickAll();
    expect(hub.realFeeds.latestReports()[0]).toMatchObject({ added: 0, alreadyStored: 0, problem: null });

    made.add(twoMore);
    clock.moveTo(after(2 * MINUTE));
    timers.tickAll();

    expect(hub.realFeeds.latestReports()[0]).toMatchObject({ added: 2, alreadyStored: 0 });
    const approvalDesk = stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT);
    expect(approvalDesk.waiting.map((item) => item.line.id)).toEqual(["9"]);
    expect(approvalDesk.agents.map((agent) => [agent.isWorking, agent.latest.what])).toEqual([[false, "Paid $12.00 back"]]);
  });

  it("skips nothing when more than ten entries arrive between two asks", () => {
    const made = fixture();
    const { hub, timers } = hubToldAbout(made.databasePath);
    made.add(INVENTED_ENTRIES.slice(0, 12).map((entry) => ({ ...entry, refersTo: undefined })));
    timers.tickAll();

    // The added entries reuse the invented day's times, so the lines are counted in the order they were stored.
    const stored = hub.store.readLines({ project: APPROVAL_DESK_PROJECT, order: "stored" });
    expect(stored.map(({ line }) => Number(line.id))).toEqual(Array.from({ length: 22 }, (_, index) => 5 + index));
  });

  it("H4: a hub started again on the same record adds nothing twice", () => {
    const store = emptyStore();
    const feeds = () => configuredRealFeeds({ APPROVAL_DESK_DATABASE: made.databasePath });
    const made = fixture();
    startRealFeeds({ store, feeds: feeds(), timer: handTimers().timer });
    const before = store.readLines({ order: "stored" });

    const again = startRealFeeds({ store, feeds: feeds(), timer: handTimers().timer });

    expect(again.latestReports()[0]).toMatchObject({ added: 0, alreadyStored: 10, refused: [] });
    expect(store.readLines({ order: "stored" })).toEqual(before);
  });

  it("stops asking when the hub closes", () => {
    const { timers } = hubToldAbout(fixture().databasePath);
    expect(timers.running()).toBe(2);
    closeDemoHub();
    expect(timers.running()).toBe(0);
  });
});

describe("H9: trouble with approval-desk's records stays in its own house", () => {
  it("H9: the hub starts and the other houses run when the database isn't there", async () => {
    const { folder } = fixture();
    const { hub } = hubToldAbout(join(folder, "not-there.db"));
    const village = await villageFromTheRoute();

    expect(hub.realFeeds.unreadable()).toEqual([APPROVAL_DESK_PROJECT]);
    expect(stateOf(village, APPROVAL_DESK_PROJECT)).toMatchObject({ isDemo: false, isDark: true, whyDark: "feed_failed", agents: [] });
    expect(stateOf(village, TEAM_HOUSE).whyDark).not.toBe("feed_failed");
    expect(linesOf(hub, TEAM_HOUSE).length).toBeGreaterThan(0);
    expect(readdirSync(folder)).toEqual(["invented-desk.db"]);
  });

  it("H9: the house goes dark when its records stop being readable, and lights up when they are readable again", async () => {
    let readable = true;
    const working = configuredRealFeeds({ APPROVAL_DESK_DATABASE: fixture().databasePath })[0];
    const flaky: RealFeed = {
      project: working.project,
      read(afterRow) {
        if (!readable) throw new Error("the disk gave up");
        return working.read(afterRow);
      },
    };
    const timers = handTimers();
    demoHub({
      databasePath: IN_MEMORY_DATABASE,
      realFeeds: [flaky],
      now: () => HALF_A_MINUTE_AFTER_THE_NEWEST_ENTRY,
      timer: timers.timer,
    });
    expect(stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT).isDark).toBe(false);

    readable = false;
    timers.tickAll();
    expect(stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT)).toMatchObject({ isDark: true, whyDark: "feed_failed" });

    readable = true;
    timers.tickAll();
    expect(stateOf(await villageFromTheRoute(), APPROVAL_DESK_PROJECT)).toMatchObject({ isDark: false, workingCount: 1 });
  });

  it("H8: a logbook entry the translator refuses is reported and not stored, and the rest still are", () => {
    const strange: InventedEntry = { at: "14:15:10", kind: "refund_reversed", request: "REQ-909", details: {} };
    const { hub } = hubToldAbout(fixture([...INVENTED_ENTRIES, strange]).databasePath);
    const [report] = hub.realFeeds.latestReports();

    expect(linesOf(hub, APPROVAL_DESK_PROJECT).map((line) => line.id)).toEqual(["6", "7", "8", "9", "10", "11", "12", "13", "14"]);
    expect(report).toMatchObject({ added: 9, problem: null });
    expect(report.refused).toEqual([
      [{ field: "step", reason: `The hub doesn't know what a "refund_reversed" line in this logbook means.` }],
    ]);
  });

  it("H9: lines the record can't take are read again on the next ask", () => {
    const store = emptyStore();
    let diskWorks = false;
    const flakyStore: Pick<HubStore, "addLines"> = {
      addLines(lines) {
        if (!diskWorks) throw new Error("the disk gave up");
        return store.addLines(lines);
      },
    };
    const timers = handTimers();
    const realFeeds = startRealFeeds({
      store: flakyStore,
      feeds: configuredRealFeeds({ APPROVAL_DESK_DATABASE: fixture().databasePath }),
      timer: timers.timer,
    });
    expect(realFeeds.unreadable()).toEqual([APPROVAL_DESK_PROJECT]);

    diskWorks = true;
    timers.tickAll();

    expect(realFeeds.unreadable()).toEqual([]);
    expect(store.readLines()).toHaveLength(10);
  });
});

describe("H3: a hub fed from approval-desk never writes to it", () => {
  it("H3: starting, asking again and answering the page leave the database byte for byte as it was", async () => {
    const made = fixture();
    const sha256 = () => createHash("sha256").update(readFileSync(made.databasePath)).digest("hex");
    const before = sha256();

    const { timers } = hubToldAbout(made.databasePath);
    for (let ask = 0; ask < 5; ask += 1) timers.tickAll();
    await villageFromTheRoute();
    closeDemoHub();

    expect(sha256()).toBe(before);
    expect(readdirSync(made.folder)).toEqual(["invented-desk.db"]);
  });
});

describe("the house list and the page's settings", () => {
  async function housesWith(databasePath: string | undefined) {
    vi.stubEnv("HUB_APPROVAL_DESK_DATA", undefined);
    vi.stubEnv(APPROVAL_DESK_DATABASE_VARIABLE, databasePath);
    vi.resetModules();
    const forThePage = (await import("../../next.config")).default.env ?? {};
    // Next builds these words into the page; here they are set by hand.
    for (const [name, value] of Object.entries(forThePage)) vi.stubEnv(name, value);
    vi.resetModules();
    return { forThePage, list: (await import("../../config/houses")).houses };
  }

  it("H10: approval-desk is listed as demo unless the hub was told where its database is", async () => {
    for (const untold of [undefined, "", "  "]) {
      const { list } = await housesWith(untold);
      expect(list.map((entry) => ("project" in entry ? entry.data : null))).toEqual(["demo", "demo", null, null]);
    }
    const { list } = await housesWith("somewhere/desk.db");
    expect(list.map((entry) => ("project" in entry ? entry.data : null))).toEqual(["real", "demo", null, null]);
  });

  it("H13: the page is only told the word real or demo, never where the database is", async () => {
    expect((await housesWith("somewhere/desk.db")).forThePage).toEqual({ HUB_APPROVAL_DESK_DATA: "real" });
    expect((await housesWith(undefined)).forThePage).toEqual({ HUB_APPROVAL_DESK_DATA: "demo" });
  });
});
