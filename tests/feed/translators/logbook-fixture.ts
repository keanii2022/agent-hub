import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ApprovalDeskLogbookRow } from "../../../lib/feed/translators/approval-desk";

// A logbook shaped like approval-desk's own, built in a temporary folder. The
// table and its add-only triggers match the real one; every request, order and
// amount in it is invented.

const LOGBOOK_SCHEMA = `
CREATE TABLE logbook (
  id INTEGER PRIMARY KEY AUTOINCREMENT CHECK (id > 0),
  logged_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  request_id TEXT NOT NULL,
  refers_to INTEGER REFERENCES logbook(id),
  details TEXT NOT NULL CHECK (json_valid(details))
);
CREATE TRIGGER logbook_no_update BEFORE UPDATE ON logbook
  BEGIN SELECT RAISE(ABORT, 'The logbook is add-only'); END;
CREATE TRIGGER logbook_no_delete BEFORE DELETE ON logbook
  BEGIN SELECT RAISE(ABORT, 'The logbook is add-only'); END;
CREATE TRIGGER logbook_no_overwrite BEFORE INSERT ON logbook
  WHEN EXISTS (SELECT 1 FROM logbook WHERE id = NEW.id)
  BEGIN SELECT RAISE(ABORT, 'The logbook is add-only'); END;
`;

export type InventedEntry = {
  /** Hours, minutes and seconds on the invented day, like "14:03:00". */
  at: string;
  kind: string;
  request: string;
  refersTo?: number;
  details: unknown;
};

export const INVENTED_DAY = "2026-10-05";
export const timeOn = (at: string, day: string = INVENTED_DAY) => `${day}T${at}Z`;

const refundForm = (orderId: string, amountCents: number) => ({
  action: "refund",
  orderId,
  amountCents,
  reason: "The parcel arrived damaged.",
  policyLine: "P01",
});

const answered = (form: unknown) => ({ status: "answered", form });

export const gateSaid = (result: string, output: unknown, rules: string[] = []) => ({
  output,
  decision: { result, rules },
});

const refundDone = (refundId: string, orderId: string, amountCents: number) => ({
  refundId,
  orderId,
  amountCents,
  refundedOn: INVENTED_DAY,
  reason: "The parcel arrived damaged.",
});

/**
 * Fourteen entries covering every kind and every gate outcome. The entries are
 * numbered 1 to 14 in this order, and the last ten are entries 5 to 14.
 */
export const INVENTED_ENTRIES: readonly InventedEntry[] = [
  { at: "14:00:00", kind: "gate_decision", request: "REQ-901", details: gateSaid("allow", answered(refundForm("ORD-901", 1800))) },
  { at: "14:00:00", kind: "refund_done", request: "REQ-901", refersTo: 1, details: refundDone("RF901", "ORD-901", 1800) },
  { at: "14:01:10", kind: "gate_decision", request: "REQ-902", details: gateSaid("block", answered({ action: "refund" }), ["R5"]) },
  {
    at: "14:02:00",
    kind: "gate_decision",
    request: "REQ-903",
    details: gateSaid("allow", answered({ ...refundForm("ORD-903", 1), action: "no_refund", amountCents: null })),
  },
  {
    at: "14:03:00",
    kind: "gate_decision",
    request: "REQ-904",
    details: gateSaid("send_to_human", answered(refundForm("ORD-904", 34000)), ["R2"]),
  },
  { at: "14:03:30", kind: "gate_decision", request: "REQ-905", details: gateSaid("send_to_human", { status: "ai_down" }, ["R6"]) },
  {
    at: "14:10:00",
    kind: "human_decision",
    request: "REQ-904",
    refersTo: 5,
    details: { decision: "approve", orderId: "ORD-904", amountCents: 34000 },
  },
  { at: "14:10:00", kind: "refund_done", request: "REQ-904", refersTo: 7, details: refundDone("RF902", "ORD-904", 34000) },
  {
    at: "14:11:00",
    kind: "gate_decision",
    request: "REQ-906",
    details: gateSaid("send_to_human", answered({ ...refundForm("ORD-906", 5000), action: "unsure" }), ["R6"]),
  },
  {
    at: "14:12:00",
    kind: "human_decision",
    request: "REQ-905",
    refersTo: 6,
    details: { decision: "reject", note: "Nothing here says which order this is about." },
  },
  { at: "14:13:00", kind: "gate_decision", request: "REQ-907", details: gateSaid("allow", answered(refundForm("ORD-907", 2400))) },
  { at: "14:13:00", kind: "refund_refused", request: "REQ-907", refersTo: 11, details: { because: "already_done" } },
  {
    at: "14:14:00",
    kind: "gate_decision",
    request: "REQ-908",
    details: gateSaid("send_to_human", answered(refundForm("ORD-908", 9500)), ["R3"]),
  },
  { at: "14:15:00", kind: "gate_decision", request: "REQ-909", details: gateSaid("allow", answered(refundForm("ORD-909", 1200))) },
];

/** The moment the newest invented entry was written. */
export const NEWEST_INVENTED_ENTRY_AT = new Date(timeOn("14:15:00"));

/** One invented entry as the row the database would hand over. */
export function rowOf(entry: InventedEntry, id: number, day: string = INVENTED_DAY): ApprovalDeskLogbookRow {
  return {
    id,
    logged_at: timeOn(entry.at, day),
    kind: entry.kind,
    request_id: entry.request,
    refers_to: entry.refersTo ?? null,
    details: JSON.stringify(entry.details),
  };
}

export type LogbookFixture = {
  folder: string;
  databasePath: string;
  /** Adds entries the way approval-desk itself would, through a connection of its own. */
  add(entries: readonly InventedEntry[], day?: string): void;
  remove(): void;
};

export function makeLogbookFixture(
  entries: readonly InventedEntry[] = INVENTED_ENTRIES,
  day: string = INVENTED_DAY,
): LogbookFixture {
  const folder = mkdtempSync(join(tmpdir(), "hub-logbook-"));
  const databasePath = join(folder, "invented-desk.db");

  function add(more: readonly InventedEntry[], onDay: string = day): void {
    const writer = new DatabaseSync(databasePath);
    try {
      const insert = writer.prepare(
        "INSERT INTO logbook (logged_at, kind, request_id, refers_to, details) VALUES (?, ?, ?, ?, ?)",
      );
      for (const entry of more) {
        insert.run(timeOn(entry.at, onDay), entry.kind, entry.request, entry.refersTo ?? null, JSON.stringify(entry.details));
      }
    } finally {
      writer.close();
    }
  }

  const creator = new DatabaseSync(databasePath);
  creator.exec(LOGBOOK_SCHEMA);
  creator.close();
  add(entries);

  return {
    folder,
    databasePath,
    add,
    remove: () => rmSync(folder, { recursive: true, force: true }),
  };
}
