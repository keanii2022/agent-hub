import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore } from "../../lib/store";

const askLine = {
  project: "approval-desk",
  agent: "refund-agent",
  request: "REQ-014",
  step: "gate_decision",
  what: "Over the limit, sent to a person",
  status: "needs_human",
  when: "2026-10-05T14:03:12Z",
  id: "41",
  choices: [
    { id: "approve", label: "Approve" },
    { id: "reject", label: "Reject" },
  ],
  details: { amount: 250 },
  demo: true,
};
const askedAgain = { ...askLine, id: "45", when: "2026-10-05T14:09:00Z" };
const otherAsk = { ...askLine, request: "REQ-015", id: "50" };
const resultLine = {
  project: "approval-desk",
  agent: "refund-agent",
  request: "REQ-016",
  step: "report",
  what: "The weekly refund report is ready",
  status: "result_ready",
  when: "2026-10-05T14:04:00Z",
  id: "60",
  demo: true,
};

const decidedAt = new Date("2026-10-05T14:10:00Z");

const openStores: HubStore[] = [];
const openRaw: DatabaseSync[] = [];
const folders: string[] = [];

afterEach(() => {
  for (const raw of openRaw.splice(0)) raw.close();
  for (const store of openStores.splice(0)) store.close();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function storeWithAnswers() {
  const folder = mkdtempSync(join(tmpdir(), "decisions-record-test-"));
  folders.push(folder);
  const databasePath = join(folder, "hub.sqlite");
  const store = openHubStore(databasePath);
  openStores.push(store);
  store.addLines([askLine, askedAgain, otherAsk, resultLine]);
  const written = store.recordDecision({
    project: "approval-desk",
    askLineId: "41",
    choice: "reject",
    note: "Too late.",
    decidedAt,
  });
  if (!written.recorded) throw new Error("expected the first decision to be written");
  store.recordDoorAnswer(written.decision.seq, { answer: "accepted", reason: null, answeredAt: decidedAt });
  store.markResultSeen("approval-desk", "60", decidedAt);
  const raw = new DatabaseSync(databasePath);
  openRaw.push(raw);
  const rows = () => ({
    decisions: raw.prepare("SELECT * FROM decisions ORDER BY seq").all(),
    answers: raw.prepare("SELECT * FROM decision_answers ORDER BY decision_seq").all(),
    seen: raw.prepare("SELECT * FROM seen_results ORDER BY seq").all(),
  });
  return { store, raw, rows, before: rows() };
}

describe("the decisions record", () => {
  it("keeps a decision with the project's answer, and finds it again", () => {
    const { store } = storeWithAnswers();
    expect(store.findDecision("approval-desk", "41")).toMatchObject({
      choice: "reject",
      note: "Too late.",
      doorAnswer: { answer: "accepted", reason: null },
    });
    expect(store.findDecision("approval-desk", "50")).toBeNull();
    expect(store.readSeenResults()).toMatchObject([{ project: "approval-desk", resultLineId: "60" }]);
  });

  it("H6: a request gets one decision, even when it asks again with a new waiting line", () => {
    const { store, rows, before } = storeWithAnswers();
    const again = store.recordDecision({ project: "approval-desk", askLineId: "45", choice: "approve", note: null, decidedAt });
    expect(again).toMatchObject({ recorded: false, why: "already_decided", kept: { askLineId: "41", choice: "reject" } });
    expect(store.findDecision("approval-desk", "45")).toMatchObject({ askLineId: "41" });
    expect(rows()).toEqual(before);
  });

  it("H6: a second decision is refused by the database itself", () => {
    const { raw, rows, before } = storeWithAnswers();
    const insert = (lineId: string) => () =>
      raw.exec(
        `INSERT INTO decisions (project, ask_line_id, choice, note, decided_at)
         VALUES ('approval-desk', '${lineId}', 'approve', NULL, '2026-10-05T14:11:00.000Z')`,
      );
    expect(insert("41")).toThrow(/one decision/);
    expect(insert("45")).toThrow(/one decision/);
    expect(rows()).toEqual(before);
    expect(insert("50")).not.toThrow();
  });

  it("H7: the database refuses a reject without a note", () => {
    const { raw, rows, before } = storeWithAnswers();
    for (const note of ["NULL", "''", "'   '"]) {
      expect(() =>
        raw.exec(
          `INSERT INTO decisions (project, ask_line_id, choice, note, decided_at)
           VALUES ('approval-desk', '50', 'reject', ${note}, '2026-10-05T14:11:00.000Z')`,
        ),
      ).toThrow();
    }
    expect(rows()).toEqual(before);
  });

  it("H4: a decision, an answer and a seen mark cannot be changed", () => {
    const { raw, rows, before } = storeWithAnswers();
    expect(() => raw.exec("UPDATE decisions SET choice = 'approve'")).toThrow(/never changed/);
    expect(() => raw.exec("UPDATE decisions SET note = 'Something else' WHERE seq = 1")).toThrow(/never changed/);
    expect(() => raw.exec("UPDATE OR REPLACE decisions SET seq = 2 WHERE seq = 1")).toThrow(/never changed/);
    expect(() => raw.exec("UPDATE decision_answers SET answer = 'refused', reason = 'No'")).toThrow(/never changed/);
    expect(() => raw.exec("UPDATE seen_results SET seen_at = '2026-10-06T00:00:00.000Z'")).toThrow(/never changed/);
    expect(rows()).toEqual(before);
  });

  it("H4: a decision, an answer and a seen mark cannot be deleted", () => {
    const { raw, rows, before } = storeWithAnswers();
    expect(() => raw.exec("DELETE FROM decisions")).toThrow(/never deleted/);
    expect(() => raw.exec("DELETE FROM decision_answers")).toThrow(/never deleted/);
    expect(() => raw.exec("DELETE FROM seen_results WHERE seq = 1")).toThrow(/never deleted/);
    expect(rows()).toEqual(before);
  });

  it("H4: a decision, an answer and a seen mark cannot be overwritten, even with replaced rows firing delete triggers", () => {
    const { raw, rows, before } = storeWithAnswers();
    for (const recursive of [false, true]) {
      raw.exec(`PRAGMA recursive_triggers = ${recursive ? "ON" : "OFF"}`);
      expect(() =>
        raw.exec(
          `INSERT OR REPLACE INTO decisions (seq, project, ask_line_id, choice, note, decided_at)
           VALUES (1, 'approval-desk', '41', 'approve', NULL, '2026-10-05T14:11:00.000Z')`,
        ),
      ).toThrow();
      expect(() =>
        raw.exec(
          `REPLACE INTO decision_answers (decision_seq, answer, reason, answered_at)
           VALUES (1, 'refused', 'Changed my mind', '2026-10-05T14:11:00.000Z')`,
        ),
      ).toThrow();
      expect(() =>
        raw.exec(
          `INSERT OR REPLACE INTO seen_results (seq, project, result_line_id, seen_at)
           VALUES (1, 'approval-desk', '60', '2026-10-05T14:11:00.000Z')`,
        ),
      ).toThrow();
    }
    expect(rows()).toEqual(before);
  });

  it("a decision has to be about a waiting request, an answer about a decision, and a seen mark about a result", () => {
    const { raw, rows, before } = storeWithAnswers();
    expect(() =>
      raw.exec(
        `INSERT INTO decisions (project, ask_line_id, choice, note, decided_at)
         VALUES ('approval-desk', '60', 'approve', NULL, '2026-10-05T14:11:00.000Z')`,
      ),
    ).toThrow(/waiting request/);
    expect(() =>
      raw.exec(
        `INSERT INTO decision_answers (decision_seq, answer, reason, answered_at)
         VALUES (99, 'accepted', NULL, '2026-10-05T14:11:00.000Z')`,
      ),
    ).toThrow(/decision the record already holds/);
    expect(() =>
      raw.exec(
        `INSERT INTO seen_results (project, result_line_id, seen_at)
         VALUES ('approval-desk', '41', '2026-10-05T14:11:00.000Z')`,
      ),
    ).toThrow(/ready result/);
    expect(rows()).toEqual(before);
  });

  it("a decision gets one answer from its project, and a seen mark is kept once", () => {
    const { store, rows, before } = storeWithAnswers();
    const seq = store.findDecision("approval-desk", "41")!.seq;
    expect(() => store.recordDoorAnswer(seq, { answer: "refused", reason: "No", answeredAt: decidedAt })).toThrow();
    expect(store.markResultSeen("approval-desk", "60", decidedAt)).toMatchObject({ marked: false });
    expect(rows()).toEqual(before);
  });

  it("H5: a decision that can't be written throws, and nothing is kept", () => {
    const store = openHubStore(IN_MEMORY_DATABASE);
    openStores.push(store);
    store.addLines([askLine]);
    store.close();
    expect(() =>
      store.recordDecision({ project: "approval-desk", askLineId: "41", choice: "approve", note: null, decidedAt }),
    ).toThrow(/couldn't write the decision/);
    openStores.splice(openStores.indexOf(store), 1);
  });
});
