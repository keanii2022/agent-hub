import { describe, expect, it } from "vitest";
import {
  DESK_ORDER_IN_WORDS,
  choicesInWords,
  deskItemsFrom,
  housesWithNoNews,
  kindInWords,
  waitedInWords,
} from "../../lib/desk";
import { waitingPapersOf } from "../../lib/village/delivery";
import { villageStateAt, type VillageProject, type VillageState } from "../../lib/village/state";
import { feedLine, momentAt } from "../feed/lines";

const projects: VillageProject[] = [
  { project: "garden", data: "demo" },
  { project: "bakery", data: "demo" },
  { project: "ledger", data: "real" },
];

const NOW = momentAt("10:00");

function villageWith(lines: Parameters<typeof villageStateAt>[0]["lines"], unreadable: string[] = []): VillageState {
  return villageStateAt({ projects, lines, unreadable, now: NOW });
}

const threeHouses = (): VillageState =>
  villageWith([
    feedLine({ at: "02:00", project: "garden", agent: "helper", request: "TASK-1", status: "needs_human", what: "Buy more seeds?", id: "garden-ask" }),
    feedLine({ at: "01:00", project: "garden", agent: "digger", request: "TASK-2", status: "result_ready", what: "The beds are dug", id: "garden-result" }),
    feedLine({ at: "06:00", project: "bakery", agent: "baker", request: "ORDER-7", status: "needs_human", what: "Bake a second batch?", id: "bakery-ask" }),
    feedLine({ at: "09:00", project: "ledger", agent: "clerk", request: "BILL-3", status: "needs_human", what: "Pay the flour bill today?", id: "ledger-ask", urgent: true, demo: false }),
    feedLine({ at: "09:30", project: "ledger", agent: "clerk", request: "BILL-4", status: "working", what: "Adding up the week", id: "ledger-work", demo: false }),
  ]);

describe("what lies on the desk", () => {
  it("lists every waiting decision and every ready result from all projects, with who sent it and what it is", () => {
    const items = deskItemsFrom(threeHouses());

    expect(items.map((item) => [item.project, item.line.agent, item.kind, item.line.what])).toEqual([
      ["ledger", "clerk", "decision", "Pay the flour bill today?"],
      ["garden", "helper", "decision", "Buy more seeds?"],
      ["bakery", "baker", "decision", "Bake a second batch?"],
      ["garden", "digger", "result", "The beds are dug"],
    ]);
    expect(new Set(items.map((item) => item.project)).size).toBe(3);
  });

  it("puts urgent first, then what needs an answer, then what is ready to read, the longest wait on top", () => {
    const items = deskItemsFrom(threeHouses());

    // The urgent one has waited the shortest and still leads.
    expect(items[0]).toMatchObject({ isUrgent: true, waitedMs: 60_000 });
    // The result has waited the longest of all and still comes after every decision.
    expect(items.at(-1)).toMatchObject({ kind: "result", waitedMs: 9 * 60_000 });
    const decisions = items.filter((item) => item.kind === "decision" && !item.isUrgent);
    expect(decisions.map((item) => item.waitedMs)).toEqual([8 * 60_000, 4 * 60_000]);
    expect(DESK_ORDER_IN_WORDS).toMatch(/^Urgent first\./);
  });

  it("gives the same order every time, whatever order the projects come in", () => {
    const village = threeHouses();
    const turnedRound: VillageState = { ...village, projects: [...village.projects].reverse() };

    expect(deskItemsFrom(turnedRound).map((item) => item.key)).toEqual(deskItemsFrom(village).map((item) => item.key));
  });

  it("keeps each item's project and line id at hand, under the same key the plaza uses for its paperwork", () => {
    const village = threeHouses();
    const items = deskItemsFrom(village);

    expect(items[0]).toMatchObject({ project: "ledger", lineId: "ledger-ask", key: "ledger/ledger-ask" });
    expect(items.map((item) => item.key).sort()).toEqual(waitingPapersOf(village).map((paper) => paper.key).sort());
  });

  it("H10: marks an item demo when its line is scripted or its whole house is, and never a real one", () => {
    const items = deskItemsFrom(threeHouses());

    expect(items.filter((item) => item.isDemo).map((item) => item.project)).toEqual(["garden", "bakery", "garden"]);
    expect(items.find((item) => item.project === "ledger")?.isDemo).toBe(false);
  });

  it("is empty when nothing waits", () => {
    expect(deskItemsFrom(villageWith([]))).toEqual([]);
  });

  it("H9: a project whose feed failed is named in plain words, and the others' items are all still there", () => {
    const village = villageWith(
      [
        feedLine({ at: "06:00", project: "bakery", status: "needs_human", id: "bakery-ask" }),
        feedLine({ at: "09:00", project: "ledger", status: "needs_human", id: "ledger-ask", demo: false }),
      ],
      ["garden"],
    );

    expect(deskItemsFrom(village).map((item) => item.project)).toEqual(["bakery", "ledger"]);
    expect(housesWithNoNews(village)).toEqual([
      { project: "garden", why: "feed_failed", note: expect.stringMatching(/^No news from garden: the hub can't read/) },
    ]);
  });

  it("H9: a silent project keeps what it asked before, and the desk says it has gone quiet", () => {
    const village = villageWith([
      feedLine({ at: "02:00", project: "garden", status: "needs_human", id: "garden-ask" }),
      feedLine({ at: "09:00", project: "bakery", status: "working", id: "bakery-work" }),
      feedLine({ at: "09:00", project: "ledger", status: "working", id: "ledger-work", demo: false }),
    ]);

    expect(deskItemsFrom(village).map((item) => item.project)).toEqual(["garden"]);
    expect(housesWithNoNews(village).map((house) => [house.project, house.why])).toEqual([["garden", "no_news"]]);
    expect(housesWithNoNews(village)[0].note).toBe(
      "No news from garden for a while. What it sent before is still listed.",
    );
  });

  it("H12: the notes carry no rule codes", () => {
    const village = villageWith([], ["garden"]);
    for (const house of housesWithNoNews(village)) expect(house.note).not.toMatch(/\b[HQ]\d{1,2}\b/);
  });
});

describe("how long something has waited, in words", () => {
  it.each([
    [0, "less than a minute"],
    [59_999, "less than a minute"],
    [60_000, "1 minute"],
    [4 * 60_000 + 30_000, "4 minutes"],
    [59 * 60_000 + 59_000, "59 minutes"],
    [60 * 60_000, "1 hour"],
    [65 * 60_000, "1 hour 5 minutes"],
    [2 * 60 * 60_000 + 60_000, "2 hours 1 minute"],
    [24 * 60 * 60_000, "1 day"],
    [50 * 60 * 60_000, "2 days 2 hours"],
  ])("%d ms is \"%s\"", (waitedMs, words) => {
    expect(waitedInWords(waitedMs)).toBe(words);
  });

  it("never shows a number it can't stand behind", () => {
    expect(waitedInWords(-5000)).toBe("less than a minute");
    expect(waitedInWords(Number.NaN)).toBe("less than a minute");
  });
});

describe("a request's choices, as plain text", () => {
  it("joins the labels the request lists, never their ids", () => {
    expect(choicesInWords([{ id: "approve", label: "Approve" }, { id: "reject", label: "Reject" }])).toBe("Approve or Reject");
    expect(
      choicesInWords([
        { id: "a", label: "Send now" },
        { id: "b", label: "Send tomorrow" },
        { id: "c", label: "Don't send" },
      ]),
    ).toBe("Send now, Send tomorrow or Don't send");
    expect(choicesInWords([{ id: "ok", label: "OK" }])).toBe("OK");
  });

  it("is empty for a result, which offers none", () => {
    expect(choicesInWords(undefined)).toBe("");
    expect(choicesInWords([])).toBe("");
  });

  it("names the two kinds in plain words", () => {
    expect(kindInWords("decision")).toBe("Needs your answer");
    expect(kindInWords("result")).toBe("Ready to read");
  });
});
