import { describe, expect, it } from "vitest";
import {
  FINISH_STATUSES,
  inOrderHappened,
  openRequestsFrom,
  readyResultsFrom,
  type FeedLine,
} from "../../lib/feed";
import { approvalDeskScript, teamHouseScript } from "../../lib/demo/scripts";
import { A_MOMENT_IN_THE_DEMO, dayStartOf, oneDayOf } from "../demo/helpers";
import { feedLine } from "./lines";

const whatIsOpen = (lines: readonly FeedLine[]): string[] => openRequestsFrom(lines).map((line) => line.id);
const whatIsReady = (lines: readonly FeedLine[]): string[] => readyResultsFrom(lines).map((line) => line.id);

describe("which requests are waiting for the owner", () => {
  it("Q3: a needs_human line opens a request", () => {
    const asked = feedLine({ at: "01:00", status: "needs_human", id: "ask" });
    expect(openRequestsFrom([feedLine({ at: "00:30" }), asked])).toEqual([asked]);
    expect(openRequestsFrom([feedLine({ at: "00:30" })])).toEqual([]);
    expect(openRequestsFrom([])).toEqual([]);
  });

  it("Q3: a later line that points at the needs_human line is a decision, and closes it", () => {
    const lines = [
      feedLine({ at: "01:00", status: "needs_human", id: "ask" }),
      feedLine({ at: "02:00", step: "decision", refers_to: "ask" }),
    ];
    expect(whatIsOpen(lines)).toEqual([]);
  });

  it.each(FINISH_STATUSES)("Q3: a later %s line of the same request is a finish, and closes it", (finish) => {
    const lines = [
      feedLine({ at: "01:00", status: "needs_human", id: "ask" }),
      feedLine({ at: "02:00", status: finish }),
    ];
    expect(whatIsOpen(lines)).toEqual([]);
  });

  it("Q3: a later line that is neither a decision nor a finish leaves it open", () => {
    const lines = [
      feedLine({ at: "00:30", id: "start" }),
      feedLine({ at: "01:00", status: "needs_human", id: "ask" }),
      feedLine({ at: "02:00", status: "working" }),
      feedLine({ at: "03:00", status: "result_ready" }),
      feedLine({ at: "04:00", status: "working", refers_to: "start" }),
    ];
    expect(whatIsOpen(lines)).toEqual(["ask"]);
  });

  it("Q3: only a line of the same request in the same project closes it", () => {
    const lines = [
      feedLine({ at: "01:00", status: "needs_human", id: "ask" }),
      feedLine({ at: "02:00", status: "done", request: "TASK-2" }),
      feedLine({ at: "03:00", status: "done", project: "orchard" }),
      feedLine({ at: "04:00", project: "orchard", refers_to: "ask" }),
    ];
    expect(whatIsOpen(lines)).toEqual(["ask"]);
  });

  it("Q3: a finish from before the needs_human line doesn't close it", () => {
    const lines = [
      feedLine({ at: "01:00", status: "needs_human", id: "ask" }),
      feedLine({ at: "00:30", status: "blocked" }),
    ];
    expect(whatIsOpen(lines)).toEqual(["ask"]);
  });

  it("Q3: when a request asks again, the newest needs_human line is the open one", () => {
    const lines = [
      feedLine({ at: "01:00", status: "needs_human", id: "first ask" }),
      feedLine({ at: "02:00", status: "needs_human", id: "second ask" }),
    ];
    expect(whatIsOpen(lines)).toEqual(["second ask"]);

    const answeredTheOldOne = [...lines, feedLine({ at: "03:00", refers_to: "first ask" })];
    expect(whatIsOpen(answeredTheOldOne)).toEqual(["second ask"]);

    const answeredTheNewOne = [...lines, feedLine({ at: "03:00", refers_to: "second ask" })];
    expect(whatIsOpen(answeredTheNewOne)).toEqual([]);
  });

  it("Q3: a request that was closed can open again", () => {
    const lines = [
      feedLine({ at: "01:00", status: "needs_human", id: "first ask" }),
      feedLine({ at: "02:00", refers_to: "first ask" }),
      feedLine({ at: "03:00", status: "needs_human", id: "second ask" }),
    ];
    expect(whatIsOpen(lines)).toEqual(["second ask"]);
  });

  it("lists the longest-waiting request first, whatever order the lines come in", () => {
    const lines = [
      feedLine({ at: "05:00", status: "needs_human", id: "newest", request: "TASK-3" }),
      feedLine({ at: "01:00", status: "needs_human", id: "oldest", request: "TASK-1" }),
      feedLine({ at: "03:00", status: "needs_human", id: "middle", project: "orchard" }),
    ];
    expect(whatIsOpen(lines)).toEqual(["oldest", "middle", "newest"]);
    expect(whatIsOpen([...lines].reverse())).toEqual(["oldest", "middle", "newest"]);
  });

  it("changes nothing in the lines it is handed", () => {
    const lines = [
      feedLine({ at: "02:00", status: "done" }),
      feedLine({ at: "01:00", status: "needs_human", id: "ask" }),
    ];
    const before = structuredClone(lines);
    openRequestsFrom(lines);
    readyResultsFrom(lines);
    expect(lines).toEqual(before);
  });

  it("Q3: every scripted day closes every request it opens", () => {
    for (const script of [approvalDeskScript, teamHouseScript]) {
      const day = oneDayOf(script);
      expect(day.some((line) => line.status === "needs_human"), script.project).toBe(true);
      expect(openRequestsFrom(day), script.project).toEqual([]);
    }
  });

  it("Q3: part of the way through a scripted day, the requests asked and not yet answered are open", () => {
    const day = oneDayOf(approvalDeskScript, A_MOMENT_IN_THE_DEMO);
    const dayStarts = dayStartOf(approvalDeskScript, A_MOMENT_IN_THE_DEMO).getTime();
    const upTo = (minutes: number, seconds: number): FeedLine[] =>
      day.filter((line) => Date.parse(line.when) <= dayStarts + (minutes * 60 + seconds) * 1000);
    const amounts = (lines: FeedLine[]): unknown[] =>
      openRequestsFrom(lines).map((line) => (line.details as { amount: number }).amount);

    expect(amounts(upTo(2, 24))).toEqual([]);
    expect(amounts(upTo(2, 25))).toEqual([340]);
    expect(amounts(upTo(9, 29))).toEqual([340, 410, 95]);
    expect(amounts(upTo(9, 30))).toEqual([410, 95]);
    expect(amounts(upTo(13, 10))).toEqual([410, 275]);
  });
});

describe("which results are ready for the owner's eyes", () => {
  it("a result_ready line is ready while it is the newest line of its request", () => {
    const result = feedLine({ at: "02:00", status: "result_ready", id: "report" });
    expect(readyResultsFrom([feedLine({ at: "01:00" }), result])).toEqual([result]);
  });

  it("anything later on the same request means it has moved on", () => {
    const lines = [
      feedLine({ at: "02:00", status: "result_ready", id: "report" }),
      feedLine({ at: "03:00", status: "working" }),
    ];
    expect(whatIsReady(lines)).toEqual([]);
    expect(whatIsReady([...lines, feedLine({ at: "04:00", status: "result_ready", id: "second report" })])).toEqual([
      "second report",
    ]);
  });

  it("a line of another request or another project leaves it ready", () => {
    const lines = [
      feedLine({ at: "02:00", status: "result_ready", id: "report" }),
      feedLine({ at: "03:00", status: "done", request: "TASK-2" }),
      feedLine({ at: "04:00", status: "done", project: "orchard" }),
    ];
    expect(whatIsReady(lines)).toEqual(["report"]);
  });

  it("lists the oldest result first, whatever order the lines come in", () => {
    const lines = [
      feedLine({ at: "05:00", status: "result_ready", id: "newest", request: "TASK-3" }),
      feedLine({ at: "01:00", status: "result_ready", id: "oldest", request: "TASK-1" }),
    ];
    expect(whatIsReady(lines)).toEqual(["oldest", "newest"]);
  });
});

describe("putting lines in the order they happened", () => {
  it("goes by each line's own time, and keeps lines of the same moment in the order given", () => {
    const lines = [
      feedLine({ at: "02:00", id: "c" }),
      feedLine({ at: "01:00", id: "a" }),
      feedLine({ at: "02:00", id: "d" }),
      feedLine({ at: "01:30", id: "b" }),
    ];
    expect(inOrderHappened(lines).map((line) => line.id)).toEqual(["a", "b", "c", "d"]);
  });
});
