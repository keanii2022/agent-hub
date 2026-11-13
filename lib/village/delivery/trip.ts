import { agentWalkLeg, routeThrough } from "../characters/agent";
import { managerHome, walkLeg, type RoundLeg, type WalkLeg } from "../characters/manager";
import type { PlacedHouse } from "../houses/place";
import { desk, type Point } from "../plaza/layout";
import { routeBetween, wayRoundTheDesk } from "../routes";

// One trip to the desk with paperwork, as a list of legs. Each leg says where
// the paperwork is while it lasts, so whoever follows the trip never has to
// know who is carrying or how: a later carrier brings its own legs.

/** The owner's own words. Never reworded. */
export const HANDOVER_WORDS = "oh snap, master has to see this";
export const SHOULDER_TAP_WORDS = "here you go, master";

export const HANDOVER_MS = 2600;
export const TAKING_MS = 700;
export const SHOULDER_TAP_MS = 2400;
export const PUT_DOWN_MS = 700;
export const STAND_BACK_MS = 800;

/** Where paperwork can be once someone has come for it. */
export type PlaceOnATrip = "being handed over" | "being carried" | "on the desk";

export type Speaker = "the agent at the door" | "the carrier";

export type TripLeg = RoundLeg & {
  /** Where the trip's paperwork is for as long as this leg lasts. */
  readonly paperworkIs: PlaceOnATrip;
  readonly smokes: boolean;
  /** Words shown in a bubble for the whole leg; null for a silent one. */
  readonly says: { readonly who: Speaker; readonly words: string } | null;
};

const quietly = { smokes: false, says: null } as const;

/**
 * The manager's trip from a house's door to the desk: the agent hands the
 * paperwork over, he walks it to the owner smoking, taps his shoulder, goes
 * round the desk, puts it on the stack and steps back. `thenOn` is the walk
 * his round would have taken from that door; he takes it from the desk instead.
 */
export function legsOfTheManagersTrip(house: PlacedHouse, thenOn: WalkLeg): TripLeg[] {
  // He turns from the door to the agent, who has stepped out beside it.
  const atTheDoor = { atHouse: house, at: house.doorstep, facing: "left" } as const;
  const behindTheOwner = { atHouse: null, at: desk.visitorSpot, facing: "right" } as const;
  const atTheStack = { atHouse: null, at: desk.dropOffSpot, facing: "left" } as const;
  const goesOnTo = thenOn.headingFor?.doorstep ?? managerHome.at;

  return [
    {
      ...atTheDoor,
      activity: "being handed paperwork",
      doing: `being handed paperwork at ${house.name}`,
      lastsMs: HANDOVER_MS,
      paperworkIs: "being handed over",
      smokes: false,
      says: { who: "the agent at the door", words: HANDOVER_WORDS },
    },
    {
      ...atTheDoor,
      activity: "taking paperwork",
      doing: `taking the paperwork at ${house.name}`,
      lastsMs: TAKING_MS,
      paperworkIs: "being carried",
      ...quietly,
    },
    {
      ...walkLeg(house.doorstep, desk.visitorSpot, `carrying paperwork from ${house.name} to the desk`, null),
      paperworkIs: "being carried",
      smokes: true,
      says: null,
    },
    {
      ...behindTheOwner,
      activity: "tapping the shoulder",
      doing: "tapping the owner on the shoulder",
      lastsMs: SHOULDER_TAP_MS,
      paperworkIs: "being carried",
      smokes: true,
      says: { who: "the carrier", words: SHOULDER_TAP_WORDS },
    },
    {
      ...walkLeg(desk.visitorSpot, desk.dropOffSpot, "walking round the desk with the paperwork", null),
      paperworkIs: "being carried",
      smokes: true,
      says: null,
    },
    {
      ...atTheStack,
      activity: "putting paperwork down",
      doing: "putting the paperwork on the desk",
      lastsMs: PUT_DOWN_MS,
      paperworkIs: "being carried",
      ...quietly,
    },
    {
      ...atTheStack,
      activity: "standing back",
      doing: "standing back from the desk",
      lastsMs: STAND_BACK_MS,
      paperworkIs: "on the desk",
      ...quietly,
    },
    {
      ...walkLeg(desk.dropOffSpot, goesOnTo, thenOn.doing, thenOn.headingFor),
      paperworkIs: "on the desk",
      ...quietly,
    },
  ];
}

/** What an agent says with its hand on the owner's shoulder. Not the owner's words: written to sit beside them. */
export const URGENT_TAP_WORDS = "master, this one can't wait";

export const STEP_OUT_MS = 1400;
export const GO_BACK_IN_MS = 500;

/**
 * Where an agent stands to tap the owner: on the same lane as the manager's
 * place behind the chair, a few rows further back, so that when both are
 * there its head still shows over his hat. Its arm reaches the rest of the way.
 */
export const agentTapSpot: Point = { x: desk.visitorSpot.x, y: desk.visitorSpot.y - 8 };

/** The far corner of the way round the desk, behind it: an agent goes on that way, clear of the manager's place. */
const behindTheFarEndOfTheDesk: Point = { x: desk.dropOffSpot.x, y: wayRoundTheDesk.y };

/**
 * An agent's own trip with urgent paperwork: out of its door saying the
 * agent's line, along the paths to the desk smoking, a tap on the owner's
 * shoulder, round the desk, the paperwork onto the stack, and home again.
 */
export function legsOfAnAgentsWalk(house: PlacedHouse): TripLeg[] {
  const atTheDoor = { atHouse: house, at: house.doorstep } as const;
  const atTheStack = { atHouse: null, at: desk.dropOffSpot, facing: "left" } as const;

  return [
    {
      ...atTheDoor,
      facing: "down",
      activity: "stepping out",
      doing: `stepping out of ${house.name} with urgent paperwork`,
      lastsMs: STEP_OUT_MS,
      paperworkIs: "being carried",
      smokes: false,
      says: { who: "the carrier", words: HANDOVER_WORDS },
    },
    {
      ...agentWalkLeg(
        routeBetween(house.doorstep, agentTapSpot),
        `walking urgent paperwork from ${house.name} to the desk`,
        null,
      ),
      paperworkIs: "being carried",
      smokes: true,
      says: null,
    },
    {
      atHouse: null,
      at: agentTapSpot,
      facing: "right",
      activity: "tapping the shoulder",
      doing: "tapping the owner on the shoulder",
      lastsMs: SHOULDER_TAP_MS,
      paperworkIs: "being carried",
      smokes: true,
      says: { who: "the carrier", words: URGENT_TAP_WORDS },
    },
    {
      ...agentWalkLeg(
        routeThrough([...routeBetween(agentTapSpot, behindTheFarEndOfTheDesk).points, desk.dropOffSpot]),
        "walking round the desk with the paperwork",
        null,
      ),
      paperworkIs: "being carried",
      smokes: true,
      says: null,
    },
    {
      ...atTheStack,
      activity: "putting paperwork down",
      doing: "putting the paperwork on the desk",
      lastsMs: PUT_DOWN_MS,
      paperworkIs: "being carried",
      ...quietly,
    },
    {
      ...atTheStack,
      activity: "standing back",
      doing: "standing back from the desk",
      lastsMs: STAND_BACK_MS,
      paperworkIs: "on the desk",
      ...quietly,
    },
    {
      ...agentWalkLeg(routeBetween(desk.dropOffSpot, house.doorstep), `walking back to ${house.name}`, house),
      paperworkIs: "on the desk",
      ...quietly,
    },
    {
      ...atTheDoor,
      facing: "up",
      activity: "going back in",
      doing: `going back into ${house.name}`,
      lastsMs: GO_BACK_IN_MS,
      paperworkIs: "on the desk",
      ...quietly,
    },
  ];
}
