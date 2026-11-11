import { feedTimeOf, LEAVE_STEP } from "../../demo/script";
import { SYSTEM_AGENT, type FeedLine } from "../../feed/format";
import { inOrderHappened, openRequestsFrom, readyResultsFrom } from "../../feed/requests";
import { isForSale, type HouseData, type HouseEntry } from "../houses/list";

// What the village believes is happening, worked out from feed lines and one
// moment and from nothing else: no clock is read and nothing is fetched here.
// The same lines and the same moment always give the same state.

/**
 * How long a project may stay silent before its house goes dark with the
 * "no news" note: five minutes after its newest line. The scripted demo days
 * never go quiet for longer than three minutes ten, so a demo house only goes
 * dark when its feed has really stopped. A real project that is rightly quiet
 * for longer will want its own, longer wait (`noNewsAfterMs`).
 */
export const NO_NEWS_AFTER_MS = 5 * 60 * 1000;

export type VillageProject = {
  readonly project: string;
  /** What the house list says about the project's activity: scripted, or its own. */
  readonly data: HouseData;
};

export type AgentAtHome = {
  name: string;
  /** Its newest line says `working`. */
  isWorking: boolean;
  /** When it came in: the time of its first line since it last left. */
  homeSince: string;
  /** Its newest line: the step it is on and what it is doing, or the last thing it did. */
  latest: FeedLine;
};

export type WaitingItem = {
  /** "decision": the owner has to choose. "result": worth the owner's eyes, nothing to choose. */
  kind: "decision" | "result";
  /** The `needs_human` or `result_ready` line itself: who sent it, what it says, its choices. */
  line: FeedLine;
  /** How long it has waited, from the line's own time to the state's moment. */
  waitedMs: number;
  isUrgent: boolean;
};

export type WhyDark = "no_news" | "feed_failed";

export type ProjectState = {
  project: string;
  /** True when the house list says its data is scripted, or any of its lines is marked demo. */
  isDemo: boolean;
  isDark: boolean;
  /**
   * "no_news": no line at all, or none for `NO_NEWS_AFTER_MS`. "feed_failed":
   * its lines could not be read or made no sense. null while the house is lit.
   */
  whyDark: WhyDark | null;
  /** The time of its newest line; null when it has none. */
  lastNewsAt: string | null;
  /**
   * Who is home, by name. An agent is home from its first line until its
   * `leave` line. Empty while the house is dark: without news, nobody is known
   * to be home.
   */
  agents: AgentAtHome[];
  /** How many of the agents at home are working. */
  workingCount: number;
  /** Requests waiting for the owner's decision, longest-waiting first. They stay open while the house is dark. */
  waiting: WaitingItem[];
  /** Results ready for the owner's eyes, oldest first. */
  ready: WaitingItem[];
};

export type VillageState = {
  /** The moment this state is true for, written like a feed time. */
  asOf: string;
  /** One per project of the house list, in list order. */
  projects: ProjectState[];
  /** Everything waiting for the owner across the village: decisions and ready results. */
  waitingCount: number;
};

export type VillageInput = {
  projects: readonly VillageProject[];
  /** Lines of any projects, in any order. Lines of a project that isn't listed are left out. */
  lines: readonly FeedLine[];
  /** Projects whose lines could not be read at all. */
  unreadable?: readonly string[];
  now: Date;
  noNewsAfterMs?: number;
};

/** The projects that have a house, in list order. */
export function projectsOf(houseList: readonly HouseEntry[]): VillageProject[] {
  return houseList.flatMap((entry) =>
    isForSale(entry) ? [] : [{ project: entry.project, data: entry.data }],
  );
}

export function villageStateAt(input: VillageInput): VillageState {
  const { projects, lines, unreadable = [], now, noNewsAfterMs = NO_NEWS_AFTER_MS } = input;
  const linesOf = new Map<string, FeedLine[]>();
  for (const line of lines) {
    const ofProject = linesOf.get(line.project);
    if (ofProject) ofProject.push(line);
    else linesOf.set(line.project, [line]);
  }

  const states = projects.map((project) => {
    if (unreadable.includes(project.project)) return projectWithBrokenFeed(project);
    try {
      return projectStateAt(project, linesOf.get(project.project) ?? [], now, noNewsAfterMs);
    } catch {
      // H9: whatever is wrong with one project's lines stays in its own house.
      return projectWithBrokenFeed(project);
    }
  });

  return {
    asOf: feedTimeOf(now),
    projects: states,
    waitingCount: states.reduce((total, state) => total + state.waiting.length + state.ready.length, 0),
  };
}

export function projectStateOf(village: VillageState, project: string): ProjectState | null {
  return village.projects.find((state) => state.project === project) ?? null;
}

export class FeedMakesNoSenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedMakesNoSenseError";
  }
}

/** Throws `FeedMakesNoSenseError` when a line isn't this project's or has no readable time. */
export function projectStateAt(
  project: VillageProject,
  lines: readonly FeedLine[],
  now: Date,
  noNewsAfterMs: number = NO_NEWS_AFTER_MS,
): ProjectState {
  const nowMs = now.getTime();
  const happenedAtMs = (line: FeedLine): number => {
    const at = Date.parse(line.when);
    if (line.project !== project.project || Number.isNaN(at)) {
      throw new FeedMakesNoSenseError(
        `A line handed to ${project.project} isn't one of its own, or its time can't be read.`,
      );
    }
    return at;
  };
  // A line dated after `now` has not happened yet, as far as this moment knows.
  const happened = inOrderHappened(lines.filter((line) => happenedAtMs(line) <= nowMs));

  const newest = happened.at(-1);
  const isDark = newest === undefined || nowMs - happenedAtMs(newest) > noNewsAfterMs;

  const home = new Map<string, { homeSince: string; latest: FeedLine }>();
  for (const line of happened) {
    if (line.agent === SYSTEM_AGENT) continue;
    if (line.step === LEAVE_STEP) {
      home.delete(line.agent);
      continue;
    }
    home.set(line.agent, { homeSince: home.get(line.agent)?.homeSince ?? line.when, latest: line });
  }
  const agents: AgentAtHome[] = isDark
    ? []
    : [...home]
        .map(([name, stay]) => ({ name, isWorking: stay.latest.status === "working", ...stay }))
        .sort((first, second) => (first.name < second.name ? -1 : first.name > second.name ? 1 : 0));

  const waitingItem =
    (kind: WaitingItem["kind"]) =>
    (line: FeedLine): WaitingItem => ({
      kind,
      line,
      waitedMs: nowMs - happenedAtMs(line),
      isUrgent: line.urgent === true,
    });

  return {
    project: project.project,
    isDemo: project.data === "demo" || happened.some((line) => line.demo),
    isDark,
    whyDark: isDark ? "no_news" : null,
    lastNewsAt: newest?.when ?? null,
    agents,
    workingCount: agents.filter((agent) => agent.isWorking).length,
    waiting: openRequestsFrom(happened).map(waitingItem("decision")),
    ready: readyResultsFrom(happened).map(waitingItem("result")),
  };
}

function projectWithBrokenFeed(project: VillageProject): ProjectState {
  return {
    project: project.project,
    isDemo: project.data === "demo",
    isDark: true,
    whyDark: "feed_failed",
    lastNewsAt: null,
    agents: [],
    workingCount: 0,
    waiting: [],
    ready: [],
  };
}
