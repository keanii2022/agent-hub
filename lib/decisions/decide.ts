import { REJECT_CHOICE_ID, WAITING_STATUS, type FeedLine, type WaitingFeedLine } from "../feed/format";
import type { RecordedDecision } from "../store/desk-record";
import type { HubStore } from "../store/hub-store";
import type { DecisionDoor, DoorAnswer, DoorDelivery } from "./doors";
import {
  NOTE_MAX_LENGTH,
  NOT_OFFERED_WORDS,
  NOT_UNDERSTOOD_WORDS,
  NOT_WAITING_WORDS,
  alreadyDecidedWords,
  labelOfChoice,
  noDoorWords,
  noteNeededWords,
  notRecordedWords,
  projectSaidWords,
  type DecisionOutcome,
  type DeskAnswer,
  type DeskDecisionRequest,
} from "./words";

// The decision writer. It never decides anything (H1): it is handed what a
// desk button sent, and only carries it. The order is fixed: check the answer,
// write it to the hub's own record, and only then hand it to the project's
// door. The project's answer wins (H2).

export type DecisionDesk = {
  store: Pick<
    HubStore,
    "findLine" | "readLines" | "addLines" | "findDecision" | "recordDecision" | "recordDoorAnswer"
  >;
  doors: readonly DecisionDoor[];
  /** The projects on their own data right now. A stand-in never answers for one of those. */
  realProjects: readonly string[];
  now: Date;
};

const LONGEST_NAME = 200;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= LONGEST_NAME;
}

/** Exactly what a choice's button sends, or null for anything else. Nothing is guessed or corrected. */
export function readDecisionRequest(sent: unknown): DeskDecisionRequest | null {
  if (!isPlainRecord(sent)) return null;
  if (Object.keys(sent).some((part) => !["project", "lineId", "choice", "note"].includes(part))) return null;
  const { project, lineId, choice, note } = sent;
  if (!isAName(project) || !isAName(lineId) || !isAName(choice)) return null;
  if (note === undefined) return { project, lineId, choice };
  if (typeof note !== "string" || note.length > NOTE_MAX_LENGTH) return null;
  return { project, lineId, choice, note };
}

export function deskAnswerOf(decision: RecordedDecision): DeskAnswer {
  return {
    project: decision.project,
    lineId: decision.askLineId,
    choice: decision.choice,
    note: decision.note,
    decidedAt: decision.decidedAt,
    projectSaid: decision.doorAnswer?.answer ?? null,
    reason: decision.doorAnswer?.reason ?? null,
  };
}

/** The door a decision about this line goes to, or null when its project can't take answers from the hub. */
export function doorFor(
  desk: Pick<DecisionDesk, "doors" | "realProjects">,
  ask: Pick<FeedLine, "project" | "demo">,
): DecisionDoor | null {
  // A stand-in answers for a scripted house only: never for a project on its own data (H3).
  if (!ask.demo || desk.realProjects.includes(ask.project)) return null;
  return desk.doors.find((door) => door.project === ask.project) ?? null;
}

function knockOnce(door: DecisionDoor, delivery: DoorDelivery): DoorAnswer | "no_answer" {
  try {
    return door.knock(delivery);
  } catch {
    return "no_answer";
  }
}

/**
 * Carries one answer from the desk: `sent` is what a choice's button sent,
 * untrusted. Everything it names is looked up again in the hub's own record.
 *
 * Throws only when the hub's record can't be read, before anything is written
 * or sent.
 */
export function decideAtTheDesk(desk: DecisionDesk, sent: unknown): DecisionOutcome {
  const { store, now } = desk;
  const request = readDecisionRequest(sent);
  if (request === null) return { outcome: "not_understood", words: NOT_UNDERSTOOD_WORDS };

  const onRecord = store.findLine(request.project, request.lineId)?.line;
  if (onRecord === undefined || onRecord.status !== WAITING_STATUS) {
    return { outcome: "not_waiting", words: NOT_WAITING_WORDS };
  }
  const ask: WaitingFeedLine = onRecord;

  const door = doorFor(desk, ask);
  if (door === null) return { outcome: "no_door", words: noDoorWords(ask.project) };

  const alreadyDecided = (kept: RecordedDecision): DecisionOutcome => {
    return {
      outcome: "already_decided",
      words: alreadyDecidedWords(labelOfChoice(ask.choices, kept.choice)),
      answer: deskAnswerOf(kept),
    };
  };
  // H6: one decision for each request, even if it asks again, whatever the project said to the first.
  const kept = store.findDecision(ask.project, ask.id);
  if (kept !== null) return alreadyDecided(kept);

  const choice = ask.choices.find((offered) => offered.id === request.choice);
  if (choice === undefined) return { outcome: "not_offered", words: NOT_OFFERED_WORDS };

  const note = request.note?.trim() ?? "";
  if (choice.id === REJECT_CHOICE_ID) {
    // H7
    if (note === "") return { outcome: "note_needed", words: noteNeededWords(choice.label) };
  } else if (request.note !== undefined) {
    // Only a reject carries a note, so no button sends this.
    return { outcome: "not_understood", words: NOT_UNDERSTOOD_WORDS };
  }
  const noteOrNone = choice.id === REJECT_CHOICE_ID ? note : null;

  // Read before the write, so a record that can't be read never leaves a decision half carried.
  const nowMs = now.getTime();
  const linesOfRequest = store
    .readLines({ project: ask.project, request: ask.request })
    .map((stored) => stored.line)
    .filter((line) => line.demo && Date.parse(line.when) <= nowMs);

  // H5: the hub's own record first. If that can't be written, nothing is sent.
  let decision: RecordedDecision;
  try {
    const written = store.recordDecision({
      project: ask.project,
      askLineId: ask.id,
      choice: choice.id,
      note: noteOrNone,
      decidedAt: now,
    });
    if (!written.recorded) return alreadyDecided(written.kept);
    decision = written.decision;
  } catch {
    return { outcome: "not_recorded", words: notRecordedWords(ask.project) };
  }

  // H2, H6: handed over once. Whatever comes back is the answer; there is no second try and no other way in.
  const said = knockOnce(door, { ask, choice, note: noteOrNone, at: now, linesOfRequest });

  const doorAnswer =
    said === "no_answer"
      ? { answer: "no_answer" as const, reason: null }
      : said.accepted
        ? { answer: "accepted" as const, reason: null }
        : { answer: "refused" as const, reason: said.reason };
  let afterwards = "";
  let answer: DeskAnswer = { ...deskAnswerOf(decision), projectSaid: doorAnswer.answer, reason: doorAnswer.reason };
  try {
    answer = deskAnswerOf(store.recordDoorAnswer(decision.seq, { ...doorAnswer, answeredAt: now }));
  } catch {
    afterwards += ` The hub couldn't write ${ask.project}'s reply to its own record.`;
  }

  if (said !== "no_answer" && said.accepted) {
    // What the project now says in its own feed comes in like any other line: through the checker.
    try {
      if (store.addLines(said.says).some((added) => !added.ok)) throw new Error("the checker refused a line");
    } catch {
      afterwards += ` The hub couldn't take in what ${ask.project} said next, so this may stay on your desk for now.`;
    }
    return { outcome: "accepted", words: `${ask.project} took your answer: ${choice.label}.${afterwards}`, answer };
  }
  if (said === "no_answer") {
    return {
      outcome: "no_answer",
      words: `Your answer is on record. ${projectSaidWords(answer)}${afterwards}`,
      answer,
    };
  }
  return { outcome: "refused_by_project", words: `${projectSaidWords(answer)}${afterwards}`, answer };
}
