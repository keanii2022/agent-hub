import { describe, expect, it } from "vitest";
import { houses as houseList } from "../../../config/houses";
import { approvalDeskScript } from "../../../lib/demo/scripts";
import { AGENT_PACE } from "../../../lib/village/characters/agent";
import {
  MANAGER_PACE,
  legStartsOf,
  managerRoundFor,
  managerStateAt,
} from "../../../lib/village/characters/manager";
import {
  HANDOVER_WORDS,
  MANAGER,
  SHOULDER_TAP_WORDS,
  URGENT_TAP_WORDS,
  agentTapSpot,
  agentTripsOf,
  agentsAtHomeOf,
  agentsAwayFrom,
  carrierNameOf,
  deliveryAfter,
  deliveryFollowing,
  deliveryMarksOf,
  deliverySceneOf,
  deliveryStartingAt,
  describeAgentsOut,
  describeDelivery,
  legsOfAnAgentsWalk,
  markIsShowing,
  paperworkOnTheDesk,
  tripOf,
  type AgentsAtHome,
  type DeliveryState,
  type WaitingPaper,
} from "../../../lib/village/delivery";
import { villageHouses } from "../../../lib/village/houses";
import { agentColours, describeInside, insideOf } from "../../../lib/village/interiors";
import { desk } from "../../../lib/village/plaza";
import { canBeWalkedOn } from "../../../lib/village/routes";
import { houseStatusFrom, projectsOf, villageStateAt } from "../../../lib/village/state";
import { dayStartOf, daysOf } from "../../demo/helpers";
import { feedLine } from "../../feed/lines";
import {
  APPROVAL_DESK,
  STEP_MS,
  TEAM_PROJECT,
  approvalDeskHouse,
  decisionNeeded,
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

const REFUND_AGENT = "refund-agent";
const TEAM = ["builder", "checker", "planner"] as const;
const AT_HOME: AgentsAtHome = new Map<string, readonly string[]>([
  [APPROVAL_DESK, [REFUND_AGENT]],
  [TEAM_PROJECT, TEAM],
]);

function paper(id: string, from: string = REFUND_AGENT, project: string = APPROVAL_DESK, isUrgent = true): WaitingPaper {
  return { key: `${project}/${id}`, project, kind: "decision", isUrgent, from };
}

/** A page open since time zero that has heard who is home and that nothing is waiting. */
const openPage = deliveryAfter(deliveryStartingAt(0), { type: "news", atMs: 0, waiting: [], agentsAtHome: AT_HOME });

function heard(state: DeliveryState, atMs: number, waiting: readonly WaitingPaper[]): DeliveryState {
  return deliveryAfter(state, { type: "news", atMs, waiting, agentsAtHome: AT_HOME });
}

function placeOf(state: DeliveryState, key: string): string {
  return state.paperwork.find((found) => found.key === key)?.place ?? "gone";
}

function whatIsSaid(state: DeliveryState): string[] {
  return deliverySceneOf(state).speech.map((bubble) => bubble.words);
}

function managerDoing(state: DeliveryState): string {
  return deliverySceneOf(state).manager.doing;
}

function onTheDesk(state: DeliveryState): string[] {
  return paperworkOnTheDesk(state).map((found) => found.key);
}

/** The manager has just walked away from approval-desk's door: nobody is at any door. */
const NOBODY_AT_A_DOOR_MS = roundStartOf(`walking to ${TEAM_PROJECT}`) + 100;
/** He has just made the last call of his round: he is not at any door again before a walk to the desk is over. */
const AFTER_HIS_LAST_CALL_MS = roundStartOf("walking back to the desk") + 100;
const WALK_AND_BACK_MS = legsOfAnAgentsWalk(approvalDeskHouse).reduce((total, leg) => total + leg.lastsMs, 0);
const THREE_ROUNDS_MS = 3 * round.lastsMs + 60_000;

function walkOf(house: string): string[] {
  return [
    `stepping out of ${house} with urgent paperwork`,
    `walking urgent paperwork from ${house} to the desk`,
    "tapping the owner on the shoulder",
    "walking round the desk with the paperwork",
    "putting the paperwork on the desk",
    "standing back from the desk",
    `walking back to ${house}`,
    `going back into ${house}`,
  ];
}

describe("a scripted urgent event sends its own agent to the desk", () => {
  const urgent = paper("ask-1");
  const carrier = carrierNameOf(APPROVAL_DESK, REFUND_AGENT);
  const setOff = heard(openPage, 1000, [urgent]);
  const states = [setOff, ...playedTo(setOff, 1000 + WALK_AND_BACK_MS + 2000)];
  const out = states.filter((state) => deliverySceneOf(state).walkers.length > 0);
  const walker = (state: DeliveryState) => deliverySceneOf(state).walkers[0];
  const during = (doing: string): DeliveryState[] => out.filter((state) => walker(state).doing === doing);
  const [steppingOut, walkingOver, tapping, goingRound, puttingDown, standingBack, walkingBack, goingIn] =
    walkOf(APPROVAL_DESK).map(during);

  it("sets off the moment the hub says so, without waiting for the manager", () => {
    expect(tripOf(setOff, carrier)).toMatchObject({ legStartedAtMs: 1000, onLeg: 0, project: APPROVAL_DESK });
    expect(tripOf(setOff, carrier)?.agent?.name).toBe(REFUND_AGENT);
    expect(setOff.paperwork).toMatchObject([{ key: urgent.key, place: "being carried", carrier }]);
    expect(tripOf(setOff, MANAGER)).toBeNull();
  });

  it("does every part of the walk in order, and is home again at the end of it", () => {
    expect(storyOf(states, (state) => walker(state)?.doing ?? "home")).toEqual([...walkOf(APPROVAL_DESK), "home"]);
    expect(storyOf(states, (state) => walker(state)?.activity ?? "home")).toEqual([
      "stepping out",
      "walking",
      "tapping the shoulder",
      "walking",
      "putting paperwork down",
      "standing back",
      "walking",
      "going back in",
      "home",
    ]);
    expect(states.at(-1)!.trips).toEqual([]);
    expect(out.at(-1)!.atMs).toBe(1000 + WALK_AND_BACK_MS - STEP_MS);
  });

  it("takes its paperwork from the house straight into its own hands and onto the desk", () => {
    expect(storyOf(states, (state) => placeOf(state, urgent.key))).toEqual(["being carried", "on the desk"]);
    for (const state of states) {
      expect(tripOf(state, MANAGER), managerDoing(state)).toBeNull();
      expect(deliverySceneOf(state).agentsAtTheDoor).toEqual([]);
    }
  });

  it("leaves the manager on his ordinary round, empty-handed, the whole time", () => {
    for (const state of states) {
      expect(deliverySceneOf(state).manager).toEqual(managerStateAt(state.atMs, villageHouses));
    }
  });

  it("comes out of its own door and goes back in at it", () => {
    for (const state of [...steppingOut, ...goingIn]) {
      expect(walker(state).at).toEqual(approvalDeskHouse.doorstep);
    }
    expect(steppingOut[0].atMs).toBe(1000);
    expect(walker(steppingOut[0]).facing).toBe("down");
    expect(walker(goingIn[0]).facing).toBe("up");
    for (const state of out) expect(walker(state).home).toBe(approvalDeskHouse);
  });

  it("says the agent's line at its door and its own at the owner's shoulder, and nothing else", () => {
    expect(storyOf(states, whatIsSaid)).toEqual([[HANDOVER_WORDS], [], [URGENT_TAP_WORDS], []]);
    for (const state of steppingOut) expect(whatIsSaid(state)).toEqual([HANDOVER_WORDS]);
    for (const state of tapping) expect(whatIsSaid(state)).toEqual([URGENT_TAP_WORDS]);
    // The owner's own two lines are his, word for word, and the agent's new one is not one of them.
    expect(HANDOVER_WORDS).toBe("oh snap, master has to see this");
    expect(SHOULDER_TAP_WORDS).toBe("here you go, master");
    expect(URGENT_TAP_WORDS).toBe("master, this one can't wait");
  });

  it("hangs each bubble over the agent's own head", () => {
    for (const state of [steppingOut[10], tapping[10]]) {
      const { at } = walker(state);
      const [bubble] = deliverySceneOf(state).speech;
      expect(bubble.over.x).toBe(Math.round(at.x));
      expect(bubble.over.y).toBeLessThan(Math.round(at.y) - 20);
    }
  });

  it("walks the path smoking, with the paperwork in its hands, faster than the manager walks", () => {
    expect(AGENT_PACE).toBeGreaterThan(MANAGER_PACE);
    for (const state of [...steppingOut, ...walkingOver, ...tapping, ...goingRound, ...puttingDown]) {
      expect(walker(state).carriesPaperwork, walker(state).doing).toBe(true);
    }
    for (const leg of [walkingOver, tapping, goingRound]) {
      expect(leg.some((state) => walker(state).smoke.length >= 3)).toBe(true);
    }
    // Whoever walks leaves a trail: puffs born earlier hang where it was then, behind it.
    const midWalk = walkingOver.find((state) => walker(state).facing === "right" && walker(state).smoke.length >= 3)!;
    const xs = walker(midWalk).smoke.map((puff) => puff.at.x);
    expect(Math.min(...xs)).toBeLessThan(Math.round(walker(midWalk).at.x));
  });

  it("walks home with empty hands and no cigarette", () => {
    for (const state of [...standingBack, ...walkingBack, ...goingIn]) {
      expect(walker(state)).toMatchObject({ carriesPaperwork: false, smoke: [] });
    }
  });

  it("flashes the red bulb on its antenna only while it has the urgent paperwork", () => {
    const flashes = storyOf(walkingOver, (state) => walker(state).look.bulb);
    expect(flashes.length).toBeGreaterThan(8);
    expect(new Set(flashes)).toEqual(new Set(["ember", "stone"]));
    for (const state of [...standingBack, ...walkingBack, ...goingIn]) expect(walker(state).look.bulb).toBe("stone");
  });

  it("taps the owner's shoulder from behind his chair, and the owner looks up while it lasts", () => {
    for (const state of states) {
      expect(deliverySceneOf(state).ownerIsBeingTapped).toBe(walker(state)?.activity === "tapping the shoulder");
    }
    for (const state of tapping) expect(walker(state)).toMatchObject({ at: agentTapSpot, facing: "right" });
    expect(agentTapSpot.x).toBeLessThan(desk.shoulderSpot.x);
    const hands = storyOf(tapping, (state) => walker(state).handOnShoulder);
    expect(hands.slice(0, 4)).toEqual([true, false, true, false]);
    for (const state of [...walkingOver, ...goingRound]) expect(walker(state).handOnShoulder).toBe(false);
  });

  it("drops it from the far end of the desk: the stack and the mark appear as it steps back, as they do for the manager", () => {
    const justBefore = puttingDown.at(-1)!;
    expect(deliverySceneOf(justBefore)).toMatchObject({ stack: [], markIsShowing: false });
    expect(walker(justBefore)).toMatchObject({ at: desk.dropOffSpot, facing: "left" });

    const steppedBack = standingBack[0];
    expect(walker(steppedBack)).toMatchObject({ at: desk.dropOffSpot, facing: "left" });
    expect(deliverySceneOf(steppedBack).stack).toMatchObject([{ key: urgent.key, isUrgent: true, from: REFUND_AGENT }]);
    expect(deliverySceneOf(steppedBack).markIsShowing).toBe(true);
    expect(deliveryMarksOf(steppedBack)).toMatchObject({ deskPapers: "1", deskMark: "showing" });
  });

  it("leaves the mark up until the desk is opened, and the stack until the request is answered", () => {
    const home = states.at(-1)!;
    expect(markIsShowing(home)).toBe(true);
    const opened = deliveryAfter(home, { type: "desk opened", atMs: home.atMs });
    expect(markIsShowing(opened)).toBe(false);
    expect(onTheDesk(opened)).toEqual([urgent.key]);
    const answered = heard(opened, opened.atMs + 1000, []);
    expect(onTheDesk(answered)).toEqual([]);
  });

  it("never steps off the paths and the paving, and never jumps from one place to another", () => {
    let before = walker(out[0]).at;
    for (const state of out) {
      const { at, doing } = walker(state);
      expect(canBeWalkedOn(Math.round(at.x), Math.round(at.y)), `${doing} at ${at.x},${at.y}`).toBe(true);
      expect(Math.abs(at.x - before.x) + Math.abs(at.y - before.y), doing).toBeLessThanOrEqual(1);
      before = at;
    }
  });

  it("swings its legs only while it moves", () => {
    for (const state of out) {
      expect(walker(state).stride === null, walker(state).doing).toBe(walker(state).activity !== "walking");
    }
    expect(new Set(walkingOver.map((state) => walker(state).stride))).toEqual(new Set([0, 1, 2, 3]));
  });

  it("is the same agent it is inside its house: its own colour, and worn out only if it shares the house", () => {
    for (const state of out) {
      expect(walker(state).name).toBe(REFUND_AGENT);
      expect(walker(state).look).toMatchObject({ stripe: agentColours[0], isWornOut: false });
    }
    const fromTheTeam = heard(openPage, NOBODY_AT_A_DOOR_MS, [paper("ask-2", "planner", TEAM_PROJECT)]);
    expect(deliverySceneOf(fromTheTeam).walkers).toMatchObject([
      { name: "planner", home: teamHouse, look: { stripe: agentColours[2], isWornOut: true } },
    ]);
  });
});

describe("a house shows that its agent is away while it walks", () => {
  const asked = decisionNeeded("01:00", "ask-1", APPROVAL_DESK, true);
  const village = villageWith([asked], "01:01");
  const start = deliveryFollowing(deliveryStartingAt(0), 0, villageWith([], "00:30"));
  const setOff = deliveryFollowing(start, 1000, village);
  const states = [setOff, ...playedTo(setOff, 1000 + WALK_AND_BACK_MS + 2000)];
  const away = (state: DeliveryState): string[] => agentsAwayFrom(state, APPROVAL_DESK);

  it("is away from the moment it steps out of the door until it has gone back in", () => {
    expect(away(start)).toEqual([]);
    expect(away(setOff)).toEqual([REFUND_AGENT]);
    for (const state of states) {
      const isOut = deliverySceneOf(state).walkers.length === 1;
      expect(away(state)).toEqual(isOut ? [REFUND_AGENT] : []);
      expect(agentsAwayFrom(state, TEAM_PROJECT)).toEqual([]);
    }
    expect(storyOf(states, away)).toEqual([[REFUND_AGENT], []]);
    expect(states.findLast((state) => away(state).length === 1)!.atMs).toBe(1000 + WALK_AND_BACK_MS - STEP_MS);
  });

  it("turns that agent's window off on the outside of its house, and says how many are out", () => {
    const everyoneIn = houseStatusFrom(approvalDeskHouse, village, away(start));
    expect(everyoneIn).toEqual(houseStatusFrom(approvalDeskHouse, village));
    expect(everyoneIn).toMatchObject({ litWindows: 0, softWindows: 1, isDark: false });
    expect(everyoneIn.agentsAway).toBeUndefined();

    const whileOut = houseStatusFrom(approvalDeskHouse, village, away(setOff));
    expect(whileOut).toMatchObject({ litWindows: 0, softWindows: 0, isDark: false, note: null, agentsAway: 1 });

    const backIn = houseStatusFrom(approvalDeskHouse, village, away(states.at(-1)!));
    expect(backIn).toEqual(everyoneIn);
  });

  it("shows its station empty inside its house, and says so in words", () => {
    const whileOut = insideOf(approvalDeskHouse, village, { awayAgents: away(setOff) });
    expect(whileOut.agents).toMatchObject([{ name: REFUND_AGENT, isAway: true }]);
    expect(describeInside(whileOut)).toContain(`${REFUND_AGENT} is away from its station`);

    const backIn = insideOf(approvalDeskHouse, village, { awayAgents: away(states.at(-1)!) });
    expect(backIn.agents).toMatchObject([{ name: REFUND_AGENT, isAway: false }]);
  });

  it("only empties the station of the one who is out", () => {
    const fromTheTeam = heard(openPage, NOBODY_AT_A_DOOR_MS, [paper("ask-2", "checker", TEAM_PROJECT)]);
    expect(agentsAwayFrom(fromTheTeam, TEAM_PROJECT)).toEqual(["checker"]);
    expect(agentsAwayFrom(fromTheTeam, APPROVAL_DESK)).toEqual([]);
  });
});

describe("everything that is not urgent still goes through the manager", () => {
  it("leaves an ordinary request at its house until his call, and no agent walks", () => {
    const ordinary = paper("ask-1", REFUND_AGENT, APPROVAL_DESK, false);
    const waiting = heard(openPage, 1000, [ordinary]);
    expect(placeOf(waiting, ordinary.key)).toBe("at the house");
    const states = playedTo(waiting, THREE_ROUNDS_MS);
    expect(states.every((state) => agentTripsOf(state).length === 0)).toBe(true);
    expect(storyOf(states, (state) => placeOf(state, ordinary.key))).toEqual([
      "at the house",
      "being handed over",
      "being carried",
      "on the desk",
    ]);
  });

  it("walks the urgent one over at once and leaves the ordinary one for his call", () => {
    const urgent = paper("ask-urgent");
    const ordinary = paper("ask-ordinary", REFUND_AGENT, APPROVAL_DESK, false);
    const setOff = heard(openPage, NOBODY_AT_A_DOOR_MS, [ordinary, urgent]);
    expect(setOff.paperwork.map((found) => [found.key, found.place, found.carrier])).toEqual([
      [ordinary.key, "at the house", null],
      [urgent.key, "being carried", carrierNameOf(APPROVAL_DESK, REFUND_AGENT)],
    ]);
    const states = playedTo(setOff, THREE_ROUNDS_MS);
    expect(storyOf(states, onTheDesk)).toEqual([[], [urgent.key], [urgent.key, ordinary.key]]);
    expect(storyOf(states, (state) => placeOf(state, ordinary.key))).toEqual([
      "at the house",
      "being handed over",
      "being carried",
      "on the desk",
    ]);
  });

  it("the hub never guesses who walks: urgent paperwork from someone who is not home waits for the manager", () => {
    const fromPlainCode = paper("ask-1", "system");
    const waiting = heard(openPage, 1000, [fromPlainCode]);
    expect(agentTripsOf(waiting)).toEqual([]);
    expect(placeOf(waiting, fromPlainCode.key)).toBe("at the house");
    const states = playedTo(waiting, THREE_ROUNDS_MS);
    expect(states.every((state) => agentTripsOf(state).length === 0)).toBe(true);
    expect(placeOf(states.at(-1)!, fromPlainCode.key)).toBe("on the desk");
  });

  it("news that does not say who is home sends nobody walking", () => {
    const unknown = deliveryAfter(deliveryStartingAt(0), { type: "news", atMs: 0, waiting: [] });
    const waiting = deliveryAfter(unknown, { type: "news", atMs: 1000, waiting: [paper("ask-1")] });
    expect(agentTripsOf(waiting)).toEqual([]);
    expect(placeOf(waiting, `${APPROVAL_DESK}/ask-1`)).toBe("at the house");
  });

  it("gets nothing handed over at a door whose only agent is out: he calls again next round", () => {
    const urgent = paper("ask-urgent");
    const ordinary = paper("ask-ordinary", REFUND_AGENT, APPROVAL_DESK, false);
    const waitStarts = roundStartOf(`waiting at ${APPROVAL_DESK}`);
    const setOff = heard(openPage, waitStarts - 5000, [urgent, ordinary]);
    expect(agentsAwayFrom(setOff, APPROVAL_DESK)).toEqual([REFUND_AGENT]);

    const hisCall = playedTo(setOff, roundStartOf(`walking to ${TEAM_PROJECT}`) + 100);
    expect(storyOf(hisCall, managerDoing)).toEqual([
      `walking to ${APPROVAL_DESK}`,
      `knocking at ${APPROVAL_DESK}`,
      `waiting at ${APPROVAL_DESK}`,
      `walking to ${TEAM_PROJECT}`,
    ]);
    expect(hisCall.every((state) => deliverySceneOf(state).agentsAtTheDoor.length === 0)).toBe(true);
    expect(placeOf(hisCall.at(-1)!, ordinary.key)).toBe("at the house");

    const later = playedTo(hisCall.at(-1)!, THREE_ROUNDS_MS);
    expect(storyOf(later, onTheDesk)).toEqual([[], [urgent.key], [urgent.key, ordinary.key]]);
  });
});

describe("when the manager is at that very door", () => {
  const urgent = paper("ask-1");

  it("he takes it himself while he waits there: nobody is quicker, and the agent stays in", () => {
    const waitingThere = roundStartOf(`waiting at ${APPROVAL_DESK}`) + 500;
    const handed = heard(openPage, waitingThere, [urgent]);
    expect(managerDoing(handed)).toBe(`being handed paperwork at ${APPROVAL_DESK}`);
    expect(placeOf(handed, urgent.key)).toBe("being handed over");
    const states = playedTo(handed, waitingThere + 40_000);
    expect(states.every((state) => agentTripsOf(state).length === 0)).toBe(true);
    expect(onTheDesk(states.at(-1)!)).toEqual([urgent.key]);
  });

  it("the agent waits out his knock and hands it over as he stops knocking", () => {
    const knocking = roundStartOf(`knocking at ${APPROVAL_DESK}`) + 300;
    const waiting = heard(openPage, knocking, [urgent]);
    expect(managerDoing(waiting)).toBe(`knocking at ${APPROVAL_DESK}`);
    expect(agentTripsOf(waiting)).toEqual([]);
    expect(placeOf(waiting, urgent.key)).toBe("at the house");

    const states = playedTo(waiting, knocking + 40_000);
    expect(storyOf(states, (state) => placeOf(state, urgent.key))).toEqual([
      "at the house",
      "being handed over",
      "being carried",
      "on the desk",
    ]);
    expect(tripOf(states.find((state) => tripOf(state, MANAGER))!, MANAGER)?.legStartedAtMs).toBe(
      roundStartOf(`waiting at ${APPROVAL_DESK}`),
    );
    expect(states.every((state) => agentTripsOf(state).length === 0)).toBe(true);
  });

  it("urgent paperwork heard while he is being handed the rest goes into his arms with it", () => {
    const ordinary = paper("ask-ordinary", REFUND_AGENT, APPROVAL_DESK, false);
    const played = playedTo(heard(openPage, 1000, [ordinary]), THREE_ROUNDS_MS);
    for (const [doing, place] of [
      ["being handed paperwork", "being handed over"],
      ["taking the paperwork", "being carried"],
    ]) {
      const atTheDoor = played.find((state) => managerDoing(state).startsWith(doing))!;
      const more = heard(atTheDoor, atTheDoor.atMs + 300, [ordinary, urgent]);
      expect(more.paperwork.map((found) => [found.key, found.place, found.carrier])).toEqual([
        [ordinary.key, place, MANAGER],
        [urgent.key, place, MANAGER],
      ]);

      const states = playedTo(more, more.atMs + 40_000);
      expect(states.every((state) => agentTripsOf(state).length === 0)).toBe(true);
      expect(storyOf(states, onTheDesk)).toEqual([[], [ordinary.key, urgent.key]]);
    }
  });

  it("an ordinary paper heard during a handover still waits for his next call, as it always did", () => {
    const first = paper("ask-first", REFUND_AGENT, APPROVAL_DESK, false);
    const late = paper("ask-late", REFUND_AGENT, APPROVAL_DESK, false);
    const handingOver = playedTo(heard(openPage, 1000, [first]), THREE_ROUNDS_MS).find((state) =>
      managerDoing(state).startsWith("being handed paperwork"),
    )!;
    const more = heard(handingOver, handingOver.atMs + 300, [first, late]);
    expect(placeOf(more, late.key)).toBe("at the house");
  });

  it("once he has walked off with his load, the agent walks the next urgent thing over itself", () => {
    const ordinary = paper("ask-ordinary", REFUND_AGENT, APPROVAL_DESK, false);
    const carrying = playedTo(heard(openPage, 1000, [ordinary]), THREE_ROUNDS_MS).find((state) =>
      managerDoing(state).startsWith("carrying paperwork"),
    )!;
    const more = heard(carrying, carrying.atMs + 300, [ordinary, urgent]);
    expect(agentsAwayFrom(more, APPROVAL_DESK)).toEqual([REFUND_AGENT]);
    expect(placeOf(more, urgent.key)).toBe("being carried");
    expect(placeOf(more, ordinary.key)).toBe("being carried");
    const states = playedTo(more, more.atMs + 40_000);
    expect(new Set(onTheDesk(states.at(-1)!))).toEqual(new Set([ordinary.key, urgent.key]));
    expect(states.at(-1)!.trips).toEqual([]);
  });
});

describe("an agent with more than one urgent thing", () => {
  const first = paper("ask-1");
  const second = paper("ask-2");
  const carrier = carrierNameOf(APPROVAL_DESK, REFUND_AGENT);

  it("carries everything urgent of its own in the one walk", () => {
    const setOff = heard(openPage, NOBODY_AT_A_DOOR_MS, [first, second]);
    expect(agentTripsOf(setOff).length).toBe(1);
    expect(setOff.paperwork.map((found) => found.carrier)).toEqual([carrier, carrier]);
    const states = playedTo(setOff, NOBODY_AT_A_DOOR_MS + WALK_AND_BACK_MS + 1000);
    expect(storyOf(states, onTheDesk)).toEqual([[], [first.key, second.key]]);
    expect(storyOf(states, (state) => deliverySceneOf(state).walkers.length)).toEqual([1, 0]);
  });

  it("goes out again for one that turns up while it is out, as soon as it is back", () => {
    const setOff = heard(openPage, NOBODY_AT_A_DOOR_MS, [first]);
    const midWalk = deliveryAfter(setOff, { type: "time passed", atMs: NOBODY_AT_A_DOOR_MS + 4000 });
    const more = heard(midWalk, midWalk.atMs, [first, second]);
    expect(placeOf(more, second.key)).toBe("at the house");
    expect(agentTripsOf(more).length).toBe(1);

    const states = playedTo(more, more.atMs + 2 * WALK_AND_BACK_MS + 2000);
    expect(storyOf(states, (state) => placeOf(state, second.key))).toEqual([
      "at the house",
      "being carried",
      "on the desk",
    ]);
    const secondWalk = states.find((state) => placeOf(state, second.key) === "being carried")!;
    expect(tripOf(secondWalk, carrier)?.legStartedAtMs).toBe(NOBODY_AT_A_DOOR_MS + WALK_AND_BACK_MS);
    expect(storyOf(states, onTheDesk)).toEqual([[], [first.key], [first.key, second.key]]);
    expect(states.at(-1)!.trips).toEqual([]);
  });

  it("is on one walk at a time", () => {
    const setOff = heard(openPage, NOBODY_AT_A_DOOR_MS, [first]);
    const states = playedTo(heard(setOff, NOBODY_AT_A_DOOR_MS + 100, [first, second]), THREE_ROUNDS_MS);
    expect(states.every((state) => agentTripsOf(state).length <= 1)).toBe(true);
  });
});

describe("two agents with something urgent at once", () => {
  const fromApprovalDesk = paper("ask-1");
  const fromTheTeam = paper("ask-2", "checker", TEAM_PROJECT);
  const both = heard(openPage, AFTER_HIS_LAST_CALL_MS, [fromTheTeam, fromApprovalDesk]);
  const states = [both, ...playedTo(both, AFTER_HIS_LAST_CALL_MS + 2 * WALK_AND_BACK_MS + 4000)];
  const carrying = (state: DeliveryState): string[] =>
    deliverySceneOf(state)
      .walkers.filter((walker) => walker.carriesPaperwork)
      .map((walker) => walker.name);

  it("go one at a time, the first heard of first, so only one is ever on its way to the desk", () => {
    expect(carrying(both)).toEqual(["checker"]);
    expect(placeOf(both, fromApprovalDesk.key)).toBe("at the house");
    for (const state of states) expect(carrying(state).length).toBeLessThanOrEqual(1);
    expect(storyOf(states, carrying)).toEqual([["checker"], [REFUND_AGENT], []]);
  });

  it("the second steps out the moment the first has put its paperwork down", () => {
    const secondSetsOff = states.find((state) => agentTripsOf(state).length === 2)!;
    const [first, second] = agentTripsOf(secondSetsOff);
    expect(first.legs[first.onLeg].activity).toBe("standing back");
    expect(second.legStartedAtMs).toBe(first.legStartedAtMs);
    expect(second.agent?.name).toBe(REFUND_AGENT);
    expect(onTheDesk(secondSetsOff)).toEqual([fromTheTeam.key]);
  });

  it("both land on the one stack, and both houses show their agent away meanwhile", () => {
    expect(storyOf(states, onTheDesk)).toEqual([
      [],
      [fromTheTeam.key],
      [fromTheTeam.key, fromApprovalDesk.key],
    ]);
    expect(storyOf(states, (state) => [agentsAwayFrom(state, TEAM_PROJECT), agentsAwayFrom(state, APPROVAL_DESK)])).toEqual([
      [["checker"], []],
      [["checker"], [REFUND_AGENT]],
      [[], [REFUND_AGENT]],
      [[], []],
    ]);
  });

  it("one still waiting its turn goes with the manager instead, if he calls at its door first", () => {
    // Heard as he leaves approval-desk: its agent walks, and his very next call is at the team's door.
    const heardOnHisWay = heard(openPage, NOBODY_AT_A_DOOR_MS, [fromApprovalDesk, fromTheTeam]);
    expect(carrying(heardOnHisWay)).toEqual([REFUND_AGENT]);
    const played = playedTo(heardOnHisWay, NOBODY_AT_A_DOOR_MS + 2 * WALK_AND_BACK_MS);
    expect(storyOf(played, (state) => placeOf(state, fromTheTeam.key))).toEqual([
      "at the house",
      "being handed over",
      "being carried",
      "on the desk",
    ]);
    expect(played.every((state) => agentsAwayFrom(state, TEAM_PROJECT).length === 0)).toBe(true);
    expect(new Set(onTheDesk(played.at(-1)!))).toEqual(new Set([fromApprovalDesk.key, fromTheTeam.key]));
  });

  it("two agents of one house take their turns the same way", () => {
    const twoOfTheTeam = heard(openPage, AFTER_HIS_LAST_CALL_MS, [
      paper("ask-3", "planner", TEAM_PROJECT),
      paper("ask-4", "builder", TEAM_PROJECT),
    ]);
    const played = [twoOfTheTeam, ...playedTo(twoOfTheTeam, AFTER_HIS_LAST_CALL_MS + 2 * WALK_AND_BACK_MS + 4000)];
    expect(storyOf(played, carrying)).toEqual([["planner"], ["builder"], []]);
    expect(onTheDesk(played.at(-1)!)).toEqual([`${TEAM_PROJECT}/ask-3`, `${TEAM_PROJECT}/ask-4`]);
  });
});

describe("what is already waiting when the page opens", () => {
  it("is on the desk from the first answer, urgent or not: nobody walks it over", () => {
    const opened = deliveryAfter(deliveryStartingAt(4200), {
      type: "news",
      atMs: 4200,
      waiting: [paper("ask-1"), paper("ask-2", "checker", TEAM_PROJECT)],
      agentsAtHome: AT_HOME,
    });
    expect(onTheDesk(opened).length).toBe(2);
    expect(markIsShowing(opened)).toBe(true);
    const states = [opened, ...playedTo(opened, 4200 + 30_000)];
    for (const state of states) {
      expect(state.trips).toEqual([]);
      expect(deliverySceneOf(state).walkers).toEqual([]);
      expect(agentsAwayFrom(state, APPROVAL_DESK)).toEqual([]);
    }
  });
});

describe("the urgent walk is worked out from what happened, and from nothing else", () => {
  const urgent = paper("ask-1");
  const setOff = heard(openPage, 1000, [urgent]);

  it("gives the same state for the same events, and never changes the state it was given", () => {
    const before = JSON.stringify(openPage);
    expect(heard(openPage, 1000, [urgent])).toEqual(setOff);
    expect(JSON.stringify(openPage)).toBe(before);
  });

  it("does not depend on how often the page steps it: one long step lands where many short ones do", () => {
    const twoAtOnce = heard(openPage, AFTER_HIS_LAST_CALL_MS, [urgent, paper("ask-2", "checker", TEAM_PROJECT)]);
    for (const toMs of [9000, 14_000, 21_000, 60_000].map((ms) => AFTER_HIS_LAST_CALL_MS + ms)) {
      const inOneStep = deliveryAfter(twoAtOnce, { type: "time passed", atMs: toMs });
      const inManySteps = playedTo(twoAtOnce, toMs, 10).at(-1)!;
      expect(inManySteps).toEqual(inOneStep);
    }
  });

  it("walks something over as soon as the feed marks it urgent, even if it was already waiting at the house", () => {
    const ordinary = heard(openPage, NOBODY_AT_A_DOOR_MS, [{ ...urgent, isUrgent: false }]);
    expect(agentTripsOf(ordinary)).toEqual([]);
    const nowUrgent = heard(ordinary, NOBODY_AT_A_DOOR_MS + 2000, [urgent]);
    expect(agentTripsOf(nowUrgent).length).toBe(1);
    expect(placeOf(nowUrgent, urgent.key)).toBe("being carried");
  });

  it("drops nothing and says nothing more when the request is answered while it walks, and still walks home", () => {
    const midWalk = deliveryAfter(setOff, { type: "time passed", atMs: 4000 });
    expect(deliverySceneOf(midWalk).walkers[0].carriesPaperwork).toBe(true);
    const answered = heard(midWalk, 4000, []);
    expect(answered.paperwork).toEqual([]);
    expect(deliverySceneOf(answered).walkers[0]).toMatchObject({ carriesPaperwork: false, smoke: [] });

    const rest = playedTo(answered, 1000 + WALK_AND_BACK_MS + 1000);
    expect(rest.every((state) => whatIsSaid(state).length === 0)).toBe(true);
    expect(rest.every((state) => onTheDesk(state).length === 0 && !markIsShowing(state))).toBe(true);
    expect(storyOf(rest, (state) => agentsAwayFrom(state, APPROVAL_DESK))).toEqual([[REFUND_AGENT], []]);
    expect(rest.at(-1)!.trips).toEqual([]);
  });

  it("H9: a hub that stops answering mid-walk does not stop the agent: it finishes and goes home", () => {
    const village = villageWith([decisionNeeded("01:00", "ask-1", APPROVAL_DESK, true)], "01:01");
    let state = deliveryFollowing(deliveryFollowing(deliveryStartingAt(0), 0, villageWith([], "00:30")), 1000, village);
    expect(agentsAwayFrom(state, APPROVAL_DESK)).toEqual([REFUND_AGENT]);
    for (let atMs = 1000 + STEP_MS; atMs <= 1000 + WALK_AND_BACK_MS + 1000; atMs += STEP_MS) {
      state = deliveryFollowing(state, atMs, "unreachable");
    }
    expect(onTheDesk(state)).toEqual([`${APPROVAL_DESK}/ask-1`]);
    expect(state.trips).toEqual([]);
  });

  it("H9: urgent paperwork of a project the village has no house for sends nobody anywhere", () => {
    const stray = paper("ask-1", "helper", "no-such-house");
    const waiting = deliveryAfter(openPage, {
      type: "news",
      atMs: 1000,
      waiting: [stray],
      agentsAtHome: new Map([...AT_HOME, ["no-such-house", ["helper"]]]),
    });
    expect(waiting.trips).toEqual([]);
    expect(playedTo(waiting, 30_000).every((state) => state.trips.length === 0)).toBe(true);
  });
});

describe("the hub's own answer, played as the page plays it", () => {
  it("reads who is home from the village's state, in the order each house seats them", () => {
    const village = villageWith(
      [
        decisionNeeded("01:00", "ask-1"),
        resultReady("01:10", "report-1"),
        feedLine({ at: "01:20", project: TEAM_PROJECT, agent: "checker" }),
      ],
      "02:00",
    );
    expect(agentsAtHomeOf(village)).toEqual(
      new Map([
        [APPROVAL_DESK, [REFUND_AGENT]],
        [TEAM_PROJECT, ["builder", "checker"]],
      ]),
    );
    expect(agentsAtHomeOf(village)).toBe(agentsAtHomeOf(village));
  });

  it("the approval-desk demo day's own urgent refund sends its refund agent walking, and its ordinary one waits", () => {
    const dayStarts = dayStartOf(approvalDeskScript);
    const lines = daysOf(approvalDeskScript, 1, dayStarts);
    const at = (minutes: number, seconds: number) =>
      villageStateAt({
        projects: projectsOf(houseList),
        lines,
        now: new Date(dayStarts.getTime() + (minutes * 60 + seconds) * 1000),
      });
    const before = at(6, 0);
    const after = at(6, 11);
    const urgentLine = after.projects[0].waiting.find((item) => item.isUrgent)!;
    expect(urgentLine.line.what).toContain("flower refund");
    expect(before.projects[0].waiting.some((item) => item.isUrgent)).toBe(false);

    // The page opens at six minutes into the day; eleven seconds on, the urgent line arrives.
    const opened = deliveryFollowing(deliveryStartingAt(NOBODY_AT_A_DOOR_MS), NOBODY_AT_A_DOOR_MS, before);
    const alreadyThere = onTheDesk(opened);
    const heardIt = deliveryFollowing(opened, NOBODY_AT_A_DOOR_MS + 11_000, after);
    const agent = urgentLine.line.agent;
    expect(agentsAwayFrom(heardIt, APPROVAL_DESK)).toEqual([agent]);
    expect(describeAgentsOut(heardIt)).toBe(`${agent} is stepping out of ${APPROVAL_DESK} with urgent paperwork.`);

    let state = heardIt;
    for (let atMs = heardIt.atMs + STEP_MS; atMs <= heardIt.atMs + WALK_AND_BACK_MS + 1000; atMs += STEP_MS) {
      state = deliveryFollowing(state, atMs, after);
    }
    expect(onTheDesk(state)).toEqual([...alreadyThere, `${APPROVAL_DESK}/${urgentLine.line.id}`]);
    expect(agentsAwayFrom(state, APPROVAL_DESK)).toEqual([]);
  });
});

describe("the urgent walk in plain words", () => {
  const urgent = paper("ask-1");
  const setOff = heard(openPage, 1000, [urgent]);
  const states = [setOff, ...playedTo(setOff, 1000 + WALK_AND_BACK_MS + 1000)];

  it("says nothing while every agent is home", () => {
    expect(describeAgentsOut(openPage)).toBe("");
    expect(deliveryMarksOf(openPage).agentsOut).toBe("");
    expect(describeAgentsOut(states.at(-1)!)).toBe("");
  });

  it("tells what each agent out of its house is doing, one sentence each, in the order they set off", () => {
    expect(storyOf(states, describeAgentsOut)).toEqual([
      ...walkOf(APPROVAL_DESK).map((doing) => `${REFUND_AGENT} is ${doing}.`),
      "",
    ]);
    const two = heard(openPage, AFTER_HIS_LAST_CALL_MS, [urgent, paper("ask-2", "checker", TEAM_PROJECT)]);
    const bothOut = playedTo(two, AFTER_HIS_LAST_CALL_MS + WALK_AND_BACK_MS).find((state) => agentTripsOf(state).length === 2)!;
    expect(describeAgentsOut(bothOut)).toBe(
      `${REFUND_AGENT} is standing back from the desk. checker is stepping out of ${TEAM_PROJECT} with urgent paperwork.`,
    );
  });

  it("is part of the whole handover's words, between the manager and what waits", () => {
    expect(describeDelivery(setOff)).toBe(
      `The manager is walking to ${APPROVAL_DESK}. ${REFUND_AGENT} is stepping out of ${APPROVAL_DESK} with urgent paperwork. Nothing is waiting on the desk.`,
    );
    expect(deliveryMarksOf(setOff)).toMatchObject({
      agentsOut: `${REFUND_AGENT} is stepping out of ${APPROVAL_DESK} with urgent paperwork.`,
      deskPapers: "0",
      deskMark: "cleared",
    });
  });

  it("says whose turn an urgent paper still at its house is waiting for", () => {
    const two = heard(openPage, NOBODY_AT_A_DOOR_MS, [urgent, paper("ask-2", "checker", TEAM_PROJECT)]);
    expect(describeDelivery(two)).toContain(
      `1 urgent paper waits at ${TEAM_PROJECT} for its agent to walk it over.`,
    );
    expect(describeDelivery(two)).not.toContain("for his next call");
  });

  it("H12: never shows a rule code or a line's id", () => {
    for (const words of storyOf(states, describeDelivery)) {
      expect(words).not.toMatch(/\b[HQ]\d{1,2}\b/);
      expect(words).not.toContain("ask-1");
      expect(words).not.toContain("/");
    }
    expect(URGENT_TAP_WORDS).not.toMatch(/\b[HQ]\d{1,2}\b/);
  });
});
