import type { ColourName } from "../../engine";
import type { PlacedHouse } from "../../houses/place";
import { agentColours } from "../../interiors/stations";
import type { Point } from "../../plaza/layout";
import { msToWalk, stridePartAt, walkerAt, type Facing, type Route, type StridePart } from "../../routes";
import {
  HAND_ON_SHOULDER_MS,
  SHOULDER_TAP_EVERY_MS,
  smokeRisingFrom,
  type ManagerActivity,
  type RoundLeg,
  type SmokePuff,
  type WalkLeg,
} from "../manager";
import { AGENT_WIDTH, agentPoints, type AgentLook } from "./sprites";

// An agent only leaves its house with something urgent, so it walks faster
// than the manager does. Like him, where it is comes from the leg it is on and
// the time into it: the same moment always finds it on the same spot.

/** Village pixels a second: a hurry, next to the manager's 22. */
export const AGENT_PACE = 30;
/** How far it moves on each quarter of a walk cycle. */
export const AGENT_STRIDE_PART_PIXELS = 4;

function runLength(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/**
 * A walk through exactly these corners, for a walk that is not the shortest
 * one: an agent goes round the desk by the back. Each run between two corners
 * must be level or upright and longer than nothing.
 */
export function routeThrough(corners: readonly Point[]): Route {
  corners.slice(1).forEach((to, index) => {
    const from = corners[index];
    if ((from.x !== to.x && from.y !== to.y) || runLength(from, to) === 0) {
      throw new Error(`A walk cannot go straight from ${from.x},${from.y} to ${to.x},${to.y}`);
    }
  });
  return {
    points: corners,
    length: corners.slice(1).reduce((total, to, index) => total + runLength(corners[index], to), 0),
  };
}

/** One walk of an agent's trip, at an agent's pace. `headingFor` is the house it ends at; null at the desk. */
export function agentWalkLeg(route: Route, doing: string, headingFor: PlacedHouse | null): WalkLeg {
  // Whole milliseconds, so the legs of a trip add up exactly and no moment falls between two of them.
  return { activity: "walking", doing, headingFor, route, lastsMs: Math.ceil(msToWalk(route, AGENT_PACE)) };
}

/** Where an agent is and how it stands at one moment of a leg, whatever it has in its hands. */
export type AgentOnLeg = {
  readonly activity: ManagerActivity;
  /** What it is doing, in plain words. */
  readonly doing: string;
  /** The middle of its feet. Keeps in-between positions while it walks; drawing rounds them. */
  readonly at: Point;
  readonly facing: Facing;
  /** Where its legs are in the walk cycle; null while it stands. */
  readonly stride: StridePart | null;
  /** True for the moment of each tap that its hand is on the owner's shoulder. */
  readonly handOnShoulder: boolean;
};

export function agentOnLeg(leg: RoundLeg, msIntoLeg: number): AgentOnLeg {
  if (leg.activity === "walking") {
    const place = walkerAt(leg.route, msIntoLeg, AGENT_PACE);
    return {
      activity: leg.activity,
      doing: leg.doing,
      at: place.at,
      facing: place.facing,
      stride: stridePartAt(place.walked, AGENT_STRIDE_PART_PIXELS),
      handOnShoulder: false,
    };
  }
  return {
    activity: leg.activity,
    doing: leg.doing,
    at: leg.at,
    facing: leg.facing,
    stride: null,
    handOnShoulder:
      leg.activity === "tapping the shoulder" && msIntoLeg % SHOULDER_TAP_EVERY_MS < HAND_ON_SHOULDER_MS,
  };
}

/** The top left of the box an agent standing on `at` is drawn in. Facing left, the box is mirrored about its feet. */
export function agentBoxAt(at: Point, facing: Facing): Point {
  const feetAcross = facing === "left" ? AGENT_WIDTH - 1 - agentPoints.feet.x : agentPoints.feet.x;
  return { x: Math.round(at.x) - feetAcross, y: Math.round(at.y) - agentPoints.feet.y };
}

function cigaretteTipAt(leg: RoundLeg, msIntoLeg: number): Point {
  const { at, facing } = agentOnLeg(leg, msIntoLeg);
  const tip = agentPoints.cigaretteTip[facing === "up" || facing === "down" ? facing : "side"];
  const box = agentBoxAt(at, facing);
  return { x: box.x + (facing === "left" ? AGENT_WIDTH - 1 - tip.x : tip.x), y: box.y + tip.y };
}

/** The puffs in the air `msIntoLeg` after an agent started a leg with a lit cigarette. */
export function agentSmokeOn(leg: RoundLeg, msIntoLeg: number): SmokePuff[] {
  return smokeRisingFrom((bornAtMs) => cigaretteTipAt(leg, bornAtMs), msIntoLeg);
}

/**
 * The colour of the agent at a place in its house, counted from 0 in the order
 * the house seats them: the colour of its station and its card inside.
 */
export function colourOfAgentAt(placeInHouse: number): ColourName {
  return agentColours[Math.max(0, placeInHouse) % agentColours.length];
}

const BULB_BLINK_MS = 250;

/**
 * How an agent out of its house looks at one moment. With urgent paperwork in
 * its hands the bulb on its antenna flashes red, the colour of an urgent
 * paper's tab; empty-handed it is dark, as it is on an agent between jobs.
 */
export function agentLookAt(
  timeMs: number,
  placeInHouse: number,
  isWornOut: boolean,
  carriesPaperwork: boolean,
): AgentLook {
  const flashIsOn = Math.floor(Math.max(0, timeMs) / BULB_BLINK_MS) % 2 === 0;
  return {
    stripe: colourOfAgentAt(placeInHouse),
    isWornOut,
    bulb: carriesPaperwork && flashIsOn ? "ember" : "stone",
  };
}

/** Everything an agent out of its house is doing at one moment, as plain data. Drawing reads this and nothing else. */
export type WalkingAgent = AgentOnLeg & {
  readonly name: string;
  /** The house it lives in: the one it left and walks back to. */
  readonly home: PlacedHouse;
  readonly carriesPaperwork: boolean;
  /** Puffs from its cigarette: it smokes while it carries. */
  readonly smoke: readonly SmokePuff[];
  readonly look: AgentLook;
};
