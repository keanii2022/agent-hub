import { housesToVisit, type PlacedHouse } from "../../houses/place";
import { plazaLayout, type Point } from "../../plaza/layout";
import {
  msToWalk,
  routeBetween,
  stridePartAt,
  walkerAt,
  type Facing,
  type Route,
  type StridePart,
} from "../../routes";

// The manager's round: from the desk to every house with a project in it, in
// the order of the house list, and back. The round is a list of legs built
// from the houses it is given, and where he is comes from the clock alone, so
// the same time and the same houses always find him doing the same thing.

/** Village pixels a second: an unhurried walk. */
export const MANAGER_PACE = 22;
/** How far he moves on each quarter of a walk cycle. */
export const MANAGER_STRIDE_PART_PIXELS = 5;

export const KNOCKS_AT_A_DOOR = 3;
export const KNOCK_EVERY_MS = 400;
/** How long his knuckles stay on the door at each knock. */
export const KNUCKLES_ON_DOOR_MS = 150;
export const WAIT_AT_A_DOOR_MS = 2400;
export const REST_AT_THE_DESK_MS = 4000;

/** Where the round starts and ends: behind the human's chair, facing him. */
export const managerHome: { readonly at: Point; readonly facing: Facing } = {
  at: plazaLayout.desk.visitorSpot,
  facing: "right",
};

export type ManagerActivity = "walking" | "knocking" | "waiting" | "at the desk";

export type WalkLeg = {
  readonly activity: "walking";
  /** What he is doing, in plain words. */
  readonly doing: string;
  /** The house this walk ends at; null when it ends at the desk. */
  readonly headingFor: PlacedHouse | null;
  readonly route: Route;
  readonly lastsMs: number;
};

export type StandingLeg = {
  readonly activity: Exclude<ManagerActivity, "walking">;
  readonly doing: string;
  /** The house whose door he stands at; null at the desk. */
  readonly atHouse: PlacedHouse | null;
  readonly at: Point;
  readonly facing: Facing;
  readonly lastsMs: number;
};

export type RoundLeg = WalkLeg | StandingLeg;

export type ManagerRound = {
  readonly legs: readonly RoundLeg[];
  readonly lastsMs: number;
};

export function walkLeg(from: Point, to: Point, doing: string, headingFor: PlacedHouse | null): WalkLeg {
  const route = routeBetween(from, to);
  // Whole milliseconds, so the legs of a round add up exactly and no moment falls between two of them.
  const lastsMs = Math.ceil(msToWalk(route, MANAGER_PACE));
  return { activity: "walking", doing, headingFor, route, lastsMs };
}

/** Everything he does for one house: walk to its door from wherever he is, knock, wait. */
export function legsOfACall(house: PlacedHouse, from: Point): RoundLeg[] {
  const atTheDoor = { atHouse: house, at: house.doorstep, facing: "up" } as const;
  return [
    walkLeg(from, house.doorstep, `walking to ${house.name}`, house),
    {
      ...atTheDoor,
      activity: "knocking",
      doing: `knocking at ${house.name}`,
      lastsMs: KNOCKS_AT_A_DOOR * KNOCK_EVERY_MS,
    },
    { ...atTheDoor, activity: "waiting", doing: `waiting at ${house.name}`, lastsMs: WAIT_AT_A_DOOR_MS },
  ];
}

/** The walk home from the last door, and the rest at the desk before the next round. */
export function legsOfTheReturn(from: Point): RoundLeg[] {
  return [
    walkLeg(from, managerHome.at, "walking back to the desk", null),
    {
      activity: "at the desk",
      doing: "standing at the desk",
      atHouse: null,
      ...managerHome,
      lastsMs: REST_AT_THE_DESK_MS,
    },
  ];
}

function buildRound(houses: readonly PlacedHouse[]): ManagerRound {
  const legs: RoundLeg[] = [];
  let standingAt = managerHome.at;
  for (const house of housesToVisit(houses)) {
    legs.push(...legsOfACall(house, standingAt));
    standingAt = house.doorstep;
  }
  legs.push(...legsOfTheReturn(standingAt));
  return { legs, lastsMs: legs.reduce((total, leg) => total + leg.lastsMs, 0) };
}

// Finding the routes costs more than a frame should, and a house list never
// changes once placed, so each list's round is worked out once.
const roundsByHouseList = new WeakMap<readonly PlacedHouse[], ManagerRound>();

/** The round for a list of houses: a call at every house with a project in it, in list order, then home. */
export function managerRoundFor(houses: readonly PlacedHouse[]): ManagerRound {
  let round = roundsByHouseList.get(houses);
  if (!round) {
    round = buildRound(houses);
    roundsByHouseList.set(houses, round);
  }
  return round;
}

/** Everything the manager is doing at one moment, as plain data. Drawing reads this and nothing else. */
export type ManagerState = {
  readonly activity: ManagerActivity;
  /** What he is doing in plain words, for example "walking to approval-desk". */
  readonly doing: string;
  /** The middle of his feet. Keeps in-between positions while he walks; drawing rounds them. */
  readonly at: Point;
  readonly facing: Facing;
  /** The house whose door he is standing at; null on the way and at the desk. */
  readonly atHouse: PlacedHouse | null;
  /** The house he is walking to; null when he is standing somewhere or walking back. */
  readonly headingFor: PlacedHouse | null;
  /** Where his legs are in the walk cycle; null while he stands. */
  readonly stride: StridePart | null;
  /** True for the moment of each knock that his knuckles are on the door. */
  readonly knucklesOnDoor: boolean;
  /** Which leg of the round he is on, counted from 0. */
  readonly legNumber: number;
  /** Rounds finished since time zero. */
  readonly roundsDone: number;
};

function stateOnLeg(leg: RoundLeg, msIntoLeg: number): Omit<ManagerState, "legNumber" | "roundsDone"> {
  if (leg.activity === "walking") {
    const place = walkerAt(leg.route, msIntoLeg, MANAGER_PACE);
    return {
      activity: leg.activity,
      doing: leg.doing,
      at: place.at,
      facing: place.facing,
      atHouse: null,
      headingFor: leg.headingFor,
      stride: stridePartAt(place.walked, MANAGER_STRIDE_PART_PIXELS),
      knucklesOnDoor: false,
    };
  }
  return {
    activity: leg.activity,
    doing: leg.doing,
    at: leg.at,
    facing: leg.facing,
    atHouse: leg.atHouse,
    headingFor: null,
    stride: null,
    knucklesOnDoor: leg.activity === "knocking" && msIntoLeg % KNOCK_EVERY_MS < KNUCKLES_ON_DOOR_MS,
  };
}

/** When each leg of a round starts, in ms from the start of the round. */
export function legStartsOf(round: ManagerRound): number[] {
  let startsAtMs = 0;
  return round.legs.map((leg) => {
    const start = startsAtMs;
    startsAtMs += leg.lastsMs;
    return start;
  });
}

export function managerStateAt(timeMs: number, houses: readonly PlacedHouse[]): ManagerState {
  const round = managerRoundFor(houses);
  const time = Math.max(0, timeMs);
  const roundsDone = Math.floor(time / round.lastsMs);
  let msIntoLeg = time - roundsDone * round.lastsMs;

  for (let legNumber = 0; legNumber < round.legs.length; legNumber += 1) {
    const leg = round.legs[legNumber];
    if (msIntoLeg < leg.lastsMs) {
      return { ...stateOnLeg(leg, msIntoLeg), legNumber, roundsDone };
    }
    msIntoLeg -= leg.lastsMs;
  }
  throw new Error("The manager's round has no legs");
}

/** One plain sentence about the round, for whoever cannot see the picture. */
export function describeManagersRound(houses: readonly PlacedHouse[]): string {
  const names = housesToVisit(houses).map((house) => house.name);
  if (names.length === 0) return "The manager waits at the desk: no house has anyone to call on.";
  const doors =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", then ")} and then ${names[names.length - 1]}`;
  return `The manager walks his round from the desk: he knocks at ${doors}, waits at each door, and walks back.`;
}
