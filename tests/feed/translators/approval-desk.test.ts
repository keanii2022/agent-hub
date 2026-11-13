import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { STAGE_1_CHOICES, checkFeedLine, type FeedCheckResult, type FeedLine } from "../../../lib/feed";
import {
  APPROVAL_DESK_AGENT,
  APPROVAL_DESK_PROJECT,
  ApprovalDeskLogbookError,
  NEWEST_ENTRIES_READ,
  openApprovalDeskLogbook,
  readApprovalDeskFeed,
  readLogbookRows,
  translateApprovalDeskRow,
  translateApprovalDeskRows,
  type ApprovalDeskLogbookRow,
} from "../../../lib/feed/translators/approval-desk";
import {
  INVENTED_ENTRIES,
  gateSaid,
  makeLogbookFixture,
  rowOf,
  timeOn,
  type LogbookFixture,
} from "./logbook-fixture";

const inventedRows = INVENTED_ENTRIES.map((entry, index) => rowOf(entry, index + 1));

function lineOf(result: FeedCheckResult): FeedLine {
  if (!result.ok) {
    throw new Error(`Refused: ${result.problems.map((problem) => problem.reason).join(" ")}`);
  }
  return result.line;
}

function reasonsOf(result: FeedCheckResult): string[] {
  if (result.ok) throw new Error("This row was translated, but it should have been refused.");
  return result.problems.map((problem) => problem.reason);
}

const aGoodRow = inventedRows[4];
const rowWith = (changes: Record<string, unknown>) => ({ ...aGoodRow, ...changes }) as ApprovalDeskLogbookRow;
const gateRowSaying = (details: unknown) => rowWith({ details: JSON.stringify(details) });

const fixtures: LogbookFixture[] = [];
function fixture(...args: Parameters<typeof makeLogbookFixture>): LogbookFixture {
  const made = makeLogbookFixture(...args);
  fixtures.push(made);
  return made;
}

afterEach(() => {
  for (const made of fixtures.splice(0)) {
    chmodSync(made.folder, 0o755);
    made.remove();
  }
});

describe("approval-desk's logbook rows as feed lines", () => {
  it("turns every kind and every gate outcome into a line the checker accepts", () => {
    const lines = inventedRows.map((row) => lineOf(translateApprovalDeskRow(row)));

    expect(lines.map((line) => [line.id, line.step, line.status, line.what])).toEqual([
      ["1", "gate_decision", "working", "The gate allowed a $18.00 refund"],
      ["2", "refund_done", "done", "Paid $18.00 back"],
      ["3", "gate_decision", "blocked", "The gate blocked this"],
      ["4", "gate_decision", "done", "No refund was asked for, so nothing was paid"],
      ["5", "gate_decision", "needs_human", "The gate sent a $340.00 refund to a person"],
      ["6", "gate_decision", "needs_human", "The agent gave no answer, so the gate sent this to a person"],
      ["7", "human_decision", "working", "The owner approved a $340.00 refund"],
      ["8", "refund_done", "done", "Paid $340.00 back"],
      ["9", "gate_decision", "needs_human", "The agent wasn't sure, so the gate sent this to a person"],
      ["10", "human_decision", "blocked", "The owner rejected the refund"],
      ["11", "gate_decision", "working", "The gate allowed a $24.00 refund"],
      ["12", "refund_refused", "blocked", "The refund was refused, so nothing was paid"],
      ["13", "gate_decision", "needs_human", "The gate sent a $95.00 refund to a person"],
      ["14", "gate_decision", "working", "The gate allowed a $12.00 refund"],
    ]);
    for (const line of lines) expect(checkFeedLine(line)).toEqual({ ok: true, line });
  });

  it("fills in the project and the agent, which the logbook doesn't name", () => {
    for (const row of inventedRows) {
      expect(lineOf(translateApprovalDeskRow(row))).toMatchObject({
        project: APPROVAL_DESK_PROJECT,
        agent: APPROVAL_DESK_AGENT,
      });
    }
    expect(
      lineOf(translateApprovalDeskRow(aGoodRow, { project: "another-desk", agent: "another-agent" })),
    ).toMatchObject({ project: "another-desk", agent: "another-agent" });
  });

  it("H10: every line is marked real, never demo", () => {
    for (const row of inventedRows) expect(lineOf(translateApprovalDeskRow(row)).demo).toBe(false);
  });

  it("keeps each row's own time, request, number and details, and points at the same earlier line", () => {
    const approval = lineOf(translateApprovalDeskRow(inventedRows[6]));

    expect(approval).toMatchObject({
      request: "REQ-904",
      when: timeOn("14:10:00"),
      id: "7",
      refers_to: "5",
      details: { decision: "approve", orderId: "ORD-904", amountCents: 34000 },
    });
    expect(lineOf(translateApprovalDeskRow(inventedRows[0]))).not.toHaveProperty("refers_to");
  });

  it("gives a line that waits for the owner its two choices, and no other line any", () => {
    for (const row of inventedRows) {
      const line = lineOf(translateApprovalDeskRow(row));
      if (line.status === "needs_human") expect(line.choices).toEqual(STAGE_1_CHOICES);
      else expect(line).not.toHaveProperty("choices");
    }
  });

  it("only names an amount the row really holds as whole cents", () => {
    const sentWith = (amountCents: unknown) =>
      lineOf(
        translateApprovalDeskRow(
          gateRowSaying(
            gateSaid("send_to_human", {
              status: "answered",
              form: { action: "refund", orderId: "ORD-950", amountCents },
            }),
          ),
        ),
      ).what;

    expect(sentWith(123456)).toBe("The gate sent a $1,234.56 refund to a person");
    for (const notAnAmount of ["340", 12.5, -100, 0, null]) {
      expect(sentWith(notAnAmount)).toBe("The gate sent this to a person");
    }
  });

  describe("H8: a row that doesn't say enough is refused in plain words, never guessed", () => {
    const refusals: [string, ApprovalDeskLogbookRow, RegExp][] = [
      ["a kind the hub doesn't know", rowWith({ kind: "refund_reversed" }), /doesn't know what a "refund_reversed" line/],
      ["no kind at all", rowWith({ kind: null }), /doesn't say what kind of line/],
      ["a gate line without the gate's decision", gateRowSaying({ output: { status: "ai_down" } }), /doesn't say what the gate decided/],
      ["a gate outcome the hub doesn't know", gateRowSaying(gateSaid("escalate", { status: "ai_down" })), /doesn't say what the gate decided/],
      [
        "a gate line shaped like the invented sample, not like the real logbook",
        gateRowSaying({ outcome: "allow", amount: 20 }),
        /doesn't say what the gate decided/,
      ],
      [
        "a person's decision that is neither approve nor reject",
        rowWith({ kind: "human_decision", details: JSON.stringify({ decision: "maybe" }) }),
        /doesn't say what the person decided/,
      ],
      ["details that aren't readable", rowWith({ details: "{not json" }), /details can't be read/],
      ["details that aren't text", rowWith({ details: 7 }), /details can't be read/],
      ["no line number", rowWith({ id: null }), /no line number/],
      ["a line number that isn't a whole number", rowWith({ id: "5" }), /no line number/],
      ["a pointer that isn't a line number", rowWith({ refers_to: "the one before" }), /points at an earlier line/],
      ["a missing pointer column", rowWith({ refers_to: undefined }), /points at an earlier line/],
      ["a time the hub can't read", rowWith({ logged_at: "5 October, just after two" }), /isn't written in a way the hub can read/],
      ["a time without a time zone", rowWith({ logged_at: "2026-10-05T14:03:00" }), /isn't written in a way the hub can read/],
      ["no time", rowWith({ logged_at: null }), /time/],
      ["an empty request name", rowWith({ request_id: "" }), /request name is empty/],
      ["a line that points at itself", rowWith({ refers_to: aGoodRow.id }), /about itself/],
    ];

    for (const [name, row, reason] of refusals) {
      it(name, () => {
        const reasons = reasonsOf(translateApprovalDeskRow(row));
        expect(reasons.join(" ")).toMatch(reason);
        // H12: plain words only, no rule codes.
        for (const said of reasons) expect(said).not.toMatch(/\b[HRQ]\d+\b/);
      });
    }
  });

  it("H9: a row that is refused never stops the rows around it", () => {
    const rows = [inventedRows[4], rowWith({ id: 6, kind: "refund_reversed" }), rowWith({ id: null }), inventedRows[6]];
    const feed = translateApprovalDeskRows(rows);

    expect(feed.lines.map((line) => line.id)).toEqual(["5", "7"]);
    expect(feed.refused.map((refused) => refused.row)).toEqual([6, null]);
    expect(feed.refused[0].problems[0].reason).toMatch(/doesn't know what a "refund_reversed" line/);
    expect(feed.newestRow).toBe(7);
  });

  it("has nothing to say about a logbook with no rows", () => {
    expect(translateApprovalDeskRows([])).toEqual({ lines: [], refused: [], newestRow: null });
  });
});

describe("reading approval-desk's logbook from its database", () => {
  it("reads the last ten entries, oldest first", () => {
    const { databasePath } = fixture();
    const feed = readApprovalDeskFeed(databasePath);

    expect(NEWEST_ENTRIES_READ).toBe(10);
    expect(feed.lines.map((line) => line.id)).toEqual(["5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
    expect(feed.lines).toEqual(inventedRows.slice(4).map((row) => lineOf(translateApprovalDeskRow(row))));
    expect(feed.refused).toEqual([]);
    expect(feed.newestRow).toBe(14);
  });

  it("reads all of a logbook shorter than ten entries, and nothing from an empty one", () => {
    expect(readApprovalDeskFeed(fixture(INVENTED_ENTRIES.slice(0, 3)).databasePath).lines.map((line) => line.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(readApprovalDeskFeed(fixture([]).databasePath)).toEqual({ lines: [], refused: [], newestRow: null });
  });

  it("reads only what came after a row, however much that is", () => {
    const made = fixture();
    expect(readApprovalDeskFeed(made.databasePath, { afterRow: 14 }).lines).toEqual([]);

    made.add(INVENTED_ENTRIES.slice(0, 12));
    const later = readApprovalDeskFeed(made.databasePath, { afterRow: 14 });
    expect(later.lines.map((line) => line.id)).toEqual(Array.from({ length: 12 }, (_, index) => String(15 + index)));
    expect(later.newestRow).toBe(26);
  });

  it("hands over the rows as the database holds them", () => {
    const logbook = openApprovalDeskLogbook(fixture().databasePath);
    try {
      expect(readLogbookRows(logbook, { limit: 2 }).map((row) => ({ ...row }))).toEqual(inventedRows.slice(12));
    } finally {
      logbook.close();
    }
  });

  it("H9: says so in plain words when the logbook can't be opened or read", () => {
    const { folder } = fixture();
    const noLogbook = join(folder, "no-logbook.db");
    new DatabaseSync(noLogbook).close();

    expect(() => readApprovalDeskFeed(join(folder, "not-there.db"))).toThrow(ApprovalDeskLogbookError);
    expect(() => readApprovalDeskFeed(join(folder, "not-there.db"))).toThrow("The hub couldn't open approval-desk's logbook.");
    expect(() => readApprovalDeskFeed(noLogbook)).toThrow("The hub couldn't read approval-desk's logbook.");
  });
});

describe("H3: the translator never writes to approval-desk", () => {
  const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const snapshotOf = ({ folder, databasePath }: LogbookFixture) => ({
    files: readdirSync(folder).sort(),
    bytes: sha256(databasePath),
    changedAt: statSync(databasePath).mtimeMs,
  });

  it("H3: reading leaves the database byte for byte as it was, and makes no file next to it", () => {
    const made = fixture();
    const before = snapshotOf(made);

    readApprovalDeskFeed(made.databasePath);
    readApprovalDeskFeed(made.databasePath, { afterRow: 3 });
    const logbook = openApprovalDeskLogbook(made.databasePath);
    readLogbookRows(logbook);
    expect(readdirSync(made.folder).sort()).toEqual(before.files);
    logbook.close();

    expect(snapshotOf(made)).toEqual(before);
    expect(before.files).toEqual(["invented-desk.db"]);
  });

  it("H3: every kind of write through the translator's connection fails", () => {
    const made = fixture();
    const before = snapshotOf(made);
    const logbook = openApprovalDeskLogbook(made.databasePath);
    const writes = [
      "INSERT INTO logbook (logged_at, kind, request_id, details) VALUES ('2026-10-05T15:00:00Z', 'gate_decision', 'REQ-999', '{}')",
      "UPDATE logbook SET kind = 'refund_done' WHERE id = 1",
      "DELETE FROM logbook WHERE id = 1",
      "DROP TABLE logbook",
      "DROP TRIGGER logbook_no_update",
      "CREATE TABLE left_behind (note TEXT)",
      "VACUUM",
    ];
    try {
      for (const write of writes) expect(() => logbook.exec(write), write).toThrow(/readonly|read-only/i);
      // Even with its own refusal switched off, the file was opened read-only.
      logbook.exec("PRAGMA query_only = OFF");
      for (const write of writes) expect(() => logbook.exec(write), write).toThrow(/readonly|read-only/i);
      expect(readLogbookRows(logbook, { limit: 100 })).toHaveLength(INVENTED_ENTRIES.length);
    } finally {
      logbook.close();
    }
    expect(snapshotOf(made)).toEqual(before);
  });

  it("H3: reads a database it has no permission to change, in a folder it can't add files to", () => {
    const made = fixture();
    chmodSync(made.databasePath, 0o444);
    chmodSync(made.folder, 0o555);

    expect(readApprovalDeskFeed(made.databasePath).lines).toHaveLength(NEWEST_ENTRIES_READ);
  });

  it("H3: a database that isn't there is not created", () => {
    const { folder } = fixture();
    const missing = join(folder, "not-there.db");

    expect(() => openApprovalDeskLogbook(missing)).toThrow(ApprovalDeskLogbookError);
    expect(existsSync(missing)).toBe(false);
    expect(readdirSync(folder)).toEqual(["invented-desk.db"]);
  });

  it("H3: a database that any reader would add side files to is left alone", () => {
    const made = fixture();
    const owner = new DatabaseSync(made.databasePath);
    owner.exec("PRAGMA journal_mode = WAL");
    owner.close();
    const before = snapshotOf(made);

    expect(() => readApprovalDeskFeed(made.databasePath)).toThrow("The hub couldn't open approval-desk's logbook.");
    expect(snapshotOf(made)).toEqual(before);
    expect(before.files).toEqual(["invented-desk.db"]);
  });

  it("H3: reads while approval-desk itself is writing, and never gets in its way", () => {
    const made = fixture();
    const owner = new DatabaseSync(made.databasePath);
    try {
      const logbook = openApprovalDeskLogbook(made.databasePath);
      expect(readLogbookRows(logbook)).toHaveLength(NEWEST_ENTRIES_READ);
      owner.exec(
        "INSERT INTO logbook (logged_at, kind, request_id, details) VALUES ('2026-10-05T15:00:00Z', 'gate_decision', 'REQ-910', '{}')",
      );
      expect(readLogbookRows(logbook, { afterRow: 14 })).toHaveLength(1);
      logbook.close();
    } finally {
      owner.close();
    }
  });
});
