import type { FeedLine, FeedProblem } from "../feed";
import {
  APPROVAL_DESK_PROJECT,
  readApprovalDeskFeed,
  type RefusedLogbookRow,
} from "../feed/translators/approval-desk";
import type { HubStore } from "../store";
import { readVillageState } from "../village/state/read";
import { projectStateOf, type VillageProject, type VillageState } from "../village/state/village-state";
import { everyInterval, type DemoTimer } from "./player";

// The houses that show a project's own activity instead of a scripted day.
// A project is real only while the hub is told where its records are; without
// that it stays on its scripted day, marked demo (H10).

export const APPROVAL_DESK_DATABASE_VARIABLE = "APPROVAL_DESK_DATABASE";

type Environment = Record<string, string | undefined>;

/** Where approval-desk's own database is, or null when the hub wasn't told. */
export function approvalDeskDatabasePath(environment: Environment = process.env): string | null {
  const chosen = environment[APPROVAL_DESK_DATABASE_VARIABLE];
  return chosen === undefined || chosen.trim() === "" ? null : chosen;
}

export type RealFeedReading = {
  lines: FeedLine[];
  refused: RefusedLogbookRow[];
  /** How far this reading got in the project's records; handed back on the next ask. */
  newestRow: number | null;
};

export type RealFeed = {
  project: string;
  /**
   * The first ask (`afterRow` null) gives the project's newest lines; a later
   * one gives everything after the row the last ask got to. Throws when the
   * project's records can't be read.
   */
  read(afterRow: number | null): RealFeedReading;
};

export function approvalDeskFeed(databasePath: string): RealFeed {
  return {
    project: APPROVAL_DESK_PROJECT,
    read: (afterRow) => readApprovalDeskFeed(databasePath, afterRow === null ? {} : { afterRow }),
  };
}

/** One feed per project the hub was told how to read. Empty when it was told nothing. */
export function configuredRealFeeds(environment: Environment = process.env): RealFeed[] {
  const approvalDesk = approvalDeskDatabasePath(environment);
  return approvalDesk === null ? [] : [approvalDeskFeed(approvalDesk)];
}

export const REAL_FEEDS_ASKED_EVERY_MS = 5000;

export type RealFeedReport = {
  project: string;
  added: number;
  alreadyStored: number;
  /** Rows the translator refused and lines the record refused, each with why. */
  refused: FeedProblem[][];
  /** Why the project's records couldn't be read at all, or null when they could. */
  problem: unknown;
};

export type RunningRealFeeds = {
  /** The projects that are on their own data, not on a scripted day. */
  projects: readonly string[];
  /** The projects whose own records couldn't be read on the latest ask. */
  unreadable(): string[];
  latestReports(): RealFeedReport[];
  stop(): void;
};

export type RealFeedsOptions = {
  store: Pick<HubStore, "addLines">;
  feeds: readonly RealFeed[];
  timer?: DemoTimer;
  everyMs?: number;
};

/**
 * Asks every feed now and again every few seconds, adding what is new to the
 * hub's record. Never throws: a feed that can't be read is reported and asked
 * again next time, and the others are still asked (H9).
 */
export function startRealFeeds(options: RealFeedsOptions): RunningRealFeeds {
  const { store, feeds } = options;
  const gotTo = new Map<string, number>();
  let reports: RealFeedReport[] = [];

  function ask(feed: RealFeed): RealFeedReport {
    const report: RealFeedReport = { project: feed.project, added: 0, alreadyStored: 0, refused: [], problem: null };
    try {
      const reading = feed.read(gotTo.get(feed.project) ?? null);
      report.refused = reading.refused.map((row) => row.problems);
      for (const answer of store.addLines(reading.lines)) {
        if (!answer.ok) report.refused.push(answer.problems);
        else if (answer.added) report.added += 1;
        else report.alreadyStored += 1;
      }
      // Moved only once the record has taken the lines: if it couldn't, they are read again.
      if (reading.newestRow !== null) gotTo.set(feed.project, reading.newestRow);
    } catch (problem) {
      report.problem = problem;
    }
    return report;
  }

  const askAll = () => {
    reports = feeds.map(ask);
  };
  askAll();
  // Without a real feed there is nothing to ask, and so no timer either.
  const stop =
    feeds.length === 0
      ? () => {}
      : (options.timer ?? everyInterval)(options.everyMs ?? REAL_FEEDS_ASKED_EVERY_MS, askAll);

  return {
    projects: feeds.map((feed) => feed.project),
    unreadable: () => reports.filter((report) => report.problem !== null).map((report) => report.project),
    latestReports: () => reports,
    stop,
  };
}

/**
 * How long a real house may stay silent before it goes dark with the "no
 * news" note: one hour after its newest line. A scripted day never pauses for
 * more than a few minutes, but real work comes in bursts with a person in
 * between, and the line's own time is never moved to make it look newer.
 */
export const REAL_HOUSE_NO_NEWS_AFTER_MS = 60 * 60 * 1000;

export type HubVillageReading = {
  store: Pick<HubStore, "readLines">;
  projects: readonly VillageProject[];
  now: Date;
  realFeeds: Pick<RunningRealFeeds, "projects" | "unreadable">;
};

/**
 * The village's state, with real and scripted lines kept apart. A real house
 * is read from its real lines only and a demo house from its scripted lines
 * only, so whatever an earlier run left in the record, no house shows a mix
 * of the two (H10). Only ever reads.
 */
export function readVillageOfHub(reading: HubVillageReading): VillageState {
  const { store, now, realFeeds } = reading;
  const projects = reading.projects.map(
    (project): VillageProject =>
      realFeeds.projects.includes(project.project) ? { ...project, data: "real" } : project,
  );
  const unreadable = realFeeds.unreadable();

  const onlyLinesMarked = (demo: boolean): Pick<HubStore, "readLines"> => ({
    readLines(filter) {
      // The record's older lines can still be read, but a house whose own
      // records can't be read right now has no news the hub can stand behind.
      if (!demo && filter?.project !== undefined && unreadable.includes(filter.project)) {
        throw new Error(`${filter.project}'s own records can't be read.`);
      }
      return store.readLines(filter).filter((stored) => stored.line.demo === demo);
    },
  });

  const demoVillage = readVillageState({
    store: onlyLinesMarked(true),
    projects: projects.filter((project) => project.data === "demo"),
    now,
  });
  const realVillage = readVillageState({
    store: onlyLinesMarked(false),
    projects: projects.filter((project) => project.data === "real"),
    now,
    noNewsAfterMs: REAL_HOUSE_NO_NEWS_AFTER_MS,
  });

  return {
    asOf: demoVillage.asOf,
    projects: projects.flatMap(
      (project) => projectStateOf(project.data === "real" ? realVillage : demoVillage, project.project) ?? [],
    ),
    waitingCount: demoVillage.waitingCount + realVillage.waitingCount,
  };
}
