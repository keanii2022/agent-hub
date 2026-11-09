import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALWAYS_NEEDED_FEED_FIELDS,
  FEED_FIELDS,
  FEED_STATUSES,
  checkFeedLine,
} from "../../lib/feed";

const architecture = readFileSync("ARCHITECTURE.md", "utf8");
const feedSection = architecture.slice(
  architecture.indexOf("## The feed"),
  architecture.indexOf("## What you see"),
);

function tableRowsAfter(heading: string): string[][] {
  const lines = feedSection.slice(feedSection.indexOf(heading)).split("\n");
  const firstTableLine = lines.findIndex((line) => line.startsWith("|"));
  const tableLines: string[] = [];
  for (const line of lines.slice(firstTableLine)) {
    if (!line.startsWith("|")) break;
    tableLines.push(line);
  }
  const withoutHeaderAndRuler = tableLines.slice(2);
  return withoutHeaderAndRuler.map((line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim()),
  );
}

function withoutBackticks(cell: string): string {
  return cell.replace(/^`|`$/g, "");
}

const fieldRows = tableRowsAfter("## The feed").map(
  ([field, _type, needed, _says, example]) => ({ field, needed, example }),
);
const statusRows = tableRowsAfter("**Status values**");

describe("the feed table in ARCHITECTURE.md matches the code", () => {
  it("lists the same fields, in the same order", () => {
    expect(fieldRows.map((row) => row.field)).toEqual([...FEED_FIELDS]);
  });

  it("marks the same fields as always needed", () => {
    expect(
      fieldRows.filter((row) => row.needed === "always").map((row) => row.field),
    ).toEqual([...ALWAYS_NEEDED_FEED_FIELDS]);
  });

  it("marks only the choices as belonging to waiting lines, and the rest as optional", () => {
    expect(
      fieldRows.filter((row) => row.needed !== "always").map((row) => [row.field, row.needed]),
    ).toEqual([
      ["refers_to", "optional"],
      ["choices", "waiting lines only"],
      ["urgent", "optional"],
      ["details", "optional"],
    ]);
  });

  it("H8: the examples in the table make a line the checker accepts", () => {
    const exampleLine = Object.fromEntries(
      fieldRows.map((row) => [row.field, JSON.parse(withoutBackticks(row.example))]),
    );
    expect(checkFeedLine(exampleLine)).toEqual({ ok: true, line: exampleLine });
  });

  it("lists the same status values, in the same order", () => {
    expect(statusRows.map(([status]) => withoutBackticks(status))).toEqual([
      ...FEED_STATUSES,
    ]);
  });

  it("H8: the choices example is accepted on a waiting line and refused on every other line", () => {
    const choicesRow = fieldRows.find((row) => row.field === "choices");
    const exampleChoices = JSON.parse(withoutBackticks(choicesRow?.example ?? ""));
    const lineWith = (status: string, choices?: unknown) => ({
      project: "approval-desk",
      agent: "refund-agent",
      request: "REQ-014",
      step: "gate_decision",
      what: "Over the limit, sent to a person",
      status,
      when: "2026-10-05T14:03:11Z",
      id: "41",
      ...(choices !== undefined && { choices }),
      demo: true,
    });

    expect(checkFeedLine(lineWith("needs_human", exampleChoices)).ok).toBe(true);
    expect(checkFeedLine(lineWith("needs_human")).ok).toBe(false);
    for (const status of FEED_STATUSES.filter((known) => known !== "needs_human")) {
      expect(checkFeedLine(lineWith(status)).ok).toBe(true);
      expect(checkFeedLine(lineWith(status, exampleChoices)).ok).toBe(false);
    }
  });
});
