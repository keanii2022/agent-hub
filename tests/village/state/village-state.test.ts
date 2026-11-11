import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import { SYSTEM_AGENT, type FeedLine } from "../../../lib/feed";
import { approvalDeskScript, teamHouseScript } from "../../../lib/demo/scripts";
import type { DemoScript } from "../../../lib/demo/script";
import { houseStateAt, villageHouses } from "../../../lib/village/houses";
import {
  FeedMakesNoSenseError,
  NO_NEWS_AFTER_MS,
  houseStatusFrom,
  projectStateAt,
  projectStateOf,
  projectsOf,
  villageStateAt,
  type ProjectState,
  type VillageProject,
  type VillageState,
} from "../../../lib/village/state";
import { A_MOMENT_IN_THE_DEMO, clockAt, dayStartOf, daysOf } from "../../demo/helpers";
import { feedLine, momentAt } from "../../feed/lines";

const [approvalDeskHouse, teamHouse] = villageHouses;
const villageProjects = projectsOf(houses);

/** The scripted day `A_MOMENT_IN_THE_DEMO` falls in, and the one before it, so the day starts with yesterday behind it. */
function yesterdayAndToday(script: DemoScript): { dayStarts: Date; lines: FeedLine[] } {
  const dayStarts = dayStartOf(script, A_MOMENT_IN_THE_DEMO);
  return { dayStarts, lines: daysOf(script, 2, new Date(dayStarts.getTime() - 1)) };
}

type Showing = { home: number; working: number; bright: number; soft: number };

/** Moves a clock by hand through one scripted day and says what the house shows at each stop. */
function showingThroughTheDay(script: DemoScript, stops: readonly string[]): Record<string, Showing> {
  const { dayStarts, lines } = yesterdayAndToday(script);
  const house = villageHouses.find((candidate) => candidate.project === script.project)!;
  const clock = clockAt(dayStarts);
  const showing: Record<string, Showing> = {};
  for (const stop of stops) {
    clock.moveTo(momentAt(stop, dayStarts));
    const village = villageStateAt({ projects: villageProjects, lines, now: clock.now() });
    const project = projectStateOf(village, script.project)!;
    const status = houseStatusFrom(house, village);
    expect(project.isDark, `${script.project} at ${stop}`).toBe(false);
    expect(status.isDark, `${script.project} at ${stop}`).toBe(false);
    showing[stop] = {
      home: project.agents.length,
      working: project.workingCount,
      bright: status.litWindows,
      soft: status.softWindows,
    };
  }
  return showing;
}

const garden: VillageProject = { project: "garden", data: "demo" };
const orchard: VillageProject = { project: "orchard", data: "real" };

function gardenAt(at: string, lines: readonly FeedLine[]): ProjectState {
  return projectStateAt(garden, lines, momentAt(at));
}

describe("the village's state, from feed lines and one moment", () => {
  it("has one entry per project of the house list, in list order, and says which moment it is for", () => {
    const village = villageStateAt({ projects: villageProjects, lines: [], now: A_MOMENT_IN_THE_DEMO });
    expect(village.asOf).toBe("2026-10-05T14:07:00Z");
    expect(village.projects.map((project) => project.project)).toEqual([
      approvalDeskHouse.project,
      teamHouse.project,
    ]);
    expect(projectsOf(houses)).toEqual([
      { project: approvalDeskHouse.project, data: "demo" },
      { project: teamHouse.project, data: "demo" },
    ]);
  });

  it("is the same state for the same lines and the same moment, in whatever order the lines come", () => {
    const { dayStarts, lines } = yesterdayAndToday(teamHouseScript);
    const now = momentAt("12:30", dayStarts);
    const state = villageStateAt({ projects: villageProjects, lines, now });
    expect(villageStateAt({ projects: villageProjects, lines, now })).toEqual(state);
    expect(villageStateAt({ projects: villageProjects, lines: [...lines].reverse(), now }).projects[1]).toMatchObject({
      agents: state.projects[1].agents.map(({ name, isWorking }) => ({ name, isWorking })),
      lastNewsAt: state.projects[1].lastNewsAt,
      waiting: state.projects[1].waiting,
    });
  });

  it("survives a trip through JSON unchanged, so a page gets what the hub worked out", () => {
    const { dayStarts, lines } = yesterdayAndToday(approvalDeskScript);
    const state = villageStateAt({ projects: villageProjects, lines, now: momentAt("07:30", dayStarts) });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("counts a line dated after the moment as not happened yet", () => {
    const lines = [feedLine({ at: "01:00" }), feedLine({ at: "05:00", status: "needs_human" })];
    const early = gardenAt("03:00", lines);
    expect(early.lastNewsAt).toBe("2026-10-05T09:01:00Z");
    expect(early.waiting).toEqual([]);
    expect(gardenAt("05:00", lines).waiting).toHaveLength(1);
  });

  it("leaves out lines of a project that has no house", () => {
    const village = villageStateAt({
      projects: [garden],
      lines: [feedLine({ at: "01:00" }), feedLine({ at: "01:30", project: "nowhere", status: "needs_human" })],
      now: momentAt("02:00"),
    });
    expect(village.projects.map((project) => project.project)).toEqual(["garden"]);
    expect(village.waitingCount).toBe(0);
  });
});

describe("windows that follow the feed", () => {
  it("playing approval-desk's scripted day makes its window glow and go dark on schedule", () => {
    const off: Showing = { home: 0, working: 0, bright: 0, soft: 0 };
    const working: Showing = { home: 1, working: 1, bright: 1, soft: 0 };
    const betweenJobs: Showing = { home: 1, working: 0, bright: 0, soft: 1 };

    expect(
      showingThroughTheDay(approvalDeskScript, [
        "00:03",
        "00:04",
        "01:19",
        "01:20",
        "01:40",
        "02:25",
        "03:00",
        "03:30",
        "07:20",
        "07:50",
        "19:39",
        "19:40",
      ]),
    ).toEqual({
      "00:03": off,
      "00:04": working,
      "01:19": working,
      "01:20": betweenJobs,
      "01:40": working,
      "02:25": betweenJobs,
      "03:00": working,
      "03:30": betweenJobs,
      "07:20": working,
      "07:50": betweenJobs,
      "19:39": betweenJobs,
      "19:40": off,
    });
  });

  it("playing the team house's scripted day lights one window per agent, bright for the ones working", () => {
    expect(
      showingThroughTheDay(teamHouseScript, ["00:09", "00:10", "01:30", "04:00", "07:00", "13:10", "24:30", "28:50", "29:20"]),
    ).toEqual({
      "00:09": { home: 0, working: 0, bright: 0, soft: 0 },
      "00:10": { home: 1, working: 1, bright: 1, soft: 0 },
      "01:30": { home: 2, working: 2, bright: 2, soft: 0 },
      "04:00": { home: 3, working: 3, bright: 3, soft: 0 },
      "07:00": { home: 3, working: 2, bright: 2, soft: 1 },
      "13:10": { home: 3, working: 1, bright: 1, soft: 2 },
      "24:30": { home: 2, working: 1, bright: 1, soft: 1 },
      "28:50": { home: 1, working: 0, bright: 0, soft: 1 },
      "29:20": { home: 0, working: 0, bright: 0, soft: 0 },
    });
  });

  it("an agent is working exactly when its newest line says working", () => {
    const lines = [
      feedLine({ at: "01:00", status: "working" }),
      feedLine({ at: "02:00", status: "result_ready" }),
      feedLine({ at: "03:00", status: "working", request: "TASK-2" }),
      feedLine({ at: "04:00", status: "failed", request: "TASK-2" }),
    ];
    const workingAt = (at: string): boolean => gardenAt(at, lines).agents[0].isWorking;
    expect([workingAt("01:30"), workingAt("02:30"), workingAt("03:30"), workingAt("04:30")]).toEqual([
      true,
      false,
      true,
      false,
    ]);
  });

  it("says what each agent at home is doing: its newest step, in its own words", () => {
    const { dayStarts, lines } = yesterdayAndToday(teamHouseScript);
    const village = villageStateAt({ projects: villageProjects, lines, now: momentAt("07:30", dayStarts) });
    const team = projectStateOf(village, teamHouse.project!)!;

    expect(team.agents.map((agent) => [agent.name, agent.isWorking, agent.latest.step, agent.latest.what])).toEqual([
      ["builder", true, "fix", "Fixed the date on the poster"],
      ["checker", false, "ask", "The spring market poster is ready. OK to send it to the printer?"],
      ["planner", true, "plan", "Writing a to-do list for the welcome letter to new customers"],
    ]);
    expect(team.agents.map((agent) => Date.parse(agent.homeSince) - dayStarts.getTime())).toEqual([
      90_000, 240_000, 10_000,
    ]);
  });
});

describe("residents that follow the feed", () => {
  const withoutTheChecker: DemoScript = {
    ...teamHouseScript,
    agents: teamHouseScript.agents.filter((agent) => agent.name !== "checker"),
    // Its work goes to the builder, so the day's jobs still happen with one agent fewer.
    requests: teamHouseScript.requests.map((request) =>
      request.map((line) => (line.agent === "checker" ? { ...line, agent: "builder" } : line)),
    ),
  };
  const withAPainter: DemoScript = {
    ...teamHouseScript,
    agents: [
      ...teamHouseScript.agents,
      {
        name: "painter",
        arrives: "05:00",
        arrivesSaying: "Came in with a box of brushes",
        leaves: "20:00",
        leavesSaying: "Washed the brushes and left",
      },
    ],
  };

  function teamAt(script: DemoScript, at: string): { names: string[]; windows: number } {
    const { dayStarts, lines } = yesterdayAndToday(script);
    const village = villageStateAt({ projects: villageProjects, lines, now: momentAt(at, dayStarts) });
    const status = houseStateAt(teamHouse, 0, houseStatusFrom(teamHouse, village));
    return {
      names: projectStateOf(village, teamHouse.project!)!.agents.map((agent) => agent.name),
      windows: status.litWindows + status.softWindows,
    };
  }

  it("changing the agent count in a script changes the residents", () => {
    expect(teamAt(teamHouseScript, "10:00")).toEqual({ names: ["builder", "checker", "planner"], windows: 3 });
    expect(teamAt(withoutTheChecker, "10:00")).toEqual({ names: ["builder", "planner"], windows: 2 });
    expect(teamAt(withAPainter, "10:00").names).toEqual(["builder", "checker", "painter", "planner"]);
  });

  it("the residents change through the day as agents arrive and leave", () => {
    expect(teamAt(withAPainter, "04:59").names).toEqual(["builder", "checker", "planner"]);
    expect(teamAt(withAPainter, "05:00").names).toEqual(["builder", "checker", "painter", "planner"]);
    expect(teamAt(withAPainter, "20:00").names).toEqual(["builder", "checker", "planner"]);
    expect(teamAt(withAPainter, "24:30").names).toEqual(["builder", "planner"]);
  });

  it("a house shows no more residents than it has windows, while the state keeps the true count", () => {
    expect(teamHouse.windows).toHaveLength(3);
    expect(teamAt(withAPainter, "10:00")).toMatchObject({ windows: 3 });
  });

  it("Q2: an agent that turns up in the feed without being announced is home all the same", () => {
    const lines = [
      feedLine({ at: "01:00", agent: "helper", step: "arrive" }),
      feedLine({ at: "02:00", agent: "night-owl", step: "prune", what: "Pruning the roses" }),
    ];
    expect(gardenAt("03:00", lines).agents.map((agent) => agent.name)).toEqual(["helper", "night-owl"]);
  });

  it("an agent that left is home again from its next line", () => {
    const lines = [
      feedLine({ at: "01:00", step: "arrive" }),
      feedLine({ at: "02:00", step: "leave", status: "done" }),
      feedLine({ at: "04:00", step: "water" }),
    ];
    expect(gardenAt("03:00", lines).agents).toEqual([]);
    expect(gardenAt("04:30", lines).agents).toMatchObject([{ name: "helper", homeSince: "2026-10-05T09:04:00Z" }]);
  });

  it("plain code is nobody's resident, but what it says is still news", () => {
    const lines = [feedLine({ at: "01:00", agent: SYSTEM_AGENT, step: "gate", what: "The gate let it through" })];
    const state = gardenAt("02:00", lines);
    expect(state.agents).toEqual([]);
    expect(state).toMatchObject({ isDark: false, lastNewsAt: "2026-10-05T09:01:00Z" });
  });
});

describe("a house with no news", () => {
  const lines = [feedLine({ at: "01:00", step: "arrive" }), feedLine({ at: "02:00", status: "needs_human", id: "ask" })];
  const lastNews = momentAt("02:00");
  const after = (ms: number): Date => new Date(lastNews.getTime() + ms);

  it("waits five minutes after the newest line before it calls a house silent", () => {
    expect(NO_NEWS_AFTER_MS).toBe(5 * 60 * 1000);
  });

  it("H9: stays lit up to the end of the wait, and goes dark the moment after", () => {
    expect(projectStateAt(garden, lines, after(NO_NEWS_AFTER_MS))).toMatchObject({ isDark: false, whyDark: null });
    expect(projectStateAt(garden, lines, after(NO_NEWS_AFTER_MS + 1))).toMatchObject({
      isDark: true,
      whyDark: "no_news",
      lastNewsAt: "2026-10-05T09:02:00Z",
    });
  });

  it("H9: a dark house claims nobody is home, but what was waiting for the owner still waits", () => {
    const dark = projectStateAt(garden, lines, after(NO_NEWS_AFTER_MS + 1));
    expect(dark).toMatchObject({ agents: [], workingCount: 0 });
    expect(dark.waiting.map((item) => item.line.id)).toEqual(["ask"]);
  });

  it("H9: lights up again as soon as there is news", () => {
    const newsAgain = [...lines, feedLine({ at: "20:00", what: "Back at it" })];
    expect(projectStateAt(garden, newsAgain, momentAt("19:59"))).toMatchObject({ isDark: true });
    expect(projectStateAt(garden, newsAgain, momentAt("20:00"))).toMatchObject({ isDark: false, workingCount: 1 });
  });

  it("H9: a project that has never said anything is dark", () => {
    expect(projectStateAt(garden, [], lastNews)).toMatchObject({
      isDark: true,
      whyDark: "no_news",
      lastNewsAt: null,
      agents: [],
    });
  });

  it("the wait can be made longer for a project that is rightly quiet", () => {
    const anHour = 60 * 60 * 1000;
    expect(projectStateAt(garden, lines, after(NO_NEWS_AFTER_MS + 1), anHour)).toMatchObject({ isDark: false });
    expect(
      villageStateAt({ projects: [garden], lines, now: after(NO_NEWS_AFTER_MS + 1), noNewsAfterMs: anHour }).projects[0],
    ).toMatchObject({ isDark: false });
  });

  it("everyone having gone home is not the same as no news: the house stays lit with empty windows", () => {
    const { dayStarts, lines: day } = yesterdayAndToday(approvalDeskScript);
    const village = villageStateAt({ projects: villageProjects, lines: day, now: momentAt("19:50", dayStarts) });
    expect(projectStateOf(village, "approval-desk")).toMatchObject({ isDark: false, agents: [] });
    expect(houseStatusFrom(approvalDeskHouse, village)).toMatchObject({
      isDark: false,
      litWindows: 0,
      softWindows: 0,
      note: null,
    });
  });

  it("the scripted days never go quiet for long enough to turn a demo house dark", () => {
    for (const script of [approvalDeskScript, teamHouseScript]) {
      const times = daysOf(script, 3, A_MOMENT_IN_THE_DEMO).map((line) => Date.parse(line.when));
      const gaps = times.slice(1).map((time, index) => time - times[index]);
      expect(Math.max(...gaps), script.project).toBeLessThan(NO_NEWS_AFTER_MS);
    }
  });
});

describe("one broken project never stops the others", () => {
  const { dayStarts, lines } = yesterdayAndToday(approvalDeskScript);
  const now = momentAt("07:30", dayStarts);
  const teamLines = daysOf(teamHouseScript, 2, new Date(dayStarts.getTime() - 1));
  const healthy = villageStateAt({ projects: villageProjects, lines: [...lines, ...teamLines], now });

  function expectOnlyTheTeamHouseDark(village: VillageState): void {
    expect(projectStateOf(village, teamHouse.project!)).toEqual({
      project: teamHouse.project,
      isDemo: true,
      isDark: true,
      whyDark: "feed_failed",
      lastNewsAt: null,
      agents: [],
      workingCount: 0,
      waiting: [],
      ready: [],
    });
    expect(projectStateOf(village, "approval-desk")).toEqual(projectStateOf(healthy, "approval-desk"));
    expect(projectStateOf(village, "approval-desk")).toMatchObject({ isDark: false, workingCount: 1 });
    expect(houseStatusFrom(teamHouse, village)).toMatchObject({ isDark: true, note: "no news", litWindows: 0 });
    expect(houseStatusFrom(approvalDeskHouse, village)).toMatchObject({ isDark: false, note: null, litWindows: 1 });
  }

  it("the village in good health has both houses lit", () => {
    expect(healthy.projects.map((project) => project.isDark)).toEqual([false, false]);
  });

  it("H9: a house whose feed fails goes dark while the others keep running", () => {
    expectOnlyTheTeamHouseDark(
      villageStateAt({ projects: villageProjects, lines, unreadable: [teamHouse.project!], now }),
    );
  });

  it("H9: a house whose lines make no sense goes dark while the others keep running", () => {
    const noSense = { ...teamLines[0], when: "the day before yesterday" };
    expectOnlyTheTeamHouseDark(
      villageStateAt({ projects: villageProjects, lines: [...lines, ...teamLines, noSense], now }),
    );
  });

  it("H9: lines that make no sense are refused, never guessed at", () => {
    const noTime = { ...feedLine({ at: "01:00" }), when: "soon" };
    const notItsOwn = feedLine({ at: "01:00", project: "orchard" });
    expect(() => projectStateAt(garden, [noTime], momentAt("02:00"))).toThrow(FeedMakesNoSenseError);
    expect(() => projectStateAt(garden, [notItsOwn], momentAt("02:00"))).toThrow(FeedMakesNoSenseError);
  });
});

describe("demo and real", () => {
  it("H10: every project on scripted data is marked demo in the state", () => {
    const { dayStarts, lines } = yesterdayAndToday(approvalDeskScript);
    const village = villageStateAt({ projects: villageProjects, lines, now: momentAt("07:30", dayStarts) });
    expect(village.projects.map((project) => project.isDemo)).toEqual([true, true]);
  });

  it("H10: a house listed as real is marked demo the moment one scripted line turns up in it", () => {
    const real = feedLine({ at: "01:00", project: "orchard", demo: false });
    const scripted = feedLine({ at: "02:00", project: "orchard", demo: true });
    expect(projectStateAt(orchard, [real], momentAt("03:00")).isDemo).toBe(false);
    expect(projectStateAt(orchard, [real, scripted], momentAt("03:00")).isDemo).toBe(true);
  });

  it("H10: a house listed as demo stays marked demo with no lines at all, and when its feed fails", () => {
    expect(projectStateAt(garden, [], momentAt("03:00")).isDemo).toBe(true);
    expect(
      villageStateAt({ projects: [garden], lines: [], unreadable: ["garden"], now: momentAt("03:00") }).projects[0].isDemo,
    ).toBe(true);
  });
});

describe("what is waiting for the owner", () => {
  const { dayStarts, lines } = yesterdayAndToday(approvalDeskScript);
  const teamLines = daysOf(teamHouseScript, 2, new Date(dayStarts.getTime() - 1));
  const todayOnly = (all: FeedLine[]): FeedLine[] => all.filter((line) => Date.parse(line.when) >= dayStarts.getTime());

  it("lists the open requests of each project with their age and urgency, longest-waiting first", () => {
    const village = villageStateAt({ projects: villageProjects, lines, now: momentAt("07:30", dayStarts) });
    const waiting = projectStateOf(village, "approval-desk")!.waiting;

    expect(waiting.map((item) => [item.kind, item.line.agent, item.waitedMs, item.isUrgent])).toEqual([
      ["decision", "refund-agent", 305_000, false],
      ["decision", "refund-agent", 80_000, true],
    ]);
    expect(waiting[0].line.what).toContain("Tobias");
    expect(waiting[0].line).toMatchObject({
      status: "needs_human",
      choices: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
      ],
    });
  });

  it("drops a request once it is decided or finished", () => {
    const openAt = (at: string): number =>
      projectStateOf(villageStateAt({ projects: villageProjects, lines, now: momentAt(at, dayStarts) }), "approval-desk")!
        .waiting.length;
    expect([openAt("02:24"), openAt("02:25"), openAt("09:29"), openAt("09:30"), openAt("19:20")]).toEqual([0, 1, 3, 2, 0]);
  });

  it("lists the results that are ready, oldest first", () => {
    const village = villageStateAt({
      projects: villageProjects,
      lines: todayOnly(teamLines),
      now: momentAt("21:30", dayStarts),
    });
    const ready = projectStateOf(village, teamHouse.project!)!.ready;
    expect(ready.map((item) => [item.kind, item.line.step, item.waitedMs])).toEqual([
      ["result", "handover", 700_000],
      ["result", "report", 30_000],
    ]);
  });

  it("adds up everything waiting across the village", () => {
    const village = villageStateAt({
      projects: villageProjects,
      lines: todayOnly([...lines, ...teamLines]),
      now: momentAt("10:00", dayStarts),
    });
    const [approvalDesk, team] = village.projects;
    expect([approvalDesk.waiting.length, approvalDesk.ready.length]).toEqual([2, 1]);
    expect([team.waiting.length, team.ready.length]).toEqual([1, 1]);
    expect(village.waitingCount).toBe(5);
  });
});
