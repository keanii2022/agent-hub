import { afterEach, describe, expect, it } from "vitest";
import { GET } from "../../app/api/desk/log/route";
import * as deskLogRoute from "../../app/api/desk/log/route";
import { houses } from "../../config/houses";
import { DEMO_SCRIPTS, closeDemoHub, createDemoPlayer, demoHub } from "../../lib/demo";
import {
  DESK_LOG_LINES_PER_PROJECT,
  DESK_LOG_ROUTE,
  EVERYTHING,
  agentsOffered,
  askForDeskLog,
  emptyLogWords,
  filterWithProject,
  logCountWords,
  logShownFor,
  projectsOffered,
  statusInWords,
  type DeskLog,
} from "../../lib/desk";
import { readDeskLog } from "../../lib/desk/read-log";
import { FEED_STATUSES, type FeedLine } from "../../lib/feed";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore, type LineFilter } from "../../lib/store";
import { projectsOf, type VillageProject } from "../../lib/village/state";
import { A_MOMENT_IN_THE_DEMO, handTimer } from "../demo/helpers";
import { keepTheNetworkOff } from "../demo/network-off";
import { feedLine, momentAt } from "../feed/lines";

keepTheNetworkOff();

const openStores: HubStore[] = [];

function storeOf(lines: readonly FeedLine[]): HubStore {
  const store = openHubStore(IN_MEMORY_DATABASE);
  openStores.push(store);
  for (const answer of store.addLines(lines)) {
    if (!answer.ok) throw new Error("The record refused an invented line.");
  }
  return store;
}

afterEach(() => {
  closeDemoHub();
  for (const store of openStores.splice(0)) store.close();
});

const projects: VillageProject[] = [
  { project: "garden", data: "demo" },
  { project: "bakery", data: "demo" },
  { project: "ledger", data: "real" },
];
const NOW = momentAt("10:00");

const gardenAndBakery = (): FeedLine[] => [
  feedLine({ at: "01:00", project: "garden", agent: "helper", what: "Watering the tomatoes", id: "g1" }),
  feedLine({ at: "03:00", project: "garden", agent: "digger", what: "Digging the beds", id: "g2" }),
  feedLine({ at: "02:00", project: "bakery", agent: "baker", what: "Kneading the dough", id: "b1" }),
  feedLine({ at: "04:00", project: "bakery", agent: "helper", what: "Washing the trays", id: "b2" }),
  feedLine({ at: "05:00", project: "garden", agent: "helper", what: "Picking the beans", id: "g3", status: "done" }),
];

function logOf(lines: readonly FeedLine[], more: Partial<DeskLog> = {}): DeskLog {
  return {
    asOf: "2026-10-05T09:10:00Z",
    events: lines.map((line, index) => ({ seq: index + 1, line })),
    unreadable: [],
    cutShort: [],
    ...more,
  };
}

describe("reading the desk's log from the record", () => {
  it("gives every project's lines, newest first, with the hub's own time", () => {
    const log = readDeskLog({ store: storeOf(gardenAndBakery()), projects, realProjects: [], now: NOW });

    expect(log.asOf).toBe("2026-10-05T09:10:00Z");
    expect(log.events.map((event) => event.line.id)).toEqual(["g3", "b2", "g2", "b1", "g1"]);
    expect(log.unreadable).toEqual([]);
    expect(log.cutShort).toEqual([]);
  });

  it("puts lines at the same moment in the order they were stored, newest on top", () => {
    const log = readDeskLog({
      store: storeOf([
        feedLine({ at: "01:00", project: "garden", id: "first" }),
        feedLine({ at: "01:00", project: "bakery", id: "second" }),
      ]),
      projects,
      realProjects: [],
      now: NOW,
    });

    expect(log.events.map((event) => event.line.id)).toEqual(["second", "first"]);
  });

  it("H10: a demo house's log is its scripted lines only, and a real house's its real lines only", () => {
    const store = storeOf([
      feedLine({ at: "01:00", project: "garden", id: "garden-scripted", demo: true }),
      feedLine({ at: "02:00", project: "garden", id: "garden-real", demo: false }),
      feedLine({ at: "03:00", project: "ledger", id: "ledger-scripted", demo: true }),
      feedLine({ at: "04:00", project: "ledger", id: "ledger-real", demo: false }),
    ]);

    const log = readDeskLog({ store, projects, realProjects: [], now: NOW });
    expect(log.events.map((event) => event.line.id)).toEqual(["ledger-real", "garden-scripted"]);

    // A project the hub reads from its own records is real, whatever the house list still says.
    const gardenGoneReal = readDeskLog({ store, projects, realProjects: ["garden"], now: NOW });
    expect(gardenGoneReal.events.map((event) => event.line.id)).toEqual(["ledger-real", "garden-real"]);
  });

  it("leaves out a project that has no house, and a line that has not happened yet", () => {
    const log = readDeskLog({
      store: storeOf([
        feedLine({ at: "01:00", project: "garden", id: "happened" }),
        feedLine({ at: "11:00", project: "garden", id: "not-yet" }),
        feedLine({ at: "01:00", project: "stranger", id: "no-house" }),
      ]),
      projects,
      realProjects: [],
      now: NOW,
    });

    expect(log.events.map((event) => event.line.id)).toEqual(["happened"]);
  });

  it("H9: one project that can't be read is named, and the others are all still read", () => {
    const store = storeOf(gardenAndBakery());
    const log = readDeskLog({
      store: {
        readLines(filter?: LineFilter) {
          if (filter?.project === "garden") throw new Error("The garden's lines can't be read.");
          return store.readLines(filter);
        },
      },
      projects,
      realProjects: [],
      now: NOW,
    });

    expect(log.unreadable).toEqual(["garden"]);
    expect(log.events.map((event) => event.line.id)).toEqual(["b2", "b1"]);
  });

  it("hands over each project's newest lines only, and says which projects have older ones", () => {
    const store = storeOf([
      ...["01:00", "02:00", "03:00", "04:00"].map((at, index) => feedLine({ at, project: "garden", id: `g${index + 1}` })),
      feedLine({ at: "00:30", project: "bakery", id: "b1" }),
    ]);

    const log = readDeskLog({ store, projects, realProjects: [], now: NOW, linesPerProject: 2 });
    expect(log.cutShort).toEqual(["garden"]);
    expect(log.events.map((event) => event.line.id)).toEqual(["g4", "g3", "b1"]);
    expect(DESK_LOG_LINES_PER_PROJECT).toBeGreaterThanOrEqual(100);
  });

  it("H4: only ever reads the record", () => {
    const store = storeOf(gardenAndBakery());
    const before = store.readLines({ order: "stored" });
    readDeskLog({ store, projects, realProjects: [], now: NOW });
    expect(store.readLines({ order: "stored" })).toEqual(before);
  });
});

describe("the log on the desk", () => {
  it("is in order, newest first, whatever order the hub's answer came in", () => {
    const lines = gardenAndBakery();
    const shown = logShownFor(logOf(lines));

    expect(shown.entries.map((entry) => entry.key)).toEqual(["garden/g3", "bakery/b2", "garden/g2", "bakery/b1", "garden/g1"]);
    expect(logShownFor(logOf([...lines].reverse())).entries.map((entry) => entry.when)).toEqual(
      shown.entries.map((entry) => entry.when),
    );
    expect(shown.olderLeftOut).toBe(false);
  });

  it("gives each entry who did it, what it did, when, and its request's own name", () => {
    const [newest] = logShownFor(logOf(gardenAndBakery())).entries;

    expect(newest).toEqual({
      key: "garden/g3",
      project: "garden",
      agent: "helper",
      what: "Picking the beans",
      when: "2026-10-05T09:05:00Z",
      status: "done",
      request: "TASK-1",
      isDemo: true,
    });
  });

  it("filters by project", () => {
    const shown = logShownFor(logOf(gardenAndBakery()), { project: "bakery", agent: null });
    expect(shown.entries.map((entry) => entry.key)).toEqual(["bakery/b2", "bakery/b1"]);
  });

  it("filters by agent, across projects", () => {
    const shown = logShownFor(logOf(gardenAndBakery()), { project: null, agent: "helper" });
    expect(shown.entries.map((entry) => entry.key)).toEqual(["garden/g3", "bakery/b2", "garden/g1"]);
  });

  it("the two filters count together", () => {
    const log = logOf(gardenAndBakery());
    expect(logShownFor(log, { project: "garden", agent: "helper" }).entries.map((entry) => entry.key)).toEqual([
      "garden/g3",
      "garden/g1",
    ]);
    expect(logShownFor(log, { project: "bakery", agent: "digger" }).entries).toEqual([]);
  });

  it("offers the village's projects in its own order, then any other the log names", () => {
    const log = logOf([...gardenAndBakery(), feedLine({ at: "01:00", project: "attic", id: "a1" })]);
    expect(projectsOffered(["ledger", "garden", "bakery"], log)).toEqual(["ledger", "garden", "bakery", "attic"]);
    expect(projectsOffered(["ledger"], null)).toEqual(["ledger"]);
  });

  it("offers every agent the log names, or only those of the chosen project", () => {
    const log = logOf(gardenAndBakery());
    expect(agentsOffered(log, null)).toEqual(["baker", "digger", "helper"]);
    expect(agentsOffered(log, "garden")).toEqual(["digger", "helper"]);
    expect(agentsOffered(null, null)).toEqual([]);
  });

  it("picking a project keeps the chosen agent only when that agent is in it", () => {
    const log = logOf(gardenAndBakery());
    expect(filterWithProject({ project: null, agent: "helper" }, "bakery", log)).toEqual({ project: "bakery", agent: "helper" });
    expect(filterWithProject({ project: "garden", agent: "digger" }, "bakery", log)).toEqual({ project: "bakery", agent: null });
    expect(filterWithProject({ project: "garden", agent: "digger" }, null, log)).toEqual({ project: null, agent: "digger" });
  });

  it("starts where the last cut-short project starts, so no stretch shows a house silent that was not", () => {
    // The garden's two newest lines are here; whatever it did before 03:00 is not.
    const log = logOf(
      [
        feedLine({ at: "03:00", project: "garden", id: "g3" }),
        feedLine({ at: "04:00", project: "garden", id: "g4" }),
        feedLine({ at: "01:00", project: "bakery", id: "b1" }),
        feedLine({ at: "03:30", project: "bakery", id: "b2" }),
      ],
      { cutShort: ["garden"] },
    );

    const everything = logShownFor(log);
    expect(everything.entries.map((entry) => entry.key)).toEqual(["garden/g4", "bakery/b2", "garden/g3"]);
    expect(everything.olderLeftOut).toBe(true);

    // The bakery by itself is whole, so all of it shows and nothing is left out.
    const bakery = logShownFor(log, { project: "bakery", agent: null });
    expect(bakery.entries.map((entry) => entry.key)).toEqual(["bakery/b2", "bakery/b1"]);
    expect(bakery.olderLeftOut).toBe(false);

    const garden = logShownFor(log, { project: "garden", agent: null });
    expect(garden.entries.map((entry) => entry.key)).toEqual(["garden/g4", "garden/g3"]);
    expect(garden.olderLeftOut).toBe(true);
  });

  it("has plain words for an empty log, with and without filters", () => {
    expect(emptyLogWords(EVERYTHING)).toBe("Nothing has happened yet.");
    expect(emptyLogWords({ project: "garden", agent: null })).toBe("Nothing from garden yet.");
    expect(emptyLogWords({ project: null, agent: "helper" })).toBe("Nothing from helper yet.");
    expect(emptyLogWords({ project: "garden", agent: "helper" })).toBe("Nothing from helper at garden yet.");
  });

  it("counts what is shown in plain words", () => {
    expect(logCountWords(1, EVERYTHING)).toBe("1 event, newest first.");
    expect(logCountWords(12, { project: "garden", agent: "helper" })).toBe("12 events from helper at garden, newest first.");
  });

  it("H12: every state has plain words, and none is its code", () => {
    for (const status of FEED_STATUSES) {
      const words = statusInWords(status);
      expect(words).not.toBe("");
      expect(words).not.toContain("_");
      expect(words).not.toMatch(/\b[HQ]\d{1,2}\b/);
    }
    expect(statusInWords("needs_human")).toBe("Needs your answer");
  });
});

describe("the hub's route for the desk's log", () => {
  function startTheHub(): void {
    demoHub({ databasePath: IN_MEMORY_DATABASE, now: () => A_MOMENT_IN_THE_DEMO, timer: handTimer().timer });
  }

  it("answers with the demo's log as JSON, the same as reading the record directly", async () => {
    startTheHub();
    const response = GET();
    expect(response.status).toBe(200);
    const log: DeskLog = await response.json();

    const store = openHubStore(IN_MEMORY_DATABASE);
    openStores.push(store);
    createDemoPlayer({ store, scripts: DEMO_SCRIPTS, now: () => A_MOMENT_IN_THE_DEMO }).playDueLines();
    const expected = readDeskLog({ store, projects: projectsOf(houses), realProjects: [], now: A_MOMENT_IN_THE_DEMO });

    expect(Object.keys(log)).toEqual(["asOf", "events", "unreadable", "cutShort"]);
    expect(log.asOf).toBe("2026-10-05T14:07:00Z");
    expect(log.events.map((event) => event.line)).toEqual(expected.events.map((event) => event.line));
    expect(new Set(log.events.map((event) => event.line.project))).toEqual(
      new Set(DEMO_SCRIPTS.map((script) => script.project)),
    );
    for (const event of log.events) expect(event.line.demo).toBe(true);
  });

  it("is read-only: it answers GET and nothing else", () => {
    expect(Object.keys(deskLogRoute).sort()).toEqual(["GET", "dynamic", "runtime"]);
    expect(deskLogRoute.runtime).toBe("nodejs");
  });

  it("the page asks that route, and takes any trouble as \"unreachable\"", async () => {
    const asked: string[] = [];
    const log = logOf(gardenAndBakery());
    const answer = await askForDeskLog(async (address) => {
      asked.push(address);
      return Response.json(log);
    });

    expect(asked).toEqual([DESK_LOG_ROUTE]);
    expect(answer).toEqual(log);
    expect(await askForDeskLog(async () => Response.json({ problem: "no" }, { status: 500 }))).toBe("unreachable");
    expect(await askForDeskLog(async () => Response.json({ asOf: "now" }))).toBe("unreachable");
    expect(
      await askForDeskLog(async () => {
        throw new Error("The hub is gone.");
      }),
    ).toBe("unreachable");
  });
});
