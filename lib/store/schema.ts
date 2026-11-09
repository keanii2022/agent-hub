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
