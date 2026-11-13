import type { FeedLine, FeedStatus } from "../feed/format";
import type { StoredFeedLine } from "../store/hub-store";

// The desk's log: every event the hub has on record, newest first, and the two
// filters over it. Plain functions over the hub's answer; nothing is fetched here.

export const DESK_LOG_ROUTE = "/api/desk/log";

/** How many of each project's newest lines the hub hands the desk. */
export const DESK_LOG_LINES_PER_PROJECT = 200;

/** What `GET /api/desk/log` answers. */
export type DeskLog = {
  /** The hub's own clock when it answered, written like a feed time. */
  asOf: string;
  /**
   * Each project's newest lines, newest first. A real house's lines are its
   * real ones only and a demo house's its scripted ones only (H10).
   */
  events: StoredFeedLine[];
  /** Projects whose lines could not be read. The others are still here (H9). */
  unreadable: string[];
  /** Projects that have older lines than the ones given. */
  cutShort: string[];
};

export type LogFilter = {
  /** null: every project. */
  project: string | null;
  /** null: every agent. */
  agent: string | null;
};

export const EVERYTHING: LogFilter = { project: null, agent: null };

export type LogEntry = {
  /** The project and the line's id. */
  key: string;
  project: string;
  agent: string;
  what: string;
  when: string;
  status: FeedStatus;
  /** The request's own name, shown small. */
  request: string;
  isDemo: boolean;
};

export type ShownLog = {
  /** Newest first. */
  entries: LogEntry[];
  /** True when the record holds older events than the ones shown. */
  olderLeftOut: boolean;
};

const STATUS_WORDS: Record<FeedStatus, string> = {
  working: "Working",
  needs_human: "Needs your answer",
  result_ready: "Ready to read",
  done: "Done",
  blocked: "Blocked",
  failed: "Failed",
};

export function statusInWords(status: FeedStatus): string {
  return STATUS_WORDS[status] ?? "Unknown";
}

function happenedAtMs(line: Pick<FeedLine, "when">): number {
  return Date.parse(line.when);
}

function newestFirst(first: StoredFeedLine, second: StoredFeedLine): number {
  return happenedAtMs(second.line) - happenedAtMs(first.line) || second.seq - first.seq;
}

function entryOf({ line }: StoredFeedLine): LogEntry {
  return {
    key: `${line.project}/${line.id}`,
    project: line.project,
    agent: line.agent,
    what: line.what,
    when: line.when,
    status: line.status,
    request: line.request,
    isDemo: line.demo,
  };
}

/**
 * The moment the log is whole from. A project that was cut short has nothing
 * here from before its oldest line, so with several projects side by side the
 * log starts where the last of them starts: an earlier stretch would show one
 * house busy and another silent when it was not.
 */
function wholeSinceMs(events: readonly StoredFeedLine[], cutShort: readonly string[]): number {
  let since = Number.NEGATIVE_INFINITY;
  for (const project of cutShort) {
    const oldest = events
      .filter((event) => event.line.project === project)
      .reduce((earliest, event) => Math.min(earliest, happenedAtMs(event.line)), Number.POSITIVE_INFINITY);
    if (Number.isFinite(oldest)) since = Math.max(since, oldest);
  }
  return since;
}

/** The events a filter leaves, newest first. Both filters count together. */
export function logShownFor(log: DeskLog, filter: LogFilter = EVERYTHING): ShownLog {
  const ofProject =
    filter.project === null ? log.events : log.events.filter((event) => event.line.project === filter.project);
  const cutShort = log.cutShort.filter((project) => filter.project === null || project === filter.project);
  const since = wholeSinceMs(ofProject, cutShort);
  const whole = ofProject.filter((event) => happenedAtMs(event.line) >= since);

  return {
    entries: whole
      .filter((event) => filter.agent === null || event.line.agent === filter.agent)
      .sort(newestFirst)
      .map(entryOf),
    olderLeftOut: cutShort.length > 0,
  };
}

function inABCOrder(names: Iterable<string>): string[] {
  return [...new Set(names)].sort((first, second) => (first < second ? -1 : first > second ? 1 : 0));
}

/** The projects the filter offers: the village's own, in its order, then any other the log names. */
export function projectsOffered(villageProjects: readonly string[], log: DeskLog | null): string[] {
  const others = inABCOrder((log?.events ?? []).map((event) => event.line.project)).filter(
    (project) => !villageProjects.includes(project),
  );
  return [...villageProjects, ...others];
}

/** The agents the filter offers: everyone the log names, or only those of one project. */
export function agentsOffered(log: DeskLog | null, project: string | null): string[] {
  return inABCOrder(
    (log?.events ?? [])
      .filter((event) => project === null || event.line.project === project)
      .map((event) => event.line.agent),
  );
}

/**
 * The filter after the owner picks a project. An agent that isn't in that
 * project is let go, so the two filters never ask for something that can't be.
 */
export function filterWithProject(filter: LogFilter, project: string | null, log: DeskLog | null): LogFilter {
  const agentStays = filter.agent !== null && agentsOffered(log, project).includes(filter.agent);
  return { project, agent: agentStays ? filter.agent : null };
}

function whoseInWords(filter: LogFilter): string {
  if (filter.project === null && filter.agent === null) return "";
  if (filter.agent === null) return ` from ${filter.project}`;
  if (filter.project === null) return ` from ${filter.agent}`;
  return ` from ${filter.agent} at ${filter.project}`;
}

/** The plain words for a log with nothing in it. */
export function emptyLogWords(filter: LogFilter): string {
  const whose = whoseInWords(filter);
  return whose === "" ? "Nothing has happened yet." : `Nothing${whose} yet.`;
}

/** "12 events from builder at boxcutter, newest first." */
export function logCountWords(count: number, filter: LogFilter): string {
  return `${count} ${count === 1 ? "event" : "events"}${whoseInWords(filter)}, newest first.`;
}
