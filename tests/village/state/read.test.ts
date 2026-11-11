import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../../app/api/village/route";
import { houses } from "../../../config/houses";
import { DEMO_SCRIPTS, closeDemoHub, createDemoPlayer, demoHub, type DemoScript } from "../../../lib/demo";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore, type LineFilter } from "../../../lib/store";
import { villageHouses } from "../../../lib/village/houses";
import {
  VILLAGE_LOOKS_BACK_MS,
  VILLAGE_STATE_ROUTE,
  houseStatusFrom,
  projectStateOf,
  projectsOf,
  readVillageState,
  villageStateAt,
  type VillageState,
} from "../../../lib/village/state";
import { A_MOMENT_IN_THE_DEMO, clockAt, handTimer, tinyScript } from "../../demo/helpers";
import { keepTheNetworkOff } from "../../demo/network-off";
import { feedLine, momentAt } from "../../feed/lines";

const network = keepTheNetworkOff();

const [approvalDeskHouse, teamHouse] = villageHouses;
const villageProjects = projectsOf(houses);
const NOW = new Date(A_MOMENT_IN_THE_DEMO.getTime() + 30_000);

const openStores: HubStore[] = [];

function storeWithTheDemo(scripts: readonly DemoScript[] = DEMO_SCRIPTS, now: Date = NOW): HubStore {
  const store = openHubStore(IN_MEMORY_DATABASE);
  openStores.push(store);
  createDemoPlayer({ store, scripts, now: () => now }).playDueLines();
  return store;
}

afterEach(() => {
  closeDemoHub();
  for (const store of openStores.splice(0)) store.close();
});

describe("reading the village's state from the hub's record", () => {
  it("gives the state of the lines the record holds, at the moment asked for", () => {
    const store = storeWithTheDemo();
    const state = readVillageState({ store, projects: villageProjects, now: NOW });

    expect(state).toEqual(
      villageStateAt({
        projects: villageProjects,
        lines: store.readLines().map((stored) => stored.line),
        now: NOW,
      }),
    );
    expect(state.asOf).toBe("2026-10-05T14:07:30Z");
    expect(projectStateOf(state, "approval-desk")).toMatchObject({ isDark: false, workingCount: 1 });
    expect(projectStateOf(state, teamHouse.project!)).toMatchObject({ isDark: false, workingCount: 2 });
  });

  it("H4: only reads; the record holds the same lines afterwards", () => {
    const store = storeWithTheDemo();
    const before = store.readLines({ order: "stored" });
    readVillageState({ store, projects: villageProjects, now: NOW });
    readVillageState({ store, projects: villageProjects, now: NOW });
    expect(store.readLines({ order: "stored" })).toEqual(before);
  });

  it("follows the record as the demo plays on", () => {
    const store = openHubStore(IN_MEMORY_DATABASE);
    openStores.push(store);
    const clock = clockAt(NOW);
    const player = createDemoPlayer({ store, now: clock.now });
    const workingNow = (): number => {
      player.playDueLines();
      const state = readVillageState({ store, projects: villageProjects, now: clock.now() });
      return projectStateOf(state, "approval-desk")!.workingCount;
    };

    expect(workingNow()).toBe(1);
    clock.moveOn(20);
    expect(workingNow()).toBe(0);
    clock.moveOn(30);
    expect(workingNow()).toBe(1);
  });

  it("looks back one day and no further", () => {
    expect(VILLAGE_LOOKS_BACK_MS).toBe(24 * 60 * 60 * 1000);

    const asked: LineFilter[] = [];
    const store: Pick<HubStore, "readLines"> = {
      readLines(filter = {}) {
        asked.push(filter);
        return [];
      },
    };
    readVillageState({ store, projects: villageProjects, now: NOW });
    expect(asked).toEqual(
      villageProjects.map(({ project }) => ({
        project,
        happenedSince: new Date(NOW.getTime() - VILLAGE_LOOKS_BACK_MS),
      })),
    );
  });

  it("leaves out what is older than it looks back", () => {
    const store = openHubStore(IN_MEMORY_DATABASE);
    openStores.push(store);
    store.addLines([
      feedLine({ at: "01:00", status: "needs_human", id: "old ask", request: "TASK-1" }),
      feedLine({ at: "09:00", status: "needs_human", id: "new ask", request: "TASK-2" }),
    ]);
    const read = (looksBackMs: number): string[] =>
      readVillageState({
        store,
        projects: [{ project: "garden", data: "demo" }],
        now: momentAt("10:00"),
        looksBackMs,
      }).projects[0].waiting.map((item) => item.line.id);

    expect(read(10 * 60 * 1000)).toEqual(["old ask", "new ask"]);
    expect(read(2 * 60 * 1000)).toEqual(["new ask"]);
  });
});

describe("one broken project never stops the others", () => {
  function expectOnlyTheTeamHouseDark(state: VillageState, why: "feed_failed" | "no_news"): void {
    expect(projectStateOf(state, teamHouse.project!)).toMatchObject({ isDark: true, whyDark: why, agents: [] });
    expect(houseStatusFrom(teamHouse, state)).toMatchObject({ isDark: true, note: "no news", tag: "DEMO" });
    expect(projectStateOf(state, "approval-desk")).toMatchObject({ isDark: false, workingCount: 1 });
    expect(houseStatusFrom(approvalDeskHouse, state)).toMatchObject({ isDark: false, note: null, litWindows: 1 });
  }

  it("H9: a house whose lines cannot be read goes dark while the others keep running", () => {
    const store = storeWithTheDemo();
    const failsForTheTeamHouse: Pick<HubStore, "readLines"> = {
      readLines(filter) {
        if (filter?.project === teamHouse.project) throw new Error("the disk gave up");
        return store.readLines(filter);
      },
    };
    const state = readVillageState({ store: failsForTheTeamHouse, projects: villageProjects, now: NOW });

    expectOnlyTheTeamHouseDark(state, "feed_failed");
    expect(projectStateOf(state, "approval-desk")).toEqual(
      projectStateOf(readVillageState({ store, projects: villageProjects, now: NOW }), "approval-desk"),
    );
  });

  it("H9: a house whose script is broken goes dark while the others keep running", () => {
    const [approvalDesk, team] = DEMO_SCRIPTS;
    const brokenTeamScript: DemoScript = { ...team, dayLength: "half an hour" };
    const store = storeWithTheDemo([approvalDesk, brokenTeamScript]);

    expectOnlyTheTeamHouseDark(readVillageState({ store, projects: villageProjects, now: NOW }), "no_news");
  });

  it("H9: a house lights up again once its lines can be read again", () => {
    const store = storeWithTheDemo();
    let diskWorks = false;
    const flaky: Pick<HubStore, "readLines"> = {
      readLines(filter) {
        if (!diskWorks && filter?.project === teamHouse.project) throw new Error("the disk gave up");
        return store.readLines(filter);
      },
    };
    expect(readVillageState({ store: flaky, projects: villageProjects, now: NOW }).projects[1].isDark).toBe(true);
    diskWorks = true;
    expect(readVillageState({ store: flaky, projects: villageProjects, now: NOW }).projects[1].isDark).toBe(false);
  });

  it("H9: with every project unreadable the village still answers, with every house dark", () => {
    const store: Pick<HubStore, "readLines"> = {
      readLines() {
        throw new Error("the disk gave up");
      },
    };
    const state = readVillageState({ store, projects: villageProjects, now: NOW });
    expect(state.projects.map((project) => project.whyDark)).toEqual(["feed_failed", "feed_failed"]);
    expect(state.waitingCount).toBe(0);
  });
});

describe("the page's way to the village's state", () => {
  const startHub = (scripts?: readonly DemoScript[]) =>
    demoHub({ databasePath: IN_MEMORY_DATABASE, scripts, now: () => NOW, timer: handTimer().timer });

  it("H11: answers with the state at the hub's own clock, without the network", async () => {
    const hub = startHub();
    const response = GET();
    const state = (await response.json()) as VillageState;

    expect(response.status).toBe(200);
    expect(state).toEqual(readVillageState({ store: hub.store, projects: villageProjects, now: NOW }));
    expect(state.asOf).toBe("2026-10-05T14:07:30Z");
    expect(network.attempts).toEqual([]);
  });

  it("H10: marks every project it answers about as demo", async () => {
    startHub();
    const state = (await GET().json()) as VillageState;
    expect(state.projects.map((project) => [project.project, project.isDemo])).toEqual([
      ["approval-desk", true],
      [teamHouse.project, true],
    ]);
  });

  it("H9: still answers when a project has no script that plays, with that house dark", async () => {
    startHub([DEMO_SCRIPTS[0], tinyScript("somewhere-else")]);
    const response = GET();
    const state = (await response.json()) as VillageState;

    expect(response.status).toBe(200);
    expect(state.projects.map((project) => [project.project, project.isDark])).toEqual([
      ["approval-desk", false],
      [teamHouse.project, true],
    ]);
  });

  it("H9: still answers when the record cannot be read at all, with every house dark", async () => {
    startHub().store.close();
    const response = GET();
    const state = (await response.json()) as VillageState;

    expect(response.status).toBe(200);
    expect(state.projects.map((project) => project.whyDark)).toEqual(["feed_failed", "feed_failed"]);
  });

  it("is where the page asks", () => {
    expect(VILLAGE_STATE_ROUTE).toBe("/api/village");
  });
});
