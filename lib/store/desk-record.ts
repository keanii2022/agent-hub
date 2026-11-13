import type { DatabaseSync } from "node:sqlite";
import { HubStoreError, inOneTransaction } from "./database";
import type { DOOR_ANSWERS_IN_THE_RECORD } from "./schema";

// What the owner did at the desk, kept beside the feed lines in the hub's own
// record: decisions, what each project's door said to them, and the results
// marked as seen. Rows are only ever added.

export type DoorAnswerKind = (typeof DOOR_ANSWERS_IN_THE_RECORD)[number];

export type RecordedDoorAnswer = {
  /** "no_answer": the decision was handed over, but nothing came back from the door. */
  answer: DoorAnswerKind;
  /** The project's own reason, in its words. Only a refusal has one. */
  reason: string | null;
  answeredAt: string;
};

export type RecordedDecision = {
  /** The record's own running number for decisions. */
  seq: number;
  project: string;
  /** The id of the waiting line the decision answers. */
  askLineId: string;
  /** The id of the choice the owner picked, out of the ones the line itself listed. */
  choice: string;
  note: string | null;
  decidedAt: string;
  /** What the project's door said; null until its answer is written. */
  doorAnswer: RecordedDoorAnswer | null;
};

export type NewDecision = {
  project: string;
  askLineId: string;
  choice: string;
  note: string | null;
  decidedAt: Date;
};

/** `recorded: false` means this request already had its one decision (H6): the first one stays (`kept`). */
export type RecordDecisionResult =
  | { recorded: true; decision: RecordedDecision }
  | { recorded: false; why: "already_decided"; kept: RecordedDecision };

export type NewDoorAnswer = {
  answer: DoorAnswerKind;
  reason: string | null;
  answeredAt: Date;
};

export type SeenResult = {
  seq: number;
  project: string;
  /** The id of the `result_ready` line the owner has seen. */
  resultLineId: string;
  seenAt: string;
};

/** `marked: false` means it was already marked: the first mark stays. */
export type MarkSeenResult = { marked: boolean; seen: SeenResult };

export type DecisionFilter = {
  /** Decisions made at this moment or later. */
  decidedSince?: Date;
};

export type DeskRecord = {
  /** Throws `HubStoreError` when the decision can't be written; then nothing may be sent (H5). */
  recordDecision(decision: NewDecision): RecordDecisionResult;
  /** Writes what the door said to a decision. A decision gets one answer; a second is refused. */
  recordDoorAnswer(decisionSeq: number, answer: NewDoorAnswer): RecordedDecision;
  /** The one decision the request this waiting line belongs to already has, whichever of its waiting lines it answered. */
  findDecision(project: string, askLineId: string): RecordedDecision | null;
  /** In the order they were made. */
  readDecisions(filter?: DecisionFilter): RecordedDecision[];
  markResultSeen(project: string, resultLineId: string, seenAt: Date): MarkSeenResult;
  readSeenResults(): SeenResult[];
};

type Row = Record<string, unknown>;

// Names take the same road in as the feed lines' own columns did (see
// `NAME_AS_STORED` in hub-store.ts), so a decision always finds its line.
const NAME_AS_STORED = "json_extract(?, '$')";
const asJsonText = (name: string) => JSON.stringify(name);

const DECISION_WITH_ITS_ANSWER = `
  SELECT
    decisions.seq, decisions.project, decisions.ask_line_id, decisions.choice, decisions.note, decisions.decided_at,
    decision_answers.answer, decision_answers.reason, decision_answers.answered_at
  FROM decisions LEFT JOIN decision_answers ON decision_answers.decision_seq = decisions.seq`;

const SEEN_RESULT = "SELECT seq, project, result_line_id, seen_at FROM seen_results";

export function deskRecordOn(database: DatabaseSync): DeskRecord {
  // H6 is read strictly: a request gets one decision, even when it asks again with a new waiting line.
  const selectDecision = database.prepare(
    `${DECISION_WITH_ITS_ANSWER}
     WHERE decisions.project = ${NAME_AS_STORED} AND decisions.ask_line_id IN (
       SELECT asks.line_id FROM feed_lines AS asks
       JOIN feed_lines AS this_ask ON asks.project = this_ask.project AND asks.request = this_ask.request
       WHERE this_ask.project = ${NAME_AS_STORED} AND this_ask.line_id = ${NAME_AS_STORED}
     )
     ORDER BY decisions.seq LIMIT 1`,
  );
  const selectDecisionNumbered = database.prepare(`${DECISION_WITH_ITS_ANSWER} WHERE decisions.seq = ?`);
  const selectDecisionsSince = database.prepare(
    `${DECISION_WITH_ITS_ANSWER} WHERE decisions.decided_at >= ? ORDER BY decisions.seq`,
  );
  const insertDecision = database.prepare(
    `INSERT INTO decisions (project, ask_line_id, choice, note, decided_at)
     VALUES (${NAME_AS_STORED}, ${NAME_AS_STORED}, ?, ?, ?) RETURNING seq`,
  );
  const insertAnswer = database.prepare(
    "INSERT INTO decision_answers (decision_seq, answer, reason, answered_at) VALUES (?, ?, ?, ?)",
  );
  const selectSeen = database.prepare(
    `${SEEN_RESULT} WHERE project = ${NAME_AS_STORED} AND result_line_id = ${NAME_AS_STORED}`,
  );
  const selectEverySeen = database.prepare(`${SEEN_RESULT} ORDER BY seq`);
  const insertSeen = database.prepare(
    `INSERT INTO seen_results (project, result_line_id, seen_at)
     VALUES (${NAME_AS_STORED}, ${NAME_AS_STORED}, ?) RETURNING seq, project, result_line_id, seen_at`,
  );

  function findDecision(project: string, askLineId: string): RecordedDecision | null {
    const row = selectDecision.get(asJsonText(project), asJsonText(project), asJsonText(askLineId));
    return row === undefined ? null : toDecision(row);
  }

  function decisionNumbered(seq: number): RecordedDecision {
    const row = selectDecisionNumbered.get(seq);
    if (row === undefined) throw new Error(`the record has no decision numbered ${seq}`);
    return toDecision(row);
  }

  function reading<Result>(read: () => Result): Result {
    try {
      return read();
    } catch (cause) {
      throw new HubStoreError("The hub couldn't read its own record.", cause);
    }
  }

  return {
    recordDecision(decision) {
      try {
        return inOneTransaction(database, (): RecordDecisionResult => {
          const kept = findDecision(decision.project, decision.askLineId);
          if (kept !== null) return { recorded: false, why: "already_decided", kept };
          const row = insertDecision.get(
            asJsonText(decision.project),
            asJsonText(decision.askLineId),
            decision.choice,
            decision.note,
            storedTimeOf(decision.decidedAt),
          );
          if (typeof row?.seq !== "number") throw new Error("the insert gave no row back");
          return { recorded: true, decision: decisionNumbered(row.seq) };
        });
      } catch (cause) {
        throw new HubStoreError(
          "The hub couldn't write the decision to its own record, so it was not sent.",
          cause,
        );
      }
    },

    recordDoorAnswer(decisionSeq, answer) {
      try {
        return inOneTransaction(database, () => {
          insertAnswer.run(decisionSeq, answer.answer, answer.reason, storedTimeOf(answer.answeredAt));
          return decisionNumbered(decisionSeq);
        });
      } catch (cause) {
        throw new HubStoreError("The hub couldn't write the project's answer to its own record.", cause);
      }
    },

    findDecision: (project, askLineId) => reading(() => findDecision(project, askLineId)),

    readDecisions: (filter = {}) =>
      reading(() =>
        selectDecisionsSince
          // Every stored time sorts after the empty text, so no filter means every decision.
          .all(filter.decidedSince === undefined ? "" : storedTimeOf(filter.decidedSince))
          .map(toDecision),
      ),

    markResultSeen(project, resultLineId, seenAt) {
      try {
        return inOneTransaction(database, (): MarkSeenResult => {
          const already = selectSeen.get(asJsonText(project), asJsonText(resultLineId));
          if (already !== undefined) return { marked: false, seen: toSeen(already) };
          const row = insertSeen.get(asJsonText(project), asJsonText(resultLineId), storedTimeOf(seenAt));
          if (row === undefined) throw new Error("the insert gave no row back");
          return { marked: true, seen: toSeen(row) };
        });
      } catch (cause) {
        throw new HubStoreError("The hub couldn't write to its own record, so nothing was marked.", cause);
      }
    },

    readSeenResults: () => reading(() => selectEverySeen.all().map(toSeen)),
  };
}

function storedTimeOf(moment: Date): string {
  if (Number.isNaN(moment.getTime())) throw new RangeError("A time in the record has to be a real time.");
  return moment.toISOString();
}

function toDecision(row: Row): RecordedDecision {
  const { seq, project, ask_line_id: askLineId, choice, note, decided_at: decidedAt } = row;
  const { answer, reason, answered_at: answeredAt } = row;
  if (
    typeof seq !== "number" ||
    typeof project !== "string" ||
    typeof askLineId !== "string" ||
    typeof choice !== "string" ||
    typeof decidedAt !== "string"
  ) {
    throw new Error("a decision in the record has an unexpected shape");
  }
  return {
    seq,
    project,
    askLineId,
    choice,
    note: typeof note === "string" ? note : null,
    decidedAt,
    doorAnswer:
      typeof answer === "string" && typeof answeredAt === "string"
        ? { answer: answer as DoorAnswerKind, reason: typeof reason === "string" ? reason : null, answeredAt }
        : null,
  };
}

function toSeen(row: Row): SeenResult {
  const { seq, project, result_line_id: resultLineId, seen_at: seenAt } = row;
  if (
    typeof seq !== "number" ||
    typeof project !== "string" ||
    typeof resultLineId !== "string" ||
    typeof seenAt !== "string"
  ) {
    throw new Error("a seen mark in the record has an unexpected shape");
  }
  return { seq, project, resultLineId, seenAt };
}
