import { closeSync, openSync, readSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { checkFeedLine, type FeedCheckResult, type FeedProblem } from "../checker";
import { STAGE_1_CHOICES, type FeedLine, type FeedStatus, type JsonValue } from "../format";

// approval-desk's logbook, read and never written (H3), turned into feed
// lines. The logbook says what happened and when; it has no project or agent
// field, so those are filled in here. Everything else comes from the row, and
// a row that doesn't say enough is refused, never guessed (H8).

export const APPROVAL_DESK_PROJECT = "approval-desk";

/** The same name the scripted house uses, so the real house has the same resident. */
export const APPROVAL_DESK_AGENT = "refund-agent";

/** How many of the newest logbook entries the hub starts from. */
export const NEWEST_ENTRIES_READ = 10;

/** One row of the `logbook` table, as the database hands it over. `details` is JSON, still as text. */
export type ApprovalDeskLogbookRow = {
  id: number;
  logged_at: string;
  kind: string;
  request_id: string;
  refers_to: number | null;
  details: string;
};

export type ApprovalDeskSource = {
  project: string;
  agent: string;
};

export const APPROVAL_DESK_SOURCE: ApprovalDeskSource = {
  project: APPROVAL_DESK_PROJECT,
  agent: APPROVAL_DESK_AGENT,
};

type Meaning = {
  what: string;
  status: FeedStatus;
};

type Details = { [key: string]: JsonValue };

const isRowNumber = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

const asDetails = (value: JsonValue | undefined): Details | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;

// approval-desk keeps money as whole cents and shows it in dollars.
function dollars(cents: JsonValue | undefined): string | null {
  if (!isRowNumber(cents)) return null;
  return `$${Math.floor(cents / 100).toLocaleString("en-US")}.${String(cents % 100).padStart(2, "0")}`;
}

/**
 * One logbook row as a feed line, checked by the feed checker. Always a real
 * line (`demo: false`) that keeps the row's own time.
 */
export function translateApprovalDeskRow(
  row: ApprovalDeskLogbookRow,
  source: ApprovalDeskSource = APPROVAL_DESK_SOURCE,
): FeedCheckResult {
  // The database doesn't promise what a column holds, so nothing is taken on trust.
  const { id, kind, refers_to: refersTo }: Record<string, unknown> = row;
  if (!isRowNumber(id)) {
    return refused("id", "This logbook row has no line number the hub can use.");
  }
  if (typeof kind !== "string") {
    return refused("step", "This logbook row doesn't say what kind of line it is.");
  }
  if (refersTo !== null && !isRowNumber(refersTo)) {
    return refused("refers_to", "This logbook row points at an earlier line in a way the hub can't read.");
  }
  const details = readDetails(row.details);
  if (details === undefined) {
    return refused("details", "This logbook row's details can't be read.");
  }
  const meaning = readMeaning(kind, asDetails(details));
  if ("reason" in meaning) return { ok: false, problems: [meaning] };

  return checkFeedLine({
    project: source.project,
    agent: source.agent,
    request: row.request_id,
    step: kind,
    what: meaning.what,
    status: meaning.status,
    when: row.logged_at,
    id: String(id),
    ...(refersTo !== null && { refers_to: String(refersTo) }),
    ...(meaning.status === "needs_human" && { choices: STAGE_1_CHOICES }),
    details,
    demo: false,
  });
}

function refused(field: string, reason: string): FeedCheckResult {
  return { ok: false, problems: [{ field, reason }] };
}

function readDetails(text: unknown): JsonValue | undefined {
  if (typeof text !== "string") return undefined;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

function readMeaning(kind: string, details: Details | null): Meaning | FeedProblem {
  switch (kind) {
    case "gate_decision":
      return meaningOfGateDecision(details);
    case "human_decision":
      return meaningOfHumanDecision(details);
    case "refund_done": {
      const paid = dollars(details?.amountCents);
      return { what: paid ? `Paid ${paid} back` : "The refund was paid", status: "done" };
    }
    case "refund_refused":
      return { what: "The refund was refused, so nothing was paid", status: "blocked" };
    default:
      return {
        field: "step",
        reason: `The hub doesn't know what a "${kind}" line in this logbook means.`,
      };
  }
}

// A gate line holds the agent's answer (`output`) and what the gate made of it
// (`decision.result`).
function meaningOfGateDecision(details: Details | null): Meaning | FeedProblem {
  const output = asDetails(details?.output);
  const form = output?.status === "answered" ? asDetails(output.form) : null;
  const refund = form?.action === "refund" ? dollars(form.amountCents) : null;
  const asked = refund ? `a ${refund} refund` : "this";

  switch (asDetails(details?.decision)?.result) {
    case "send_to_human":
      if (output?.status === "ai_down") {
        return { what: "The agent gave no answer, so the gate sent this to a person", status: "needs_human" };
      }
      if (form?.action === "unsure") {
        return { what: "The agent wasn't sure, so the gate sent this to a person", status: "needs_human" };
      }
      return { what: `The gate sent ${asked} to a person`, status: "needs_human" };
    case "block":
      return { what: `The gate blocked ${asked}`, status: "blocked" };
    case "allow":
      // approval-desk writes no later line for a request that asked for no
      // refund, so "working" would keep the agent busy on it for good.
      if (form?.action === "no_refund") {
        return { what: "No refund was asked for, so nothing was paid", status: "done" };
      }
      return { what: `The gate allowed ${asked}`, status: "working" };
    default:
      return {
        field: "status",
        reason: "This gate line doesn't say what the gate decided: allow, block, or send to a person.",
      };
  }
}

function meaningOfHumanDecision(details: Details | null): Meaning | FeedProblem {
  switch (details?.decision) {
    case "approve": {
      const approved = dollars(details.amountCents);
      return { what: `The owner approved ${approved ? `a ${approved} refund` : "the refund"}`, status: "working" };
    }
    case "reject":
      // A reject is the last line of its request: nothing is worked on after it.
      return { what: "The owner rejected the refund", status: "blocked" };
    default:
      return {
        field: "status",
        reason: "This line doesn't say what the person decided: approve or reject.",
      };
  }
}

export type RefusedLogbookRow = {
  /** The row's own number in the logbook, or null when it has none the hub can use. */
  row: number | null;
  problems: FeedProblem[];
};

export type ApprovalDeskFeed = {
  /** The rows that became feed lines, oldest first. */
  lines: FeedLine[];
  /** The rows that didn't, each with why in plain words. They never stop the others (H9). */
  refused: RefusedLogbookRow[];
  /** The highest row number among the rows handed in, or null when there were none. */
  newestRow: number | null;
};

export function translateApprovalDeskRows(
  rows: readonly ApprovalDeskLogbookRow[],
  source: ApprovalDeskSource = APPROVAL_DESK_SOURCE,
): ApprovalDeskFeed {
  const feed: ApprovalDeskFeed = { lines: [], refused: [], newestRow: null };
  for (const row of rows) {
    const rowNumber = isRowNumber(row.id) ? row.id : null;
    if (rowNumber !== null && (feed.newestRow === null || rowNumber > feed.newestRow)) {
      feed.newestRow = rowNumber;
    }
    const translated = translateApprovalDeskRow(row, source);
    if (translated.ok) feed.lines.push(translated.line);
    else feed.refused.push({ row: rowNumber, problems: translated.problems });
  }
  return feed;
}

export class ApprovalDeskLogbookError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "ApprovalDeskLogbookError";
  }
}

const WAIT_FOR_ITS_WRITER_MS = 1000;

// Where a database file says how it journals, and the value that means "with
// a write-ahead log".
const JOURNAL_BYTES = { from: 18, to: 20 };
const WRITE_AHEAD_LOG = 2;

function keepsWriteAheadLog(databasePath: string): boolean {
  const header = Buffer.alloc(JOURNAL_BYTES.to);
  const file = openSync(databasePath, "r");
  try {
    readSync(file, header, 0, header.length, 0);
  } finally {
    closeSync(file);
  }
  return header.subarray(JOURNAL_BYTES.from, JOURNAL_BYTES.to).includes(WRITE_AHEAD_LOG);
}

/**
 * Opens approval-desk's database so that it can only be read (H3): the file
 * is opened read-only, and the connection refuses writes on top of that. A
 * file that isn't there is not created, and neither is any file next to it.
 */
export function openApprovalDeskLogbook(databasePath: string): DatabaseSync {
  let logbook: DatabaseSync | undefined;
  try {
    // Any reader of a database with a write-ahead log, even a read-only one,
    // gets two side files created next to it. That would be the hub writing
    // into the project's folder, so such a database is left alone.
    if (keepsWriteAheadLog(databasePath)) {
      throw new Error("the database keeps a write-ahead log, which a reader can't use without writing");
    }
    logbook = new DatabaseSync(databasePath, { readOnly: true });
    logbook.exec(`PRAGMA query_only = ON; PRAGMA busy_timeout = ${WAIT_FOR_ITS_WRITER_MS}`);
    return logbook;
  } catch (cause) {
    if (logbook?.isOpen) logbook.close();
    throw new ApprovalDeskLogbookError("The hub couldn't open approval-desk's logbook.", cause);
  }
}

export type LogbookQuestion = {
  /** Only the rows after this row number, however many. Without it: the newest `limit` rows. */
  afterRow?: number;
  limit?: number;
};

const COLUMNS = "id, logged_at, kind, request_id, refers_to, details";

/** Rows of the logbook, oldest first. */
export function readLogbookRows(
  logbook: DatabaseSync,
  { afterRow, limit = NEWEST_ENTRIES_READ }: LogbookQuestion = {},
): ApprovalDeskLogbookRow[] {
  try {
    const rows =
      afterRow === undefined
        ? logbook.prepare(`SELECT ${COLUMNS} FROM logbook ORDER BY id DESC LIMIT ?`).all(limit).reverse()
        : logbook.prepare(`SELECT ${COLUMNS} FROM logbook WHERE id > ? ORDER BY id`).all(afterRow);
    return rows as ApprovalDeskLogbookRow[];
  } catch (cause) {
    throw new ApprovalDeskLogbookError("The hub couldn't read approval-desk's logbook.", cause);
  }
}

/**
 * Opens the database at `databasePath` read-only, reads its newest logbook
 * rows, closes it again and gives the rows back as feed lines. Throws
 * `ApprovalDeskLogbookError` when the logbook can't be opened or read.
 */
export function readApprovalDeskFeed(databasePath: string, question: LogbookQuestion = {}): ApprovalDeskFeed {
  const logbook = openApprovalDeskLogbook(databasePath);
  try {
    return translateApprovalDeskRows(readLogbookRows(logbook, question));
  } finally {
    logbook.close();
  }
}
