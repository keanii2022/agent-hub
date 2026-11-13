import { describe, expect, it } from "vitest";
import {
  legStartsOf,
  managerRoundFor,
  managerStateAt,
  walkLeg,
} from "../../../lib/village/characters/manager";
import {
  HANDOVER_WORDS,
  MANAGER,
  SHOULDER_TAP_WORDS,
  deliveryAfter,
  deliveryFollowing,
  deliveryMarksOf,
  deliverySceneOf,
  deliveryStartingAt,
  describeDelivery,
  markIsShowing,
  paperworkOnTheDesk,
  seenAtTheDesk,
  tripOf,
  waitingPapersOf,
  type DeliveryState,
  type TripLeg,
} from "../../../lib/village/delivery";
import { housesToVisit, placeHouses, villageHouses, type HouseEntry } from "../../../lib/village/houses";
import { houses as houseList } from "../../../config/houses";
import { desk } from "../../../lib/village/plaza";
import { canBeWalkedOn } from "../../../lib/village/routes";
import {
  APPROVAL_DESK,
  STEP_MS,
  TEAM_PROJECT,
  anOpenPageWithAnEmptyDesk,
  approvalDeskHouse,
  decided,
  decisionNeeded,
  invented,
  newsOf,
  playedTo,
  resultReady,
  storyOf,
  teamHouse,
  villageWith,
} from "./helpers";

const round = managerRoundFor(villageHouses);
const legStarts = legStartsOf(round);

function roundStartOf(doing: string): number {
  const legNumber = round.legs.findIndex((leg) => leg.doing === doing);
  if (legNumber < 0) throw new Error(`The round has no leg "${doing}"`);
  return legStarts[legNumber];
}

function placeOf(state: DeliveryState, key: string): string {
  return state.paperwork.find((paper) => paper.key === key)?.place ?? "gone";
}

function whatIsSaid(state: DeliveryState): string[] {
  return deliverySceneOf(state).speech.map((bubble) => bubble.words);
}

function managerDoing(state: DeliveryState): string {
  return deliverySceneOf(state).manager.doing;
}

/** Long enough for him to call at every door, carry from each, and be back at the desk. */
const THREE_ROUNDS_MS = 3 * round.lastsMs + 60_000;

describe("a scripted \"needs a decision\" event plays the whole handover", () => {
  const asked = decisionNeeded("01:00", "ask-1");
  const key = `${APPROVAL_DESK}/ask-1`;
  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf([asked], "01:01", 1000));
  const states = [heard, ...playedTo(heard, THREE_ROUNDS_MS)];

  it("starts with the paperwork waiting at its house, and the desk empty", () => {
    expect(placeOf(heard, key)).toBe("at the house");
    expect(paperworkOnTheDesk(heard)).toEqual([]);
    expect(markIsShowing(heard)).toBe(false);
  });

  it("moves the paperwork from the house, through the handover and the carry, onto the desk", () => {
    expect(storyOf(states, (state) => placeOf(state, key))).toEqual([
      "at the house",
      "being handed over",
      "being carried",
      "on the desk",
    ]);
  });

  it("has the manager do every part of it in order, then go on with his round", () => {
    const story = storyOf(states, managerDoing);
    const from = story.indexOf(`knocking at ${APPROVAL_DESK}`);
    expect(story.slice(from, from + 11)).toEqual([
      `knocking at ${APPROVAL_DESK}`,
      `being handed paperwork at ${APPROVAL_DESK}`,
      `taking the paperwork at ${APPROVAL_DESK}`,
      `carrying paperwork from ${APPROVAL_DESK} to the desk`,
      "tapping the owner on the shoulder",
      "walking round the desk with the paperwork",
      "putting the paperwork on the desk",
      "standing back from the desk",
      `walking to ${TEAM_PROJECT}`,
      `knocking at ${TEAM_PROJECT}`,
      `waiting at ${TEAM_PROJECT}`,
    ]);
  });

  it("says the owner's two lines, word for word: one at the door and one at the shoulder", () => {
    expect(HANDOVER_WORDS).toBe("oh snap, master has to see this");
    expect(SHOULDER_TAP_WORDS).toBe("here you go, master");
    expect(storyOf(states, whatIsSaid)).toEqual([[], [HANDOVER_WORDS], [], [SHOULDER_TAP_WORDS], []]);

    const atTheDoor = states.find((state) => whatIsSaid(state).includes(HANDOVER_WORDS))!;
    expect(managerDoing(atTheDoor)).toBe(`being handed paperwork at ${APPROVAL_DESK}`);
    const atTheShoulder = states.find((state) => whatIsSaid(state).includes(SHOULDER_TAP_WORDS))!;
    expect(managerDoing(atTheShoulder)).toBe("tapping the owner on the shoulder");
  });

  it("has an agent out at the door for the handover and at no other time", () => {
    for (const state of states) {
      const scene = deliverySceneOf(state);
      const atTheDoor = ["being handed paperwork", "taking paperwork"].includes(scene.manager.activity);
      expect(scene.agentsAtTheDoor.length, scene.manager.doing).toBe(atTheDoor ? 1 : 0);
      if (atTheDoor) {
        expect(scene.agentsAtTheDoor[0].house).toBe(approvalDeskHouse);
        expect(scene.manager.at).toEqual(approvalDeskHouse.doorstep);
        expect(scene.agentsAtTheDoor[0].holdsPaperwork).toBe(scene.manager.activity === "being handed paperwork");
      }
    }
  });

  it("has the manager carry it smoking, and never smoke or carry on an ordinary round", () => {
    for (const state of states) {
      const { manager } = deliverySceneOf(state);
      const isCarried = placeOf(state, key) === "being carried";
      expect(manager.carriesPaperwork ?? false, manager.doing).toBe(isCarried);
      if (!isCarried) expect(manager.smoke ?? [], manager.doing).toEqual([]);
    }
    const onTheWay = states.filter((state) => managerDoing(state).startsWith("carrying paperwork"));
    expect(onTheWay.some((state) => (deliverySceneOf(state).manager.smoke ?? []).length > 0)).toBe(true);
  });

  it("taps the owner's shoulder from behind his chair, and the owner looks up while it lasts", () => {
    const tapping = states.filter((state) => managerDoing(state) === "tapping the owner on the shoulder");
    expect(tapping.length).toBeGreaterThan(0);
    for (const state of states) {
      const scene = deliverySceneOf(state);
      expect(scene.ownerIsBeingTapped).toBe(tapping.includes(state));
    }
    for (const state of tapping) {
      expect(deliverySceneOf(state).manager).toMatchObject({ at: desk.visitorSpot, facing: "right" });
    }
    const hands = storyOf(tapping, (state) => deliverySceneOf(state).manager.handOnShoulder);
    expect(hands.slice(0, 4)).toEqual([true, false, true, false]);
  });

  it("drops it from the far end of the desk: the stack and the mark appear as he steps back", () => {
    const steppedBack = states.find((state) => managerDoing(state) === "standing back from the desk")!;
    const justBefore = states[states.indexOf(steppedBack) - 1];
    expect(managerDoing(justBefore)).toBe("putting the paperwork on the desk");
    expect(deliverySceneOf(justBefore)).toMatchObject({ stack: [], markIsShowing: false });
    expect(deliverySceneOf(steppedBack).manager).toMatchObject({ at: desk.dropOffSpot, facing: "left" });
    expect(deliverySceneOf(steppedBack).stack.map((paper) => paper.key)).toEqual([key]);
    expect(deliverySceneOf(steppedBack).markIsShowing).toBe(true);
  });

  it("never lifts the manager off the paths or jumps him from one place to another", () => {
    let before = deliverySceneOf(states[0]).manager.at;
    for (const state of states) {
      const { at, doing } = deliverySceneOf(state).manager;
      expect(canBeWalkedOn(Math.round(at.x), Math.round(at.y)), `${doing} at ${at.x},${at.y}`).toBe(true);
      expect(Math.abs(at.x - before.x) + Math.abs(at.y - before.y), `${doing} at ${state.atMs}`).toBeLessThanOrEqual(1);
      before = at;
    }
  });

  it("ends with the manager back on his ordinary round, nothing in hand", () => {
    const last = states[states.length - 1];
    expect(last.trips).toEqual([]);
    expect(placeOf(last, key)).toBe("on the desk");
    expect(deliverySceneOf(last).manager.activity).toMatch(/^(walking|knocking|waiting|at the desk)$/);
  });
});

describe("a scripted \"result ready\" event plays the same handover", () => {
  const ready = resultReady("03:00", "report-1");
  const key = `${TEAM_PROJECT}/report-1`;
  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf([ready], "03:01", 2000));
  const states = [heard, ...playedTo(heard, THREE_ROUNDS_MS)];

  it("is heard as a result, not a decision", () => {
    expect(heard.paperwork).toMatchObject([{ key, kind: "result", project: TEAM_PROJECT, from: "builder" }]);
  });

  it("goes from the house to the desk the same way, with the same two lines", () => {
    expect(storyOf(states, (state) => placeOf(state, key))).toEqual([
      "at the house",
      "being handed over",
      "being carried",
      "on the desk",
    ]);
    expect(storyOf(states, whatIsSaid)).toEqual([[], [HANDOVER_WORDS], [], [SHOULDER_TAP_WORDS], []]);
  });

  it("is handed over at its own house's door, after the manager has called at the houses before it", () => {
    const story = storyOf(states, managerDoing);
    expect(story.slice(0, story.indexOf(`taking the paperwork at ${TEAM_PROJECT}`) + 1)).toEqual([
      `walking to ${APPROVAL_DESK}`,
      `knocking at ${APPROVAL_DESK}`,
      `waiting at ${APPROVAL_DESK}`,
      `walking to ${TEAM_PROJECT}`,
      `knocking at ${TEAM_PROJECT}`,
      `being handed paperwork at ${TEAM_PROJECT}`,
      `taking the paperwork at ${TEAM_PROJECT}`,
    ]);
    const handover = states.find((state) => managerDoing(state) === `being handed paperwork at ${TEAM_PROJECT}`)!;
    expect(deliverySceneOf(handover).agentsAtTheDoor[0].house).toBe(teamHouse);
  });

  it("walks back to the desk after the last house, and the next round starts as every round does", () => {
    const story = storyOf(states, managerDoing);
    const from = story.indexOf("standing back from the desk");
    expect(story.slice(from, from + 4)).toEqual([
      "standing back from the desk",
      "walking back to the desk",
      "standing at the desk",
      `walking to ${APPROVAL_DESK}`,
    ]);
  });
});

describe("the stack follows the number of things waiting", () => {
  const first = decisionNeeded("01:00", "ask-1");
  const second = decisionNeeded("01:10", "ask-2", APPROVAL_DESK, true);
  const report = resultReady("01:20", "report-1");

  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf([first, second, report], "01:30", 500));
  const states = [heard, ...playedTo(heard, THREE_ROUNDS_MS)];
  const allCarried = states[states.length - 1];

  it("grows as each house's paperwork lands: a house's papers are carried together", () => {
    expect(storyOf(states, (state) => paperworkOnTheDesk(state).map((paper) => paper.key))).toEqual([
      [],
      [`${APPROVAL_DESK}/ask-1`, `${APPROVAL_DESK}/ask-2`],
      [`${APPROVAL_DESK}/ask-1`, `${APPROVAL_DESK}/ask-2`, `${TEAM_PROJECT}/report-1`],
    ]);
  });

  it("only counts what has reached the desk, never what is still at a house or in his arms", () => {
    for (const state of states) {
      const onTheDesk = state.paperwork.filter((paper) => paper.place === "on the desk").length;
      expect(deliverySceneOf(state).stack.length).toBe(onTheDesk);
      expect(deliveryMarksOf(state).deskPapers).toBe(String(onTheDesk));
    }
    expect(allCarried.paperwork.every((paper) => paper.place === "on the desk")).toBe(true);
  });

  it("keeps what it knows of each paper: who sent it, what kind it is, and whether it is urgent", () => {
    expect(deliverySceneOf(allCarried).stack.map((paper) => [paper.kind, paper.isUrgent, paper.from])).toEqual([
      ["decision", false, "refund-agent"],
      ["decision", true, "refund-agent"],
      ["result", false, "builder"],
    ]);
  });

  it("shrinks when something stops waiting, and is empty when nothing waits", () => {
    const oneAnswered = deliveryAfter(
      allCarried,
      newsOf([first, second, report, decided("09:00", first)], "09:01", allCarried.atMs + 100),
    );
    expect(paperworkOnTheDesk(oneAnswered).map((paper) => paper.key)).toEqual([
      `${APPROVAL_DESK}/ask-2`,
      `${TEAM_PROJECT}/report-1`,
    ]);

    const nothingLeft = deliveryAfter(oneAnswered, { type: "news", atMs: oneAnswered.atMs + 100, waiting: [] });
    expect(paperworkOnTheDesk(nothingLeft)).toEqual([]);
    expect(nothingLeft.paperwork).toEqual([]);
  });

  it("matches the hub's own count once everything has been carried", () => {
    const village = villageWith([first, second, report], "01:30");
    expect(paperworkOnTheDesk(allCarried).length).toBe(village.waitingCount);
  });
});

describe("the exclamation mark", () => {
  const asked = decisionNeeded("01:00", "ask-1");
  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf([asked], "01:01", 1000));
  const states = [heard, ...playedTo(heard, THREE_ROUNDS_MS)];
  const landed = states[states.length - 1];

  it("shows from the moment something lands on the desk, not before", () => {
    for (const state of states) {
      expect(markIsShowing(state)).toBe(paperworkOnTheDesk(state).length > 0);
      expect(deliveryMarksOf(state).deskMark).toBe(markIsShowing(state) ? "showing" : "cleared");
    }
    expect(markIsShowing(landed)).toBe(true);
  });

  it("clears when the desk is opened, and stays cleared while nothing new lands", () => {
    const opened = deliveryAfter(landed, { type: "desk opened", atMs: landed.atMs });
    expect(markIsShowing(opened)).toBe(false);
    expect(paperworkOnTheDesk(opened).length).toBe(1);

    const later = playedTo(opened, opened.atMs + round.lastsMs);
    expect(later.some(markIsShowing)).toBe(false);
    const sameNewsAgain = deliveryAfter(opened, newsOf([asked], "05:00", opened.atMs + 100));
    expect(markIsShowing(sameNewsAgain)).toBe(false);
  });

  it("comes back when something new lands, and not while that is still on its way", () => {
    const opened = deliveryAfter(landed, { type: "desk opened", atMs: landed.atMs });
    const more = deliveryAfter(opened, newsOf([asked, resultReady("06:00", "report-2")], "06:01", opened.atMs + 100));
    expect(markIsShowing(more)).toBe(false);

    const after = playedTo(more, more.atMs + THREE_ROUNDS_MS);
    expect(storyOf(after, (state) => [paperworkOnTheDesk(state).length, markIsShowing(state)])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it("clears by itself when the last new thing on the desk stops waiting", () => {
    const answered = deliveryAfter(landed, newsOf([asked, decided("07:00", asked)], "07:01", landed.atMs + 100));
    expect(paperworkOnTheDesk(answered)).toEqual([]);
    expect(markIsShowing(answered)).toBe(false);
  });

  it("opening an empty desk changes nothing", () => {
    const empty = anOpenPageWithAnEmptyDesk();
    expect(deliveryAfter(empty, { type: "desk opened", atMs: 0 })).toBe(empty);
  });

  it("bobs up and down on the clock while it shows", () => {
    const raised = storyOf(playedTo(landed, landed.atMs + 3000), (state) => deliverySceneOf(state).markIsRaised);
    expect(raised.length).toBeGreaterThanOrEqual(4);
  });
});

describe("what is already waiting when the page opens", () => {
  const lines = [decisionNeeded("01:00", "ask-1"), decisionNeeded("01:10", "ask-2"), resultReady("01:20", "report-1")];
  const village = villageWith(lines, "02:00");

  it("is on the desk from the first answer, with the mark showing: nobody carries it across", () => {
    const opened = deliveryFollowing(deliveryStartingAt(4200), 4200, village);
    expect(opened.paperwork.map((paper) => paper.place)).toEqual(["on the desk", "on the desk", "on the desk"]);
    expect(opened.trips).toEqual([]);
    expect(markIsShowing(opened)).toBe(true);
    expect(deliverySceneOf(opened).agentsAtTheDoor).toEqual([]);

    const later = playedTo(opened, 4200 + round.lastsMs);
    expect(later.every((state) => state.trips.length === 0)).toBe(true);
  });

  it("lies oldest at the bottom", () => {
    const opened = deliveryFollowing(deliveryStartingAt(0), 0, village);
    expect(paperworkOnTheDesk(opened).map((paper) => paper.key)).toEqual([
      `${APPROVAL_DESK}/ask-1`,
      `${APPROVAL_DESK}/ask-2`,
      `${TEAM_PROJECT}/report-1`,
    ]);
  });

  it("leaves the manager exactly where his round has him, at any moment the page is opened on", () => {
    for (const timeMs of [0, 4200, roundStartOf(`knocking at ${APPROVAL_DESK}`) + 60, round.lastsMs * 3 + 12345]) {
      const opened = deliveryFollowing(deliveryStartingAt(timeMs), timeMs, village);
      expect(deliverySceneOf(opened).manager, `at ${timeMs}`).toEqual(managerStateAt(timeMs, villageHouses));
    }
  });

  it("gives the same picture every time a paused page asks, frame after frame", () => {
    const first = deliveryFollowing(deliveryStartingAt(4200), 4200, village);
    let state = first;
    for (let frame = 0; frame < 50; frame += 1) state = deliveryFollowing(state, 4200, village);
    expect(state).toBe(first);
    expect(deliverySceneOf(state)).toEqual(deliverySceneOf(first));
  });

  it("shows nothing before the hub's first answer", () => {
    const loading = deliveryFollowing(deliveryStartingAt(4200), 4200, "loading");
    expect(loading).toMatchObject({ hasHeardNews: false, paperwork: [] });
    expect(deliverySceneOf(loading)).toMatchObject({ stack: [], markIsShowing: false });
  });

  it("can be told what the owner has already seen, so the mark only shows for what is new", () => {
    const allSeen = deliveryStartingAt(0, waitingPapersOf(village).map((paper) => paper.key));
    expect(markIsShowing(deliveryFollowing(allSeen, 0, village))).toBe(false);

    const oneSeen = deliveryFollowing(deliveryStartingAt(0, [`${APPROVAL_DESK}/ask-1`]), 0, village);
    expect(markIsShowing(oneSeen)).toBe(true);
    expect(seenAtTheDesk(oneSeen)).toEqual([`${APPROVAL_DESK}/ask-1`]);
    const opened = deliveryAfter(oneSeen, { type: "desk opened", atMs: 0 });
    expect(seenAtTheDesk(opened).length).toBe(3);
  });
});

describe("the sequence is worked out from what happened, and from nothing else", () => {
  const lines = [decisionNeeded("01:00", "ask-1"), resultReady("01:20", "report-1")];
  const start = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf(lines, "01:30", 700));

  it("gives the same state for the same events, however often it is asked", () => {
    const once = playedTo(start, 60_000);
    const again = playedTo(start, 60_000);
    expect(again).toEqual(once);
  });

  it("does not depend on how often the page steps it: one long step lands where many short ones do", () => {
    const steppedTo = (toMs: number, stepMs: number): DeliveryState =>
      deliveryAfter(playedTo(start, toMs, stepMs).at(-1)!, { type: "time passed", atMs: toMs });
    for (const toMs of [9000, 15_000, 26_000, 40_000, THREE_ROUNDS_MS]) {
      const inShortSteps = steppedTo(toMs, 20);
      const inLongSteps = steppedTo(toMs, 1000);
      const inOneStep = deliveryAfter(start, { type: "time passed", atMs: toMs });
      expect(inLongSteps, `at ${toMs}`).toEqual(inShortSteps);
      expect(inOneStep, `at ${toMs}`).toEqual(inShortSteps);
    }
  });

  it("never changes the state it was given", () => {
    const frozen = structuredClone(start);
    playedTo(start, 60_000);
    deliveryAfter(start, { type: "desk opened", atMs: 800 });
    expect(start).toEqual(frozen);
  });

  it("only moves forwards: something dated earlier counts as happening now", () => {
    const later = deliveryAfter(start, { type: "time passed", atMs: 30_000 });
    expect(deliveryAfter(later, { type: "time passed", atMs: 10 })).toBe(later);
    expect(deliveryAfter(later, { type: "desk opened", atMs: 10 }).atMs).toBe(30_000);
  });

  it("hands over at once when the news comes while he is already waiting at that door", () => {
    const waitingAtTheDoor = roundStartOf(`waiting at ${APPROVAL_DESK}`) + 500;
    const there = deliveryAfter(anOpenPageWithAnEmptyDesk(), { type: "time passed", atMs: waitingAtTheDoor });
    expect(managerDoing(there)).toBe(`waiting at ${APPROVAL_DESK}`);

    const heard = deliveryAfter(there, newsOf([lines[0]], "01:30", waitingAtTheDoor));
    expect(managerDoing(heard)).toBe(`being handed paperwork at ${APPROVAL_DESK}`);
    expect(placeOf(heard, `${APPROVAL_DESK}/ask-1`)).toBe("being handed over");
  });

  it("leaves it at the house until his next call when the news comes just after he has left", () => {
    const justLeft = roundStartOf(`walking to ${TEAM_PROJECT}`) + 100;
    const gone = deliveryAfter(anOpenPageWithAnEmptyDesk(), { type: "time passed", atMs: justLeft });
    const heard = deliveryAfter(gone, newsOf([lines[0]], "01:30", justLeft));
    expect(placeOf(heard, `${APPROVAL_DESK}/ask-1`)).toBe("at the house");

    const untilHeIsBack = playedTo(heard, round.lastsMs + roundStartOf(`waiting at ${APPROVAL_DESK}`) + 100);
    expect(storyOf(untilHeIsBack, (state) => placeOf(state, `${APPROVAL_DESK}/ask-1`))).toEqual([
      "at the house",
      "being handed over",
    ]);
    const handover = untilHeIsBack.at(-1)!;
    expect(tripOf(handover, MANAGER)?.legStartedAtMs).toBe(round.lastsMs + roundStartOf(`waiting at ${APPROVAL_DESK}`));
  });

  it("takes paperwork that arrives during a handover on his next call, not this one", () => {
    const handingOver = deliveryAfter(start, {
      type: "time passed",
      atMs: roundStartOf(`waiting at ${APPROVAL_DESK}`) + 1000,
    });
    expect(managerDoing(handingOver)).toBe(`being handed paperwork at ${APPROVAL_DESK}`);
    const more = deliveryAfter(handingOver, newsOf([...lines, decisionNeeded("01:40", "ask-late")], "01:41", handingOver.atMs));
    expect(placeOf(more, `${APPROVAL_DESK}/ask-late`)).toBe("at the house");

    const after = playedTo(more, more.atMs + THREE_ROUNDS_MS);
    expect(storyOf(after, (state) => paperworkOnTheDesk(state).map((paper) => paper.key))).toEqual([
      [],
      [`${APPROVAL_DESK}/ask-1`],
      [`${APPROVAL_DESK}/ask-1`, `${TEAM_PROJECT}/report-1`],
      [`${APPROVAL_DESK}/ask-1`, `${TEAM_PROJECT}/report-1`, `${APPROVAL_DESK}/ask-late`],
    ]);
  });

  it("drops nothing and says nothing when the paperwork stops waiting while he carries it", () => {
    const carrying = playedTo(start, THREE_ROUNDS_MS).find((state) =>
      managerDoing(state).startsWith("carrying paperwork"),
    )!;
    const answered = deliveryAfter(carrying, newsOf([lines[0], decided("02:00", lines[0])], "02:01", carrying.atMs));
    expect(answered.paperwork).toEqual([]);
    expect(deliverySceneOf(answered).manager.carriesPaperwork).toBe(false);

    const rest = playedTo(answered, answered.atMs + 40_000);
    expect(rest.every((state) => whatIsSaid(state).length === 0)).toBe(true);
    expect(rest.every((state) => paperworkOnTheDesk(state).length === 0 && !markIsShowing(state))).toBe(true);
    expect(rest.at(-1)!.trips).toEqual([]);
  });

  it("H9: a hub that cannot be reached empties nothing: the desk keeps what it has", () => {
    const landed = playedTo(start, THREE_ROUNDS_MS).at(-1)!;
    expect(paperworkOnTheDesk(landed).length).toBe(2);
    const unreachable = deliveryFollowing(landed, landed.atMs + 2000, "unreachable");
    expect(unreachable.paperwork).toEqual(landed.paperwork);
    expect(markIsShowing(unreachable)).toBe(true);
  });

  it("H9: paperwork of one house is carried even when the hub lists a project the village has no house for", () => {
    const stray = { ...invented(1, "no-such-house")[0] };
    const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), {
      type: "news",
      atMs: 100,
      waiting: [stray, ...invented(1)],
    });
    const after = playedTo(heard, THREE_ROUNDS_MS).at(-1)!;
    expect(placeOf(after, stray.key)).toBe("at the house");
    expect(paperworkOnTheDesk(after).map((paper) => paper.project)).toEqual([APPROVAL_DESK]);
  });
});

describe("the hub's answer, as paperwork", () => {
  it("lists decisions and results of every house, longest-waiting first, each with a key of its own", () => {
    const village = villageWith(
      [resultReady("01:20", "report-1"), decisionNeeded("01:00", "ask-1"), decisionNeeded("01:40", "ask-2", TEAM_PROJECT, true)],
      "02:00",
    );
    expect(waitingPapersOf(village)).toEqual([
      { key: `${APPROVAL_DESK}/ask-1`, project: APPROVAL_DESK, kind: "decision", isUrgent: false, from: "refund-agent" },
      { key: `${TEAM_PROJECT}/report-1`, project: TEAM_PROJECT, kind: "result", isUrgent: false, from: "builder" },
      { key: `${TEAM_PROJECT}/ask-2`, project: TEAM_PROJECT, kind: "decision", isUrgent: true, from: "refund-agent" },
    ]);
    expect(waitingPapersOf(village).length).toBe(village.waitingCount);
  });

  it("is empty when nothing waits", () => {
    expect(waitingPapersOf(villageWith([], "02:00"))).toEqual([]);
  });
});

describe("another carrier", () => {
  // Step 14 sends an agent to the desk by itself. Its legs are its own; the
  // drop, the stack and the mark are the same ones the manager uses.
  const itsOwnLegs: TripLeg[] = [
    {
      ...walkLeg(approvalDeskHouse.doorstep, desk.dropOffSpot, "running to the desk", null),
      paperworkIs: "being carried",
      smokes: true,
      says: null,
    },
    {
      activity: "standing back",
      doing: "catching its breath",
      atHouse: null,
      at: desk.dropOffSpot,
      facing: "left",
      lastsMs: 500,
      paperworkIs: "on the desk",
      smokes: false,
      says: null,
    },
  ];
  const [urgent, ordinary] = invented(2, APPROVAL_DESK, [0]);
  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), { type: "news", atMs: 100, waiting: [urgent, ordinary] });
  const setOff = deliveryAfter(heard, {
    type: "carrier sets off",
    atMs: 200,
    carrier: "refund-agent",
    project: APPROVAL_DESK,
    legs: itsOwnLegs,
    keys: [urgent.key],
  });

  it("takes only the paperwork it was sent with, and the manager still comes for the rest", () => {
    expect(setOff.paperwork.map((paper) => [paper.place, paper.carrier])).toEqual([
      ["being carried", "refund-agent"],
      ["at the house", null],
    ]);
    const states = playedTo(setOff, THREE_ROUNDS_MS);
    expect(storyOf(states, (state) => paperworkOnTheDesk(state).map((paper) => paper.key))).toEqual([
      [],
      [urgent.key],
      [urgent.key, ordinary.key],
    ]);
    expect(states.at(-1)!.trips).toEqual([]);
  });

  it("lands on the same stack and raises the same mark", () => {
    const landed = playedTo(setOff, 200 + itsOwnLegs[0].lastsMs + 100).at(-1)!;
    expect(deliverySceneOf(landed).stack.map((paper) => paper.key)).toEqual([urgent.key]);
    expect(markIsShowing(landed)).toBe(true);
    expect(tripOf(landed, "refund-agent")?.onLeg).toBe(1);
  });

  it("does not stop the manager's round", () => {
    const states = playedTo(setOff, 5000);
    for (const state of states) {
      expect(deliverySceneOf(state).manager).toEqual(managerStateAt(state.atMs, villageHouses));
    }
  });

  it("is on one trip at a time", () => {
    const again = deliveryAfter(setOff, {
      type: "carrier sets off",
      atMs: 300,
      carrier: "refund-agent",
      project: APPROVAL_DESK,
      legs: itsOwnLegs,
      keys: [ordinary.key],
    });
    expect(again.trips.length).toBe(1);
    expect(placeOf(again, ordinary.key)).toBe("at the house");
  });
});

describe("a village with another house in it", () => {
  const newEntry: HouseEntry = {
    project: "pixel-bakery",
    lot: "far left of the upper street",
    build: "plaster cottage",
    sign: "pink star",
    props: [],
    data: "demo",
  };
  const placed = placeHouses([...houseList, newEntry]);

  it("hands over at the new house's door too, with no change but the list", () => {
    const [paper] = invented(1, "pixel-bakery");
    let state = deliveryAfter(deliveryStartingAt(0), { type: "news", atMs: 0, waiting: [] }, placed);
    state = deliveryAfter(state, { type: "news", atMs: 100, waiting: [paper] }, placed);
    const doings: string[] = [];
    for (let atMs = 120; atMs < managerRoundFor(placed).lastsMs + 60_000; atMs += STEP_MS) {
      state = deliveryAfter(state, { type: "time passed", atMs }, placed);
      const { doing } = deliverySceneOf(state, placed).manager;
      if (doings.at(-1) !== doing) doings.push(doing);
    }
    expect(housesToVisit(placed).map((house) => house.name)).toContain("pixel-bakery");
    expect(doings).toContain("being handed paperwork at pixel-bakery");
    expect(doings).toContain("carrying paperwork from pixel-bakery to the desk");
    expect(paperworkOnTheDesk(state).map((found) => found.key)).toEqual([paper.key]);
  });
});

describe("the handover in plain words", () => {
  const asked = decisionNeeded("01:00", "ask-1");
  const heard = deliveryAfter(anOpenPageWithAnEmptyDesk(), newsOf([asked], "01:01", 1000));
  const states = [heard, ...playedTo(heard, THREE_ROUNDS_MS)];

  it("tells what the manager is doing, what waits where, and whether the mark is up", () => {
    expect(describeDelivery(heard)).toBe(
      `The manager is walking to ${APPROVAL_DESK}. 1 paper waits at ${APPROVAL_DESK} for his next call. Nothing is waiting on the desk.`,
    );
    const landed = states.at(-1)!;
    expect(describeDelivery(landed)).toMatch(
      /^The manager is .+\. 1 paper is waiting on the desk\. An exclamation mark above the computer says something new has landed there\.$/,
    );
    const opened = deliveryAfter(landed, { type: "desk opened", atMs: landed.atMs });
    expect(describeDelivery(opened)).toMatch(/^The manager is .+\. 1 paper is waiting on the desk\.$/);
  });

  it("follows every part of the handover", () => {
    const told = storyOf(states, describeDelivery).join(" ");
    for (const part of [
      `being handed paperwork at ${APPROVAL_DESK}`,
      `carrying paperwork from ${APPROVAL_DESK} to the desk`,
      "tapping the owner on the shoulder",
      "putting the paperwork on the desk",
    ]) {
      expect(told).toContain(part);
    }
  });

  it("H12: never shows a rule code or a line's id", () => {
    for (const words of storyOf(states, describeDelivery)) {
      expect(words).not.toMatch(/\b[HQ]\d{1,2}\b/);
      expect(words).not.toContain("ask-1");
    }
  });
});
