import type { FeedChoice } from "../feed/format";

// What the desk and the hub say to each other about the owner's answers, and
// the plain words for every way an answer can end. Safe for the browser:
// nothing here opens the hub's record.

export const DESK_DECISIONS_ROUTE = "/api/desk/decisions";
export const DESK_SEEN_ROUTE = "/api/desk/seen";

/** The longest note a desk button sends. */
export const NOTE_MAX_LENGTH = 500;

/** What a choice's button sends: `POST /api/desk/decisions`. Only `reject` carries a note, and it must. */
export type DeskDecisionRequest = {
  project: string;
  /** The id of the waiting line the answer is about. */
  lineId: string;
  /** The id of one of the choices that line lists. */
  choice: string;
  note?: string;
};

/** What "Mark as seen" sends: `POST /api/desk/seen`. */
export type DeskSeenRequest = {
  project: string;
  /** The id of the ready result's line. */
  lineId: string;
};

export type ProjectSaid = "accepted" | "refused" | "no_answer";

/** One decision on the hub's record, with what the project's door said to it. */
export type DeskAnswer = {
  project: string;
  lineId: string;
  choice: string;
  note: string | null;
  decidedAt: string;
  /** null: the decision is on record, but no answer from the project is. */
  projectSaid: ProjectSaid | null;
  /** The project's own reason for refusing, in its words. */
  reason: string | null;
};

/** What `GET /api/desk/decisions` answers. */
export type DeskDecisions = {
  /** The recent decisions on record, in the order they were made. */
  answers: DeskAnswer[];
  /** The projects whose door can take an answer from the hub right now. */
  canAnswer: string[];
};

/**
 * What `POST /api/desk/decisions` answers. `words` is the plain sentence the
 * desk says out loud.
 *
 * accepted            the decision is on record, was handed over, and the project took it
 * refused_by_project  on record and handed over; the project said no, and `answer.reason` says why (H2)
 * no_answer           on record and handed over, but nothing came back; it is not sent again (H6)
 * already_decided     this request already had its one decision; `answer` is that first one (H6)
 * note_needed         a reject without a note; nothing written, nothing sent (H7)
 * not_recorded        the record couldn't be written, so nothing was sent (H5)
 * no_door             the project can't take answers from the hub; nothing written, nothing sent (H3)
 * not_waiting         the hub's record has no such waiting request
 * not_offered         the request doesn't list that choice
 * not_understood      not something a desk button sends
 */
export type DecisionOutcome =
  | { outcome: "accepted" | "refused_by_project" | "no_answer" | "already_decided"; words: string; answer: DeskAnswer }
  | {
      outcome: "note_needed" | "not_recorded" | "no_door" | "not_waiting" | "not_offered" | "not_understood";
      words: string;
    };

export const STATUS_OF_DECISION_OUTCOME: Record<DecisionOutcome["outcome"], number> = {
  accepted: 200,
  refused_by_project: 200,
  no_answer: 200,
  already_decided: 409,
  note_needed: 422,
  not_recorded: 503,
  no_door: 409,
  not_waiting: 404,
  not_offered: 422,
  not_understood: 400,
};

/**
 * What `POST /api/desk/seen` answers.
 *
 * seen            the mark is on record, and the result leaves the desk
 * already_seen    it was marked before; nothing new was written
 * not_recorded    the record couldn't be written, so the result stays on the desk
 * not_a_result    the hub's record has no such ready result
 * not_understood  not something the desk's button sends
 */
export type SeenOutcome = {
  outcome: "seen" | "already_seen" | "not_recorded" | "not_a_result" | "not_understood";
  words: string;
};

export const STATUS_OF_SEEN_OUTCOME: Record<SeenOutcome["outcome"], number> = {
  seen: 200,
  already_seen: 200,
  not_recorded: 503,
  not_a_result: 404,
  not_understood: 400,
};

export const NOT_UNDERSTOOD_WORDS = "The hub didn't understand that, so nothing was sent and nothing has changed.";
export const NOT_WAITING_WORDS =
  "The hub's record has no such request waiting for you, so nothing was sent.";
export const NOT_OFFERED_WORDS = "That isn't one of the answers this request offers, so nothing was sent.";
export const NOT_FROM_THE_DESK_WORDS = "Only the hub's own desk can send an answer, so nothing was sent.";
export const DESK_COULD_NOT_REACH_THE_HUB =
  "The desk couldn't reach the hub. If your answer did arrive, the desk will show it in a moment.";
export const NO_DOOR_NOTE = "This house can't take answers from the hub yet.";

export const SEEN_WORDS = "Marked as seen. It is off your desk.";
export const ALREADY_SEEN_WORDS = "That one was already marked as seen.";
export const SEEN_NOT_RECORDED_WORDS =
  "The hub couldn't write that to its own record, so it is still on your desk.";
export const NOT_A_RESULT_WORDS = "The hub's record has no such result ready for you, so nothing was marked.";

/** The plain words on a choice's button; never the short word that is carried to the door. */
export function labelOfChoice(choices: readonly FeedChoice[] | undefined, choiceId: string): string {
  return (choices ?? []).find((choice) => choice.id === choiceId)?.label ?? "your answer";
}

export function noteNeededWords(label: string): string {
  return `${label} needs a note saying why. Nothing was sent.`;
}

export function notRecordedWords(project: string): string {
  return `The hub couldn't write your answer to its own record, so nothing was sent to ${project}. Nothing has changed.`;
}

export function noDoorWords(project: string): string {
  return `${project} can't take answers from the hub yet, so nothing was sent.`;
}

/** What the project's door said to a decision, in a plain sentence or two. */
export function projectSaidWords(answer: DeskAnswer): string {
  if (answer.projectSaid === "accepted") return `${answer.project} took it.`;
  if (answer.projectSaid === "refused") {
    return `${answer.project} said no: ${answer.reason ?? "it gave no reason."} Nothing was changed there, and this request can't be answered from the desk again.`;
  }
  return `No reply from ${answer.project} is on record, and an answer is never sent twice.`;
}

/** "You answered: Approve. approval-desk took it." */
export function answerOnRecordWords(answer: DeskAnswer, label: string): string {
  const note = answer.note === null ? "" : ` Your note: ${answer.note}`;
  return `You answered: ${label}.${note} ${projectSaidWords(answer)}`;
}

export function alreadyDecidedWords(label: string): string {
  return `You already answered this one: ${label}. A request gets one answer, so nothing new was sent.`;
}
