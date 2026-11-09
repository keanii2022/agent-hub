import { checkFeedLine, type FeedCheckResult, type FeedProblem } from "./checker";
import { STAGE_1_CHOICES, type FeedStatus, type JsonValue } from "./format";

// Shaped like approval-desk's logbook as ARCHITECTURE.md describes it. The rows
// fed through here are invented: the real logbook is only read in Stage 2.
export type SampleLogbookRow = {
  id: number;
  logged_at: string;
  kind: string;
  request_id: string;
  refers_to: number | null;
  details: JsonValue;
};

export type SampleLogbookSource = {
  project: string;
  agent: string;
  demo: boolean;
};

type Meaning = {
  what: string;
  status: FeedStatus;
};

const GATE_KIND = "gate_decision";

const MEANING_OF_GATE_OUTCOME = new Map<string, Meaning>([
  ["send_to_human", { what: "The gate sent this to a person", status: "needs_human" }],
  ["block", { what: "The gate blocked this", status: "blocked" }],
  ["allow", { what: "The gate allowed this", status: "working" }],
]);

const MEANING_OF_KIND = new Map<string, Meaning>([
  ["human_decision", { what: "The owner made a decision", status: "working" }],
  ["refund_done", { what: "The refund was paid", status: "done" }],
  ["refund_refused", { what: "The refund was refused", status: "blocked" }],
]);

export function translateSampleLogbookRow(
  row: SampleLogbookRow,
  source: SampleLogbookSource,
): FeedCheckResult {
  const meaning = readMeaning(row);
  if ("reason" in meaning) return { ok: false, problems: [meaning] };

  return checkFeedLine({
    project: source.project,
    agent: source.agent,
    request: row.request_id,
    step: row.kind,
    what: meaning.what,
    status: meaning.status,
    when: row.logged_at,
    id: String(row.id),
    ...(row.refers_to !== null && { refers_to: String(row.refers_to) }),
    ...(meaning.status === "needs_human" && { choices: STAGE_1_CHOICES }),
    details: row.details,
    demo: source.demo,
  });
}

function readMeaning(row: SampleLogbookRow): Meaning | FeedProblem {
  if (row.kind === GATE_KIND) {
    const outcome = readGateOutcome(row.details);
    const meaning =
      outcome === undefined ? undefined : MEANING_OF_GATE_OUTCOME.get(outcome);
    return (
      meaning ?? {
        field: "status",
        reason:
          "This gate line doesn't say what the gate decided: allow, block, or send to a person.",
      }
    );
  }
  return (
    MEANING_OF_KIND.get(row.kind) ?? {
      field: "step",
      reason: `The hub doesn't know what a "${row.kind}" line in this logbook means.`,
    }
  );
}

function readGateOutcome(details: JsonValue): string | undefined {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return undefined;
  }
  return typeof details.outcome === "string" ? details.outcome : undefined;
}
