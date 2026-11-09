import { isDeepStrictEqual } from "node:util";
import { checkFeedLine, type FeedLine, type FeedProblem } from "../feed";
import { HubStoreError, openHubDatabase } from "./database";

export type StoredFeedLine = {
  /** The record's own running number: 1 for the first line stored, always growing. */
  seq: number;
  line: FeedLine;
};

/**
 * `added: false` means the very same line was already in the record.
 * `id_already_used` means the project already has a different line with this
 * id: the first one stays (`kept`) and the new one is not stored.
 */
export type AddLineResult =
  | { ok: true; added: true; stored: StoredFeedLine }
  | { ok: true; added: false; stored: StoredFeedLine }
  | { ok: false; why: "refused_by_checker"; problems: FeedProblem[] }
  | {
      ok: false;
      why: "id_already_used";
      problems: FeedProblem[];
      kept: StoredFeedLine;
    };

export type LineFilter = {
  project?: string;
  agent?: string;
  request?: string;
  /** Lines that happened at this moment or later, going by the line's own time. */
  happenedSince?: Date;
  /** Lines stored after the one with this `seq`, so a reader can pick up where it stopped. */
  storedAfter?: number;
  /** "happened" (the default) goes by the line's own time; lines at the same moment keep the order they were stored in. */
  order?: "happened" | "stored";
  newestFirst?: boolean;
  limit?: number;
};

export type HubStore = {
  addLine(candidate: unknown): AddLineResult;
  /** One answer per candidate, in the same order. A refused line never stops the others. */
  addLines(candidates: readonly unknown[]): AddLineResult[];
  readLines(filter?: LineFilter): StoredFeedLine[];
  findLine(project: string, id: string): StoredFeedLine | null;
  close(): void;
};

type Row = Record<string, unknown>;

// A name to look for takes the same road into the database as the stored
// columns did: written as JSON, then read by the database's own JSON reader.
// Text the database reads in its own way (half of a broken emoji, say) would
// otherwise not match itself, and the same line could not be recognised twice.
const NAME_AS_STORED = "json_extract(?, '$')";
const asJsonText = (name: string) => JSON.stringify(name);

export function openHubStore(databasePath: string): HubStore {
  const database = openHubDatabase(databasePath);
  const selectLine = database.prepare(
    `SELECT seq, line_json FROM feed_lines WHERE project = ${NAME_AS_STORED} AND line_id = ${NAME_AS_STORED}`,
  );
  const insertLine = database.prepare(
    "INSERT INTO feed_lines (line_json) VALUES (?) RETURNING seq, line_json",
  );

  function findLine(project: string, id: string): StoredFeedLine | null {
    const row = selectLine.get(asJsonText(project), asJsonText(id));
    return row === undefined ? null : toStoredLine(row);
  }

  function addCheckedLine(candidate: unknown): AddLineResult {
    const checked = checkFeedLine(candidate);
    if (!checked.ok) {
      return { ok: false, why: "refused_by_checker", problems: checked.problems };
    }

    const lineJson = JSON.stringify(checked.line);
    const kept = findLine(checked.line.project, checked.line.id);
    if (kept === null) {
      const row = insertLine.get(lineJson);
      if (row === undefined) throw new Error("the insert gave no row back");
      return { ok: true, added: true, stored: toStoredLine(row) };
    }

    // Compared as saved data, so the order of the parts inside `details` doesn't make two lines differ.
    if (isDeepStrictEqual(JSON.parse(lineJson), kept.line)) {
      return { ok: true, added: false, stored: kept };
    }
    return {
      ok: false,
      why: "id_already_used",
      problems: [
        {
          field: "id",
          reason: `The hub already keeps a different line numbered "${checked.line.id}" for ${checked.line.project}. The first one stays as it is, and this one was not stored.`,
        },
      ],
      kept,
    };
  }

  function inOneTransaction<Result>(work: () => Result): Result {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      if (database.isTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }

  function addLines(candidates: readonly unknown[]): AddLineResult[] {
    try {
      return inOneTransaction(() => candidates.map(addCheckedLine));
    } catch (cause) {
      throw new HubStoreError(
        "The hub couldn't write to its own record, so nothing was stored.",
        cause,
      );
    }
  }

  function readLines(filter: LineFilter = {}): StoredFeedLine[] {
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    const only = (condition: string, value: string | number | undefined) => {
      if (value === undefined) return;
      conditions.push(condition);
      values.push(value);
    };
    const onlyNamed = (column: string, name: string | undefined) =>
      only(`${column} = ${NAME_AS_STORED}`, name === undefined ? undefined : asJsonText(name));

    onlyNamed("project", filter.project);
    onlyNamed("agent", filter.agent);
    onlyNamed("request", filter.request);
    only("happened_at >= ?", storedTimeOf(filter.happenedSince));
    only("seq > ?", filter.storedAfter);

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const direction = filter.newestFirst ? "DESC" : "ASC";
    const orderBy =
      filter.order === "stored"
        ? `seq ${direction}`
        : `happened_at ${direction}, seq ${direction}`;
    let limit = "";
    if (filter.limit !== undefined) {
      if (!Number.isInteger(filter.limit) || filter.limit < 0) {
        throw new RangeError("limit has to be a whole number, zero or more.");
      }
      limit = "LIMIT ?";
      values.push(filter.limit);
    }

    try {
      return database
        .prepare(`SELECT seq, line_json FROM feed_lines ${where} ORDER BY ${orderBy} ${limit}`)
        .all(...values)
        .map(toStoredLine);
    } catch (cause) {
      throw new HubStoreError("The hub couldn't read its own record.", cause);
    }
  }

  return {
    addLine: (candidate) => addLines([candidate])[0],
    addLines,
    readLines,
    findLine(project, id) {
      try {
        return findLine(project, id);
      } catch (cause) {
        throw new HubStoreError("The hub couldn't read its own record.", cause);
      }
    },
    close() {
      if (database.isOpen) database.close();
    },
  };
}

function storedTimeOf(moment: Date | undefined): string | undefined {
  if (moment === undefined) return undefined;
  if (Number.isNaN(moment.getTime())) {
    throw new RangeError("happenedSince has to be a real time.");
  }
  return moment.toISOString();
}

function toStoredLine(row: Row): StoredFeedLine {
  const { seq, line_json: lineJson } = row;
  if (typeof seq !== "number" || typeof lineJson !== "string") {
    throw new Error("a row of the record has an unexpected shape");
  }
  // Only lines the checker accepted are ever written, so what comes back is a feed line.
  return { seq, line: JSON.parse(lineJson) as FeedLine };
}
