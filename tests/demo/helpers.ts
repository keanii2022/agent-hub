import { checkFeedLine, type FeedLine } from "../../lib/feed";
import {
  compileDemoScript,
  dayNumberAt,
  playableLinesBetween,
  startOfDay,
  type DemoClock,
  type DemoScript,
  type DemoTimer,
} from "../../lib/demo";

export const A_MOMENT_IN_THE_DEMO = new Date("2026-10-05T14:07:00Z");

export type HandClock = {
  now: DemoClock;
  moveTo(moment: Date): void;
  moveOn(seconds: number): void;
};

export function clockAt(start: Date): HandClock {
  let moment = start;
  return {
    now: () => moment,
    moveTo(next) {
      moment = next;
    },
    moveOn(seconds) {
      moment = new Date(moment.getTime() + seconds * 1000);
    },
  };
}

export type HandTimer = {
  timer: DemoTimer;
  tick(): void;
  timesStarted(): number;
  isRunning(): boolean;
  everyMs(): number | null;
};

/** A timer that only ticks when a test says so, so no test ever waits. */
export function handTimer(): HandTimer {
  let onTick: (() => void) | null = null;
  let started = 0;
  let interval: number | null = null;
  return {
    timer(everyMs, tick) {
      started += 1;
      interval = everyMs;
      onTick = tick;
      return () => {
        onTick = null;
      };
    },
    tick() {
      onTick?.();
    },
    timesStarted: () => started,
    isRunning: () => onTick !== null,
    everyMs: () => interval,
  };
}

export function unixSeconds(feedTime: string): number {
  return Date.parse(feedTime) / 1000;
}

/** Every line of the scripted day `moment` falls in, checked by the feed checker. */
export function oneDayOf(script: DemoScript, moment: Date = A_MOMENT_IN_THE_DEMO): FeedLine[] {
  return daysOf(script, 1, moment);
}

/** When the scripted day `moment` falls in began. */
export function dayStartOf(script: DemoScript, moment: Date = A_MOMENT_IN_THE_DEMO): Date {
  const compiled = compileDemoScript(script);
  return startOfDay(compiled, dayNumberAt(compiled, moment));
}

export function daysOf(script: DemoScript, days: number, moment: Date): FeedLine[] {
  const compiled = compileDemoScript(script);
  const firstDay = dayNumberAt(compiled, moment);
  const firstMoment = startOfDay(compiled, firstDay);
  const lastMoment = new Date(startOfDay(compiled, firstDay + days).getTime() - 1);
  return playableLinesBetween(compiled, firstMoment, lastMoment).map(({ candidate }) => {
    const checked = checkFeedLine(candidate);
    if (!checked.ok) {
      throw new Error(
        `The checker refused a scripted line: ${checked.problems.map((problem) => problem.reason).join(" ")}`,
      );
    }
    return checked.line;
  });
}

export const tinyScript = (project: string): DemoScript => ({
  project,
  dayLength: "10:00",
  requestPrefix: "TASK",
  agents: [
    {
      name: "helper",
      arrives: "00:01",
      arrivesSaying: "Opened the shutters",
      leaves: "09:50",
      leavesSaying: "Closed the shutters",
    },
  ],
  requests: [
    [
      {
        at: "01:00",
        agent: "helper",
        step: "water",
        what: "Watering the tomatoes",
        status: "working",
      },
      {
        at: "02:00",
        agent: "helper",
        step: "water",
        what: "The tomatoes are watered",
        status: "done",
      },
    ],
  ],
});
