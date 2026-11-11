import {
  FINISH_STATUSES,
  WAITING_STATUS,
  type FeedLine,
  type FeedStatus,
  type PlainFeedLine,
  type WaitingFeedLine,
} from "./format";

// What is waiting for the owner, worked out from feed lines alone. The village
// and the desk screen both ask here, so they can never disagree.

export const RESULT_STATUS = "result_ready" satisfies FeedStatus;

export type ResultFeedLine = PlainFeedLine & { status: typeof RESULT_STATUS };

/** Earliest first, going by each line's own time. Lines at the same moment keep the order they were given in. */
export function inOrderHappened<Line extends Pick<FeedLine, "when">>(lines: readonly Line[]): Line[] {
  return lines
    .map((line) => ({ line, at: Date.parse(line.when) }))
    .sort((earlier, later) => earlier.at - later.at)
    .map(({ line }) => line);
}

function requestKey(line: FeedLine): string {
  return JSON.stringify([line.project, line.request]);
}

function isFinish(status: FeedStatus): boolean {
  return (FINISH_STATUSES as readonly FeedStatus[]).includes(status);
}

/**
 * The requests still waiting for the owner's decision, as their `needs_human`
 * lines, longest-waiting first. Lines of any projects, in any order.
 *
 * A `needs_human` line opens a request. A later line of the same request in
 * the same project closes it when it is a decision (its `refers_to` points at
 * the `needs_human` line) or a finish (`done`, `blocked` or `failed`). When a
 * request asks again, its newest `needs_human` line is the open one.
 */
export function openRequestsFrom(lines: readonly FeedLine[]): WaitingFeedLine[] {
  const open = new Map<string, WaitingFeedLine>();
  for (const line of inOrderHappened(lines)) {
    const key = requestKey(line);
    if (line.status === WAITING_STATUS) {
      // Taken out first, so a request that asks again waits from its new line.
      open.delete(key);
      open.set(key, line);
      continue;
    }
    const asked = open.get(key);
    if (asked === undefined) continue;
    if (isFinish(line.status) || line.refers_to === asked.id) open.delete(key);
  }
  return [...open.values()];
}

/**
 * The results ready for the owner's eyes, as their `result_ready` lines,
 * oldest first. Lines of any projects, in any order.
 *
 * A result stays ready for as long as it is the newest line of its request:
 * anything later on the same request means the request has moved on. Nothing
 * in the rules says yet what else clears a result (the owner looking at it,
 * for one), so until that is settled only the lines handed in limit the list.
 */
export function readyResultsFrom(lines: readonly FeedLine[]): ResultFeedLine[] {
  const ready = new Map<string, ResultFeedLine>();
  for (const line of inOrderHappened(lines)) {
    const key = requestKey(line);
    ready.delete(key);
    if (line.status === RESULT_STATUS) ready.set(key, line as ResultFeedLine);
  }
  return [...ready.values()];
}
