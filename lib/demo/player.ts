import type { FeedProblem } from "../feed";
import type { HubStore } from "../store";
import {
  compileDemoScript,
  dayNumberAt,
  feedTimeOf,
  playableLinesBetween,
  startOfDay,
  type CompiledDemoScript,
  type DemoScript,
  type PlayableLine,
} from "./script";
import { DEMO_SCRIPTS } from "./scripts";

export type DemoClock = () => Date;
export type StopDemoTimer = () => void;
export type DemoTimer = (everyMs: number, tick: () => void) => StopDemoTimer;

export const DEMO_TICK_MS = 1000;

/** How many whole scripted days before the current one the first play fills in. */
export const DAYS_OF_HISTORY = 1;

export type RefusedDemoLine = {
  project: string;
  problems: FeedProblem[];
};

export type BrokenDemoScript = {
  project: string;
  reason: string;
};

export type PlayReport = {
  /** The moment this play went up to, written like a feed time. */
  upTo: string;
  added: number;
  alreadyStored: number;
  refused: RefusedDemoLine[];
  brokenScripts: BrokenDemoScript[];
};

export type DemoPlayerOptions = {
  store: Pick<HubStore, "addLines">;
  scripts?: readonly DemoScript[];
  now?: DemoClock;
  daysOfHistory?: number;
};

export type DemoPlayer = {
  /**
   * Stores every scripted line that has happened by now and wasn't played yet.
   * The first call fills in the recent past.
   */
  playDueLines(): PlayReport;
};

export type RunningDemoPlayerOptions = DemoPlayerOptions & {
  timer?: DemoTimer;
  tickMs?: number;
};

export type RunningDemoPlayer = {
  firstPlay: PlayReport;
  /** What went wrong on the latest tick, or null when it went fine. */
  lastProblem(): unknown;
  stop(): void;
};

export const everyInterval: DemoTimer = (everyMs, tick) => {
  const interval = setInterval(tick, everyMs);
  // The player alone should never keep the server process from closing.
  interval.unref();
  return () => clearInterval(interval);
};

export function createDemoPlayer(options: DemoPlayerOptions): DemoPlayer {
  const { store, now = () => new Date(), daysOfHistory = DAYS_OF_HISTORY } = options;
  const { playable, broken } = compileEach(options.scripts ?? DEMO_SCRIPTS);
  let playedUpTo: Date | null = null;

  function dueLinesOf(script: CompiledDemoScript, moment: Date): PlayableLine[] {
    // History starts at the start of a scripted day, never in the middle of
    // one, so a stored line never points at an earlier line that isn't there.
    const historyStarts = startOfDay(script, dayNumberAt(script, moment) - daysOfHistory);
    const since =
      playedUpTo !== null && playedUpTo >= historyStarts
        ? new Date(playedUpTo.getTime() + 1)
        : historyStarts;
    return playableLinesBetween(script, since, moment);
  }

  return {
    playDueLines() {
      const moment = now();
      const due = playable
        .flatMap((script) =>
          dueLinesOf(script, moment).map((line) => ({ ...line, project: script.project })),
        )
        .sort((earlier, later) => earlier.happenedAt.getTime() - later.happenedAt.getTime());

      const report: PlayReport = {
        upTo: feedTimeOf(moment),
        added: 0,
        alreadyStored: 0,
        refused: [],
        brokenScripts: broken,
      };

      if (due.length > 0) {
        const answers = store.addLines(due.map((line) => line.candidate));
        answers.forEach((answer, index) => {
          if (!answer.ok) {
            report.refused.push({ project: due[index].project, problems: answer.problems });
          } else if (answer.added) {
            report.added += 1;
          } else {
            report.alreadyStored += 1;
          }
        });
      }

      // Moved only once the store has taken the lines: if it couldn't, they stay due.
      if (playedUpTo === null || moment > playedUpTo) playedUpTo = moment;
      return report;
    },
  };
}

export function startDemoPlayer(options: RunningDemoPlayerOptions): RunningDemoPlayer {
  const player = createDemoPlayer(options);
  const firstPlay = player.playDueLines();
  let lastProblem: unknown = null;

  const stop = (options.timer ?? everyInterval)(options.tickMs ?? DEMO_TICK_MS, () => {
    // A tick that goes wrong must not take the hub down with it. The lines
    // stay due, so the next tick tries them again.
    try {
      player.playDueLines();
      lastProblem = null;
    } catch (problem) {
      lastProblem = problem;
    }
  });

  return { firstPlay, lastProblem: () => lastProblem, stop };
}

// One script that can't be read is set aside and reported; the others still play.
function compileEach(scripts: readonly DemoScript[]): {
  playable: CompiledDemoScript[];
  broken: BrokenDemoScript[];
} {
  const playable: CompiledDemoScript[] = [];
  const broken: BrokenDemoScript[] = [];
  for (const script of scripts) {
    if (playable.some((earlier) => earlier.project === script.project)) {
      broken.push({
        project: script.project,
        reason: `There are two scripts for ${script.project}. Only the first one is played.`,
      });
      continue;
    }
    try {
      playable.push(compileDemoScript(script));
    } catch (problem) {
      broken.push({
        project: script.project,
        reason: problem instanceof Error ? problem.message : String(problem),
      });
    }
  }
  return { playable, broken };
}
