import { describe, expect, it } from "vitest";
import {
  STAGE_1_CHOICES,
  checkFeedLine,
  translateSampleLogbookRow,
  type FeedLine,
  type SampleLogbookRow,
  type SampleLogbookSource,
} from "../../lib/feed";

const inventedSource: SampleLogbookSource = {
  project: "approval-desk",
  agent: "refund-agent",
  demo: true,
};

const inventedRows: SampleLogbookRow[] = [
  {
    id: 40,
    logged_at: "2026-10-05T14:01:00Z",
    kind: "gate_decision",
    request_id: "REQ-013",
    refers_to: null,
    details: { outcome: "allow", amount: 20 },
  },
  {
    id: 41,
    logged_at: "2026-10-05T14:01:05Z",
    kind: "refund_done",
    request_id: "REQ-013",
    refers_to: 40,
    details: { amount: 20 },
  },
  {
    id: 42,
    logged_at: "2026-10-05T14:03:11Z",
    kind: "gate_decision",
    request_id: "REQ-014",
    refers_to: null,
    details: { outcome: "send_to_human", amount: 250 },
  },
  {
    id: 43,
    logged_at: "2026-10-05T14:20:00Z",
    kind: "human_decision",
    request_id: "REQ-014",
    refers_to: 42,
    details: { decision: "approve" },
  },
  {
    id: 44,
    logged_at: "2026-10-05T14:20:02Z",
    kind: "refund_done",
    request_id: "REQ-014",
    refers_to: 43,
    details: { amount: 250 },
  },
  {
    id: 45,
    logged_at: "2026-10-05T14:30:00Z",
    kind: "gate_decision",
    request_id: "REQ-015",
    refers_to: null,
    details: { outcome: "block", amount: 9000 },
  },
  {
    id: 46,
    logged_at: "2026-10-05T14:40:00Z",
    kind: "gate_decision",
    request_id: "REQ-016",
    refers_to: null,
    details: { outcome: "send_to_human", amount: 400 },
  },
  {
    id: 47,
    logged_at: "2026-10-05T14:55:00Z",
    kind: "human_decision",
    request_id: "REQ-016",
    refers_to: 46,
    details: { decision: "reject", note: "No receipt" },
  },
  {
    id: 48,
    logged_at: "2026-10-05T14:55:01Z",
    kind: "refund_refused",
    request_id: "REQ-016",
    refers_to: 47,
    details: null,
  },
];

function translated(row: SampleLogbookRow): FeedLine {
  const result = translateSampleLogbookRow(row, inventedSource);
  if (!result.ok) {
    throw new Error(result.problems.map((problem) => problem.reason).join(" "));
  }
  return result.line;
}

describe("sample translator: invented rows shaped like approval-desk's logbook", () => {
  it("covers all four kinds of logbook line", () => {
    expect(new Set(inventedRows.map((row) => row.kind))).toEqual(
      new Set(["gate_decision", "human_decision", "refund_done", "refund_refused"]),
    );
  });

  it("H8: every invented row becomes a line the checker accepts", () => {
    for (const row of inventedRows) {
      const line = translated(row);
      expect(checkFeedLine(line)).toEqual({ ok: true, line });
    }
  });

  it("turns a whole row into a whole feed line", () => {
    expect(translated(inventedRows[2])).toEqual({
      project: "approval-desk",
      agent: "refund-agent",
      request: "REQ-014",
      step: "gate_decision",
      what: "The gate sent this to a person",
      status: "needs_human",
      when: "2026-10-05T14:03:11Z",
      id: "42",
      choices: [
        { id: "approve", label: "Approve" },
        { id: "reject", label: "Reject" },
      ],
      details: { outcome: "send_to_human", amount: 250 },
      demo: true,
    });
  });

  it("maps each kind to the status the village reacts to", () => {
    expect(inventedRows.map((row) => [row.id, translated(row).status])).toEqual([
      [40, "working"],
      [41, "done"],
      [42, "needs_human"],
      [43, "working"],
      [44, "done"],
      [45, "blocked"],
      [46, "needs_human"],
      [47, "working"],
      [48, "blocked"],
    ]);
  });

  it("keeps the logbook's own numbers, request names, times and details", () => {
    for (const row of inventedRows) {
      const line = translated(row);
      expect(line.id).toBe(String(row.id));
      expect(line.request).toBe(row.request_id);
      expect(line.when).toBe(row.logged_at);
      expect(line.step).toBe(row.kind);
      expect(line.details).toEqual(row.details);
      expect(line.refers_to).toBe(
        row.refers_to === null ? undefined : String(row.refers_to),
      );
    }
  });

  it("fills in what the logbook doesn't say: project, agent and a plain sentence", () => {
    for (const row of inventedRows) {
      const line = translated(row);
      expect(line.project).toBe("approval-desk");
      expect(line.agent).toBe("refund-agent");
      expect(line.what).toMatch(/^[A-Z][a-z ]+$/);
    }
  });

  it("offers the owner's choices only on lines that wait for the owner", () => {
    for (const row of inventedRows) {
      const line = translated(row);
      expect(line.choices).toEqual(
        line.status === "needs_human" ? STAGE_1_CHOICES : undefined,
      );
    }
  });

  it("H10: invented rows are marked demo on every line", () => {
    expect(inventedRows.map((row) => translated(row).demo)).toEqual(
      inventedRows.map(() => true),
    );
  });

  it("H8: a kind the translator doesn't know is refused, not guessed", () => {
    const row = { ...inventedRows[0], kind: "refund_paused" };
    expect(translateSampleLogbookRow(row, inventedSource)).toEqual({
      ok: false,
      problems: [
        {
          field: "step",
          reason: 'The hub doesn\'t know what a "refund_paused" line in this logbook means.',
        },
      ],
    });
  });

  it.each([
    ["an outcome it doesn't know", { outcome: "maybe" }],
    ["no outcome", { amount: 20 }],
    ["no details", null],
  ])("H8: a gate line with %s is refused, not guessed", (_kind, details) => {
    const row = { ...inventedRows[0], details };
    expect(translateSampleLogbookRow(row, inventedSource)).toEqual({
      ok: false,
      problems: [
        {
          field: "status",
          reason:
            "This gate line doesn't say what the gate decided: allow, block, or send to a person.",
        },
      ],
    });
  });

  it("H8: a row with a time the feed can't carry is refused by the checker", () => {
    const row = { ...inventedRows[0], logged_at: "2026-10-05 14:01:00" };
    const result = translateSampleLogbookRow(row, inventedSource);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((problem) => problem.field)).toEqual(["when"]);
  });
});
