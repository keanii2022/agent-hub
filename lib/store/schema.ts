export const CHANGE_REFUSED = "This record is add-only: a stored line is never changed.";
export const DELETE_REFUSED = "This record is add-only: a stored line is never deleted.";
export const OVERWRITE_REFUSED =
  "This record is add-only: a stored line is never overwritten.";

// The line itself is kept once, as text. The columns used for looking lines up
// are worked out from that text by the database, so they can never disagree with it.
//
// `happened_at` is the line's time rewritten with exactly three decimals. The
// feed allows "11Z" and "11.5Z", and as plain text the second sorts before the first.
//
// The insert guard is needed on top of the delete guard: REPLACE and
// INSERT OR REPLACE remove the old row without firing delete triggers
// (unless a connection switches recursive triggers on), so only a check
// before the insert stops an overwrite.
export const FEED_LINES_SCHEMA = `
CREATE TABLE IF NOT EXISTS feed_lines (
  seq INTEGER PRIMARY KEY AUTOINCREMENT CHECK (seq > 0),
  line_json TEXT NOT NULL CHECK (json_valid(line_json)),
  project TEXT NOT NULL GENERATED ALWAYS AS (json_extract(line_json, '$.project')) STORED,
  line_id TEXT NOT NULL GENERATED ALWAYS AS (json_extract(line_json, '$.id')) STORED,
  agent TEXT NOT NULL GENERATED ALWAYS AS (json_extract(line_json, '$.agent')) STORED,
  request TEXT NOT NULL GENERATED ALWAYS AS (json_extract(line_json, '$.request')) STORED,
  happened_at TEXT NOT NULL GENERATED ALWAYS AS (
    strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(line_json, '$.when'))
  ) STORED,
  UNIQUE (project, line_id)
);

CREATE INDEX IF NOT EXISTS feed_lines_by_time ON feed_lines (happened_at);

CREATE TRIGGER IF NOT EXISTS feed_lines_never_changed
BEFORE UPDATE ON feed_lines
BEGIN
  SELECT RAISE(ABORT, '${CHANGE_REFUSED}');
END;

CREATE TRIGGER IF NOT EXISTS feed_lines_never_deleted
BEFORE DELETE ON feed_lines
BEGIN
  SELECT RAISE(ABORT, '${DELETE_REFUSED}');
END;

CREATE TRIGGER IF NOT EXISTS feed_lines_never_overwritten
BEFORE INSERT ON feed_lines
WHEN EXISTS (SELECT 1 FROM feed_lines WHERE seq = NEW.seq)
  OR EXISTS (
    SELECT 1 FROM feed_lines
    WHERE project = json_extract(NEW.line_json, '$.project')
      AND line_id = json_extract(NEW.line_json, '$.id')
  )
BEGIN
  SELECT RAISE(ABORT, '${OVERWRITE_REFUSED}');
END;
`;

// ---- What the owner did at the desk ----
//
// Kept in the same file as the feed lines and add-only in the same way: the
// database itself refuses a change, a delete and an overwrite, whoever asks.

export const SECOND_DECISION_REFUSED = "This request already has its one decision.";
export const DECISION_WITHOUT_ITS_REQUEST_REFUSED =
  "A decision has to be about a waiting request the record already holds.";
export const SECOND_ANSWER_REFUSED = "This decision already has its one answer from the project.";
export const ANSWER_WITHOUT_ITS_DECISION_REFUSED =
  "An answer has to be about a decision the record already holds.";
export const SEEN_TWICE_REFUSED = "This result is already marked as seen.";
export const SEEN_WITHOUT_ITS_RESULT_REFUSED =
  "Only a ready result the record already holds can be marked as seen.";

export const REJECT_CHOICE_IN_THE_RECORD = "reject";
export const DOOR_ANSWERS_IN_THE_RECORD = ["accepted", "refused", "no_answer"] as const;

// A time is kept the way the database itself writes one, so it sorts as text and is always a real moment.
const isAStoredTime = (column: string) => `${column} = strftime('%Y-%m-%dT%H:%M:%fZ', ${column})`;

function neverChangedOrDeleted(table: string): string {
  return `
CREATE TRIGGER IF NOT EXISTS ${table}_never_changed
BEFORE UPDATE ON ${table}
BEGIN
  SELECT RAISE(ABORT, '${CHANGE_REFUSED}');
END;

CREATE TRIGGER IF NOT EXISTS ${table}_never_deleted
BEFORE DELETE ON ${table}
BEGIN
  SELECT RAISE(ABORT, '${DELETE_REFUSED}');
END;
`;
}

// As with the feed lines, only a check before the insert stops REPLACE and
// INSERT OR REPLACE from quietly taking an old row away.
function refusedBeforeInsert(table: string, name: string, when: string, why: string): string {
  return `
CREATE TRIGGER IF NOT EXISTS ${table}_${name}
BEFORE INSERT ON ${table}
WHEN ${when}
BEGIN
  SELECT RAISE(ABORT, '${why}');
END;
`;
}

/**
 * `decisions`: one row per decision the owner made at the desk, written before
 * anything is sent (H5). One row per request at most (H6), and a reject
 * always has its note (H7).
 *
 * `decision_answers`: what the project's door said to a decision, at most once.
 *
 * `seen_results`: the ready results the owner marked as seen.
 */
export const DECISIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS decisions (
  seq INTEGER PRIMARY KEY AUTOINCREMENT CHECK (seq > 0),
  project TEXT NOT NULL,
  ask_line_id TEXT NOT NULL,
  choice TEXT NOT NULL CHECK (choice <> ''),
  note TEXT CHECK (note IS NULL OR trim(note) <> ''),
  decided_at TEXT NOT NULL CHECK (${isAStoredTime("decided_at")}),
  CHECK (choice <> '${REJECT_CHOICE_IN_THE_RECORD}' OR note IS NOT NULL),
  UNIQUE (project, ask_line_id)
) STRICT;
${neverChangedOrDeleted("decisions")}
${refusedBeforeInsert(
  "decisions",
  "never_overwritten",
  "EXISTS (SELECT 1 FROM decisions WHERE seq = NEW.seq)",
  OVERWRITE_REFUSED,
)}
${refusedBeforeInsert(
  "decisions",
  "one_for_each_request",
  `EXISTS (
    SELECT 1 FROM decisions
    JOIN feed_lines AS asks ON asks.project = decisions.project AND asks.line_id = decisions.ask_line_id
    WHERE decisions.project = NEW.project
      AND (
        decisions.ask_line_id = NEW.ask_line_id
        OR asks.request = (SELECT request FROM feed_lines WHERE project = NEW.project AND line_id = NEW.ask_line_id)
      )
  )`,
  SECOND_DECISION_REFUSED,
)}
${refusedBeforeInsert(
  "decisions",
  "only_about_a_waiting_request",
  `NOT EXISTS (
    SELECT 1 FROM feed_lines
    WHERE project = NEW.project
      AND line_id = NEW.ask_line_id
      AND json_extract(line_json, '$.status') = 'needs_human'
  )`,
  DECISION_WITHOUT_ITS_REQUEST_REFUSED,
)}

CREATE TABLE IF NOT EXISTS decision_answers (
  decision_seq INTEGER PRIMARY KEY CHECK (decision_seq > 0),
  answer TEXT NOT NULL CHECK (answer IN (${DOOR_ANSWERS_IN_THE_RECORD.map((answer) => `'${answer}'`).join(", ")})),
  reason TEXT CHECK (reason IS NULL OR trim(reason) <> ''),
  answered_at TEXT NOT NULL CHECK (${isAStoredTime("answered_at")}),
  CHECK ((answer = 'refused') = (reason IS NOT NULL))
) STRICT;
${neverChangedOrDeleted("decision_answers")}
${refusedBeforeInsert(
  "decision_answers",
  "one_for_each_decision",
  "EXISTS (SELECT 1 FROM decision_answers WHERE decision_seq = NEW.decision_seq)",
  SECOND_ANSWER_REFUSED,
)}
${refusedBeforeInsert(
  "decision_answers",
  "only_about_a_decision",
  "NOT EXISTS (SELECT 1 FROM decisions WHERE seq = NEW.decision_seq)",
  ANSWER_WITHOUT_ITS_DECISION_REFUSED,
)}

CREATE TABLE IF NOT EXISTS seen_results (
  seq INTEGER PRIMARY KEY AUTOINCREMENT CHECK (seq > 0),
  project TEXT NOT NULL,
  result_line_id TEXT NOT NULL,
  seen_at TEXT NOT NULL CHECK (${isAStoredTime("seen_at")}),
  UNIQUE (project, result_line_id)
) STRICT;
${neverChangedOrDeleted("seen_results")}
${refusedBeforeInsert(
  "seen_results",
  "never_overwritten",
  "EXISTS (SELECT 1 FROM seen_results WHERE seq = NEW.seq)",
  OVERWRITE_REFUSED,
)}
${refusedBeforeInsert(
  "seen_results",
  "once_for_each_result",
  "EXISTS (SELECT 1 FROM seen_results WHERE project = NEW.project AND result_line_id = NEW.result_line_id)",
  SEEN_TWICE_REFUSED,
)}
${refusedBeforeInsert(
  "seen_results",
  "only_a_ready_result",
  `NOT EXISTS (
    SELECT 1 FROM feed_lines
    WHERE project = NEW.project
      AND line_id = NEW.result_line_id
      AND json_extract(line_json, '$.status') = 'result_ready'
  )`,
  SEEN_WITHOUT_ITS_RESULT_REFUSED,
)}
`;
