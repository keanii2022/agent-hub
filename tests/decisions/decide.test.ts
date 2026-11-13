import { afterEach, describe, expect, it } from "vitest";
import { decideAtTheDesk, readDecisionRequest, type DecisionDesk } from "../../lib/decisions/decide";
import {
  STAND_IN_DOORS,
  approvalDeskDoor,
  doorLineIdFor,
  teamHouseDoor,
  type DecisionDoor,
  type DoorDelivery,
} from "../../lib/decisions/doors";
import { markSeenAtTheDesk, withoutSeenResults } from "../../lib/decisions/seen";
import { TEAM_HOUSE_PROJECT } from "../../lib/demo/scripts/team-house";
import { openRequestsFrom } from "../../lib/feed/requests";
import { IN_MEMORY_DATABASE, openHubStore, type HubStore } from "../../lib/store";
import type { VillageState } from "../../lib/village/state/village-state";

const choices = [
  { id: "approve", label: "Approve" },
  { id: "reject", label: "Reject" },
];

function asking(id: string, request: string, amount: number, project = "approval-desk") {
  return {
    project,
    agent: "refund-agent",
    request,
    step: "gate_decision",
    what: `Refund €${amount}?`,
    status: "needs_human",
    when: "2026-10-05T14:03:00Z",
    id,
    choices,
    details: { amount },
    demo: true,
  };
}

const small = asking("41", "REQ-1", 95);
const big = asking("42", "REQ-2", 410);
const teamAsk = { ...asking("43", "JOB-1", 12, TEAM_HOUSE_PROJECT), agent: "builder" };
const realAsk = { ...asking("44", "REQ-3", 50), demo: false };
const result = {
  project: "approval-desk",
  agent: "refund-agent",
  request: "REQ-4",
  step: "report",
  what: "The weekly report is ready",
  status: "result_ready",
  when: "2026-10-05T14:02:00Z",
  id: "45",
  demo: true,
};

const now = new Date("2026-10-05T14:10:00Z");
const stores: HubStore[] = [];

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});

function hub(overrides: Partial<DecisionDesk> = {}) {
  const store = openHubStore(IN_MEMORY_DATABASE);
  stores.push(store);
  store.addLines([small, big, teamAsk, realAsk, result]);
  const knocks: DoorDelivery[] = [];
  const watched = (door: DecisionDoor): DecisionDoor => ({
    project: door.project,
    knock(delivery) {
      knocks.push(delivery);
      return door.knock(delivery);
    },
  });
  const desk: DecisionDesk = {
    store,
    doors: STAND_IN_DOORS.map(watched),
    realProjects: [],
    now,
    ...overrides,
  };
  const linesOf = (project: string) => store.readLines({ project }).map((stored) => stored.line);
  return { store, desk, knocks, linesOf };
}

const about = (line: { project: string; id: string }) => ({ project: line.project, lineId: line.id });

describe("deciding at the desk", () => {
  it("an approval the stand-in takes is on record, and the project's own new line closes the request", () => {
    const { store, desk, knocks, linesOf } = hub();
    const outcome = decideAtTheDesk(desk, { ...about(small), choice: "approve" });

    expect(outcome).toMatchObject({ outcome: "accepted", answer: { choice: "approve", projectSaid: "accepted" } });
    expect(knocks).toHaveLength(1);
    expect(store.findDecision("approval-desk", "41")?.doorAnswer?.answer).toBe("accepted");
    const said = store.findLine("approval-desk", doorLineIdFor("41"))?.line;
    expect(said).toMatchObject({ refers_to: "41", request: "REQ-1", demo: true, status: "working" });
    expect(openRequestsFrom(linesOf("approval-desk")).map((open) => open.id)).not.toContain("41");
  });

  it("the stand-in's line id can never clash with a scripted day's numbered ids", () => {
    expect(doorLineIdFor("41")).not.toMatch(/^\d+(-\d+)?$/);
  });

  it("H5: the decision is written to the hub's record before the door is knocked", () => {
    const { store, desk } = hub();
    let onRecordWhenKnocked: unknown = "not knocked";
    const door: DecisionDoor = {
      project: "approval-desk",
      knock(delivery) {
        onRecordWhenKnocked = store.findDecision(delivery.ask.project, delivery.ask.id);
        return approvalDeskDoor.knock(delivery);
      },
    };
    decideAtTheDesk({ ...desk, doors: [door] }, { ...about(small), choice: "approve" });
    expect(onRecordWhenKnocked).toMatchObject({ askLineId: "41", choice: "approve" });
  });

  it("H5: a decision that can't be written is not sent", () => {
    const { store, desk, knocks, linesOf } = hub();
    const linesBefore = linesOf("approval-desk");
    const failingStore = {
      ...store,
      recordDecision: () => {
        throw new Error("disk full");
      },
    };
    const outcome = decideAtTheDesk({ ...desk, store: failingStore }, { ...about(small), choice: "approve" });

    expect(outcome.outcome).toBe("not_recorded");
    expect(outcome.words).toBe(
      "The hub couldn't write your answer to its own record, so nothing was sent to approval-desk. Nothing has changed.",
    );
    expect(knocks).toHaveLength(0);
    expect(store.findDecision("approval-desk", "41")).toBeNull();
    expect(linesOf("approval-desk")).toEqual(linesBefore);
  });

  it("H7: a reject needs a note; without one nothing is written and nothing is sent", () => {
    const { store, desk, knocks } = hub();
    for (const note of [undefined, "", "   \n"]) {
      const outcome = decideAtTheDesk(desk, { ...about(small), choice: "reject", ...(note !== undefined && { note }) });
      expect(outcome).toEqual({ outcome: "note_needed", words: "Reject needs a note saying why. Nothing was sent." });
    }
    expect(knocks).toHaveLength(0);
    expect(store.findDecision("approval-desk", "41")).toBeNull();

    const withNote = decideAtTheDesk(desk, { ...about(small), choice: "reject", note: "  Too late.  " });
    expect(withNote).toMatchObject({ outcome: "accepted", answer: { choice: "reject", note: "Too late." } });
  });

  it("H2: the stand-in refuses with its own reason, the refusal is on record, and nothing changes in its feed", () => {
    const { store, desk, knocks, linesOf } = hub();
    const linesBefore = linesOf("approval-desk");
    const outcome = decideAtTheDesk(desk, { ...about(big), choice: "approve" });

    expect(outcome).toMatchObject({
      outcome: "refused_by_project",
      answer: { projectSaid: "refused", reason: "A refund over €400 has to be approved in approval-desk itself." },
    });
    expect(outcome.words).toContain("approval-desk said no: A refund over €400");
    expect(outcome.words).not.toMatch(/\b[HQ]\d+\b/);
    expect(knocks).toHaveLength(1);
    expect(store.findDecision("approval-desk", "42")?.doorAnswer).toMatchObject({ answer: "refused" });
    expect(linesOf("approval-desk")).toEqual(linesBefore);
  });

  it("H2: the team house's stand-in refuses a yes to spending over its limit", () => {
    const delivery = (amount: number, choice = choices[0]): DoorDelivery => {
      const ask = { ...teamAsk, details: { amount } } as DoorDelivery["ask"];
      return { ask, choice, note: null, at: now, linesOfRequest: [ask] };
    };
    expect(teamHouseDoor.knock(delivery(35))).toMatchObject({ accepted: false });
    expect(teamHouseDoor.knock(delivery(12))).toMatchObject({ accepted: true });
    expect(teamHouseDoor.knock({ ...delivery(35, choices[1]), note: "No." })).toMatchObject({ accepted: true });
  });

  it("H6: a second decision on the same request is refused, whatever the project said to the first, and is never sent", () => {
    const { store, desk, knocks } = hub();
    decideAtTheDesk(desk, { ...about(big), choice: "approve" });
    const second = decideAtTheDesk(desk, { ...about(big), choice: "reject", note: "Then no." });

    expect(second).toMatchObject({ outcome: "already_decided", answer: { choice: "approve", projectSaid: "refused" } });
    expect(knocks).toHaveLength(1);
    expect(store.readDecisions()).toHaveLength(1);
  });

  it("H6: a request that asks again still has its one decision", () => {
    const { store, desk, knocks } = hub();
    decideAtTheDesk(desk, { ...about(big), choice: "approve" });
    store.addLines([{ ...big, id: "46", when: "2026-10-05T14:05:00Z" }]);
    const again = decideAtTheDesk(desk, { project: "approval-desk", lineId: "46", choice: "approve" });
    expect(again.outcome).toBe("already_decided");
    expect(knocks).toHaveLength(1);
  });

  it("H1: the hub only carries what a button sent: anything else decides nothing", () => {
    const { store, desk, knocks } = hub();
    const notFromAButton: unknown[] = [
      undefined,
      null,
      "approve",
      {},
      { ...about(small) },
      { ...about(small), choice: "approve", note: "only a reject carries a note" },
      { ...about(small), choice: "approve", extra: true },
      { ...about(small), choice: "maybe" },
      { ...about(result), choice: "approve" },
      { project: "approval-desk", lineId: "no-such-line", choice: "approve" },
    ];
    for (const sent of notFromAButton) {
      expect(["not_understood", "not_offered", "not_waiting"]).toContain(decideAtTheDesk(desk, sent).outcome);
    }
    expect(readDecisionRequest({ ...about(small), choice: "approve" })).toEqual({ ...about(small), choice: "approve" });
    expect(knocks).toHaveLength(0);
    expect(store.readDecisions()).toHaveLength(0);
  });

  it("H3: a house with no door, or one on its own data, gets nothing written and nothing sent", () => {
    const { store, desk, knocks } = hub();
    expect(decideAtTheDesk(desk, { ...about(realAsk), choice: "approve" }).outcome).toBe("no_door");
    const real = { ...desk, realProjects: ["approval-desk"] };
    expect(decideAtTheDesk(real, { ...about(small), choice: "approve" }).outcome).toBe("no_door");
    expect(decideAtTheDesk({ ...desk, doors: [] }, { ...about(teamAsk), choice: "approve" }).outcome).toBe("no_door");
    expect(knocks).toHaveLength(0);
    expect(store.readDecisions()).toHaveLength(0);
  });

  it("H2: a door that gives no answer is recorded as no answer, and the decision is not sent again", () => {
    const { store, desk } = hub();
    let knocked = 0;
    const silent: DecisionDoor = {
      project: "approval-desk",
      knock() {
        knocked += 1;
        throw new Error("no one home");
      },
    };
    const outcome = decideAtTheDesk({ ...desk, doors: [silent] }, { ...about(small), choice: "approve" });
    expect(outcome).toMatchObject({ outcome: "no_answer", answer: { projectSaid: "no_answer" } });
    decideAtTheDesk({ ...desk, doors: [silent] }, { ...about(small), choice: "approve" });
    expect(knocked).toBe(1);
    expect(store.findDecision("approval-desk", "41")?.doorAnswer?.answer).toBe("no_answer");
  });
});

describe("marking a result as seen", () => {
  it("is the owner's own mark: recorded once, nothing sent, and only for a ready result", () => {
    const { store } = hub();
    expect(markSeenAtTheDesk({ store, now }, about(result)).outcome).toBe("seen");
    expect(markSeenAtTheDesk({ store, now }, about(result)).outcome).toBe("already_seen");
    expect(markSeenAtTheDesk({ store, now }, about(small)).outcome).toBe("not_a_result");
    expect(markSeenAtTheDesk({ store, now }, { ...about(result), extra: 1 }).outcome).toBe("not_understood");
    expect(store.readDecisions()).toHaveLength(0);
    expect(store.readSeenResults()).toHaveLength(1);
  });

  it("takes a seen result off the desk and the stack, and leaves the rest", () => {
    const item = (line: object) => ({ line, waitedMs: 0, isUrgent: false });
    const village = {
      projects: [{ project: "approval-desk", waiting: [item(small)], ready: [item(result)] }],
      waitingCount: 2,
    } as unknown as VillageState;
    const after = withoutSeenResults(village, [{ project: "approval-desk", resultLineId: "45" }]);
    expect(after.projects[0].ready).toHaveLength(0);
    expect(after.projects[0].waiting).toHaveLength(1);
    expect(after.waitingCount).toBe(1);
    expect(withoutSeenResults(village, [])).toBe(village);
  });
});
