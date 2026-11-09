import type { HubStore, StoredFeedLine } from "../store";
import { feedTimeOf } from "./script";

export const RECENT_EVENTS_ROUTE = "/api/events";
export const DEFAULT_EVENTS_LIMIT = 50;
export const MOST_EVENTS_AT_ONCE = 200;

export type RecentEvents = {
  /** The hub's own clock when it answered, written like a feed time. */
  asOf: string;
  /**
   * Newest first. When the question names `after`, these are the lines stored
   * after that one, oldest first, so a screen can pick up where it stopped.
   */
  events: StoredFeedLine[];
};

export type EventsProblem = {
  problem: string;
};

export type RecentEventsAnswer =
  | { status: 200; body: RecentEvents }
  | { status: 400; body: EventsProblem };

const WHOLE_NUMBER = /^\d{1,15}$/;

/** Only ever reads. Nothing in the question can make the hub write. */
export function readRecentEvents(
  store: Pick<HubStore, "readLines">,
  question: URLSearchParams,
  now: Date,
): RecentEventsAnswer {
  const limit = wholeNumber(question.get("limit")) ?? DEFAULT_EVENTS_LIMIT;
  if (Number.isNaN(limit) || limit < 1 || limit > MOST_EVENTS_AT_ONCE) {
    return refuse(`limit has to be a whole number from 1 to ${MOST_EVENTS_AT_ONCE}.`);
  }

  const after = wholeNumber(question.get("after"));
  if (Number.isNaN(after)) {
    return refuse("after has to be the number of a stored line, like 12.");
  }

  const project = question.get("project") ?? undefined;
  if (project === "") return refuse("project is empty.");

  const events =
    after === undefined
      ? store.readLines({ project, newestFirst: true, limit })
      : store.readLines({ project, storedAfter: after, order: "stored", limit });

  return { status: 200, body: { asOf: feedTimeOf(now), events } };
}

function wholeNumber(text: string | null): number | undefined {
  if (text === null) return undefined;
  return WHOLE_NUMBER.test(text) ? Number(text) : Number.NaN;
}

function refuse(problem: string): RecentEventsAnswer {
  return { status: 400, body: { problem } };
}
