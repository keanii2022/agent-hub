import {
  STAGE_1_CHOICES,
  WAITING_STATUS,
  type FeedChoice,
  type FeedStatus,
  type JsonValue,
} from "../feed";

export type ScriptedLine = {
  /** Minutes and seconds into the scripted day, like "03:20". */
  at: string;
  agent: string;
  step: string;
  what: string;
  status: FeedStatus;
  /** A name later lines of the same request can point at with `about`. */
  as?: string;
  /** The `as` name of an earlier line of the same request that this line is about. */
  about?: string;
  /** Left out, a waiting line offers the Stage 1 choices. */
  choices?: readonly FeedChoice[];
  urgent?: boolean;
  details?: JsonValue;
};

/** Every line of one request, in the order they happen. */
export type ScriptedRequest = readonly ScriptedLine[];

export type ScriptedAgent = {
  name: string;
  arrives: string;
  arrivesSaying: string;
  leaves: string;
  leavesSaying: string;
};

export type DemoScript = {
  project: string;
  /** How long one scripted day lasts before it starts again, like "20:00". */
  dayLength: string;
  /** Request names look like REQ-512-3: this prefix, the day's number, the request's place in the script. */
  requestPrefix: string;
  /** Who is in the house and when. Change a time here and the number of agents changes with it. */
  agents: readonly ScriptedAgent[];
  requests: readonly ScriptedRequest[];
};

export const ARRIVE_STEP = "arrive";
export const LEAVE_STEP = "leave";
export const SHIFT_REQUEST_PREFIX = "SHIFT";

// Scripted days are counted from here, not from 1970, so the numbers inside
// ids and request names stay short enough to read on a screen.
export const FIRST_DEMO_DAY_STARTS = new Date("2026-01-01T00:00:00Z");

export class DemoScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoScriptError";
  }
}

type CompiledLine = {
  secondsIntoDay: number;
  /** The line's place in the day, 1 for the earliest. */
  numberInDay: number;
  requestPrefix: string;
  requestNumber: number;
  refersToNumberInDay?: number;
  scripted: ScriptedLine;
};

export type CompiledDemoScript = {
  project: string;
  dayLengthSeconds: number;
  /** Earliest first. */
  lines: readonly CompiledLine[];
};

export type PlayableLine = {
  happenedAt: Date;
  /** Not checked yet: the store's checker has the last word on every line. */
  candidate: Record<string, unknown>;
};

const MINUTES_AND_SECONDS = /^(\d{1,3}):([0-5]\d)$/;

export function secondsOf(minutesAndSeconds: string): number {
  const parts = MINUTES_AND_SECONDS.exec(minutesAndSeconds);
  if (parts === null) {
    throw new DemoScriptError(
      `"${minutesAndSeconds}" isn't a time the demo can read. It has to look like 03:20.`,
    );
  }
  return Number(parts[1]) * 60 + Number(parts[2]);
}

export function compileDemoScript(script: DemoScript): CompiledDemoScript {
  const dayLengthSeconds = secondsOf(script.dayLength);
  if (dayLengthSeconds === 0) {
    throw new DemoScriptError(`The scripted day of ${script.project} has no length.`);
  }

  const shifts = script.agents.map((agent): ScriptedRequest => [
    {
      at: agent.arrives,
      agent: agent.name,
      step: ARRIVE_STEP,
      what: agent.arrivesSaying,
      status: "working",
    },
    {
      at: agent.leaves,
      agent: agent.name,
      step: LEAVE_STEP,
      what: agent.leavesSaying,
      status: "done",
    },
  ]);

  const drafts = [
    ...draftRequests(shifts, SHIFT_REQUEST_PREFIX, script.project, dayLengthSeconds),
    ...draftRequests(
      script.requests,
      script.requestPrefix,
      script.project,
      dayLengthSeconds,
    ),
  ];

  // A stable sort: lines at the same second keep the order they were written in.
  const inDayOrder = [...drafts].sort(
    (earlier, later) => earlier.secondsIntoDay - later.secondsIntoDay,
  );
  const numberInDay = new Map(inDayOrder.map((draft, index) => [draft, index + 1]));

  return {
    project: script.project,
    dayLengthSeconds,
    lines: inDayOrder.map((draft) => ({
      secondsIntoDay: draft.secondsIntoDay,
      numberInDay: numberInDay.get(draft) ?? 0,
      requestPrefix: draft.requestPrefix,
      requestNumber: draft.requestNumber,
      ...(draft.refersTo !== undefined && {
        refersToNumberInDay: numberInDay.get(draft.refersTo),
      }),
      scripted: draft.scripted,
    })),
  };
}

type DraftLine = Omit<CompiledLine, "numberInDay" | "refersToNumberInDay"> & {
  refersTo?: DraftLine;
};

function draftRequests(
  requests: readonly ScriptedRequest[],
  requestPrefix: string,
  project: string,
  dayLengthSeconds: number,
): DraftLine[] {
  return requests.flatMap((request, requestIndex) => {
    const named = new Map<string, DraftLine>();
    return request.map((scripted) => {
      const secondsIntoDay = secondsOf(scripted.at);
      // The past is filled in by whole days. A line past the end of its own
      // day would happen during the next one, where that filling-in would miss it.
      if (secondsIntoDay >= dayLengthSeconds) {
        throw new DemoScriptError(
          `A line of ${project} is set for ${scripted.at}, after its scripted day has ended.`,
        );
      }

      const draft: DraftLine = {
        secondsIntoDay,
        requestPrefix,
        requestNumber: requestIndex + 1,
        scripted,
      };

      if (scripted.about !== undefined) {
        const earlier = named.get(scripted.about);
        if (earlier === undefined || earlier.secondsIntoDay > secondsIntoDay) {
          throw new DemoScriptError(
            `A line of ${project} is about "${scripted.about}", but no earlier line of the same request has that name.`,
          );
        }
        draft.refersTo = earlier;
      }
      if (scripted.as !== undefined) {
        if (named.has(scripted.as)) {
          throw new DemoScriptError(
            `Two lines of one ${project} request are both named "${scripted.as}".`,
          );
        }
        named.set(scripted.as, draft);
      }
      return draft;
    });
  });
}

export function dayNumberAt(script: CompiledDemoScript, moment: Date): number {
  return Math.floor(
    (moment.getTime() - FIRST_DEMO_DAY_STARTS.getTime()) / dayLengthMs(script),
  );
}

export function startOfDay(script: CompiledDemoScript, dayNumber: number): Date {
  return new Date(FIRST_DEMO_DAY_STARTS.getTime() + dayNumber * dayLengthMs(script));
}

/** Every scripted line that happens from `since` up to and including `upTo`, earliest first. */
export function playableLinesBetween(
  script: CompiledDemoScript,
  since: Date,
  upTo: Date,
): PlayableLine[] {
  const playable: PlayableLine[] = [];
  const firstDay = Math.max(0, dayNumberAt(script, since));
  const lastDay = dayNumberAt(script, upTo);

  for (let dayNumber = firstDay; dayNumber <= lastDay; dayNumber += 1) {
    const dayStartsAt = startOfDay(script, dayNumber).getTime();
    for (const line of script.lines) {
      const happenedAt = new Date(dayStartsAt + line.secondsIntoDay * 1000);
      if (happenedAt < since || happenedAt > upTo) continue;
      playable.push({
        happenedAt,
        candidate: feedLineOf(script.project, line, dayNumber, happenedAt),
      });
    }
  }
  return playable;
}

// Ids, request names and times come from the script and the day's number and
// from nothing else. That is what makes two runs give the very same lines, and
// what lets the add-only store recognise a line it already has.
function feedLineOf(
  project: string,
  line: CompiledLine,
  dayNumber: number,
  happenedAt: Date,
): Record<string, unknown> {
  const { scripted } = line;
  return {
    project,
    agent: scripted.agent,
    request: `${line.requestPrefix}-${dayNumber}-${line.requestNumber}`,
    step: scripted.step,
    what: scripted.what,
    status: scripted.status,
    when: feedTimeOf(happenedAt),
    id: lineId(dayNumber, line.numberInDay),
    ...(line.refersToNumberInDay !== undefined && {
      refers_to: lineId(dayNumber, line.refersToNumberInDay),
    }),
    ...(scripted.status === WAITING_STATUS
      ? { choices: scripted.choices ?? STAGE_1_CHOICES }
      : scripted.choices !== undefined && { choices: scripted.choices }),
    ...(scripted.urgent !== undefined && { urgent: scripted.urgent }),
    ...(scripted.details !== undefined && { details: scripted.details }),
    demo: true,
  };
}

function lineId(dayNumber: number, numberInDay: number): string {
  return `${dayNumber}-${numberInDay}`;
}

export function feedTimeOf(moment: Date): string {
  return moment.toISOString().replace(/\.000Z$/, "Z");
}

function dayLengthMs(script: CompiledDemoScript): number {
  return script.dayLengthSeconds * 1000;
}
