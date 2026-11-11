import { STAGE_1_CHOICES, WAITING_STATUS, checkFeedLine, type FeedLine, type FeedStatus } from "../../lib/feed";

export const GARDEN_DAY_STARTS = new Date("2026-10-05T09:00:00Z");

export type InventedLine = {
  /** Minutes and seconds after `GARDEN_DAY_STARTS`, like "03:20". */
  at: string;
  status?: FeedStatus;
  project?: string;
  agent?: string;
  request?: string;
  step?: string;
  what?: string;
  id?: string;
  refers_to?: string;
  urgent?: boolean;
  demo?: boolean;
};

export function momentAt(minutesAndSeconds: string, dayStarts: Date = GARDEN_DAY_STARTS): Date {
  const [minutes, seconds] = minutesAndSeconds.split(":").map(Number);
  return new Date(dayStarts.getTime() + (minutes * 60 + seconds) * 1000);
}

let linesMade = 0;

/** An invented feed line the real checker has accepted, so no test runs on a line the hub would refuse. */
export function feedLine(invented: InventedLine): FeedLine {
  linesMade += 1;
  const { at, status = "working", ...rest } = invented;
  const checked = checkFeedLine({
    project: "garden",
    agent: "helper",
    request: "TASK-1",
    step: "water",
    what: "Watering the tomatoes",
    id: `line-${linesMade}`,
    demo: true,
    ...rest,
    status,
    when: momentAt(at).toISOString().replace(/\.000Z$/, "Z"),
    ...(status === WAITING_STATUS && { choices: STAGE_1_CHOICES }),
  });
  if (!checked.ok) {
    throw new Error(`The checker refused an invented line: ${checked.problems.map((problem) => problem.reason).join(" ")}`);
  }
  return checked.line;
}
