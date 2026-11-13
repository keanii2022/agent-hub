import {
  MANAGER_HEIGHT,
  managerOnLeg,
  managerSmokeOn,
  managerStateAt,
  type ManagerState,
} from "../characters/manager";
import type { PlacedHouse } from "../houses/place";
import { villageHouses } from "../houses/village";
import type { Point } from "../plaza/layout";
import { DOOR_AGENT_HEIGHT } from "./sprites";
import {
  MANAGER,
  managersRoundMsOf,
  markIsShowing,
  paperworkOf,
  paperworkOnTheDesk,
  tripOf,
  type DeliveryState,
  type Paperwork,
  type Trip,
} from "./state";

// Everything the picture needs to know about the paperwork at one moment, read
// off a delivery state. Drawing reads a scene and nothing else.

export type SpeechBubble = {
  readonly words: string;
  /** Where the bubble's tail ends: just over the speaker's head. */
  readonly over: Point;
};

/** An agent who has stepped out beside its door to hand paperwork over. */
export type AgentAtTheDoor = {
  readonly house: PlacedHouse;
  /** The middle of its feet. */
  readonly at: Point;
  readonly holdsPaperwork: boolean;
};

export type DeliveryScene = {
  /** On his round, or on a trip to the desk. On a trip, `legNumber` is the leg his round picks up at. */
  readonly manager: ManagerState;
  /** The paperwork on the desk, bottom of the stack first. */
  readonly stack: readonly Paperwork[];
  readonly markIsShowing: boolean;
  /** The mark bobs: true while it is up a pixel. */
  readonly markIsRaised: boolean;
  readonly agentsAtTheDoor: readonly AgentAtTheDoor[];
  readonly speech: readonly SpeechBubble[];
  /** Someone has a hand on the owner's shoulder, so he looks up from his screen. */
  readonly ownerIsBeingTapped: boolean;
};

const MARK_BOB_MS = 500;
/** How far to the left of the door's middle the agent stands, clear of whoever is on the doorstep. */
const AGENT_STANDS_LEFT_OF_DOOR = 15;

export function doorAgentSpot(house: PlacedHouse): Point {
  return { x: house.doorstep.x - AGENT_STANDS_LEFT_OF_DOOR, y: house.doorstep.y };
}

function managerIn(state: DeliveryState, houses: readonly PlacedHouse[]): ManagerState {
  const onHisRound = managerStateAt(managersRoundMsOf(state), houses);
  const trip = tripOf(state, MANAGER);
  if (!trip) return onHisRound;

  const leg = trip.legs[trip.onLeg];
  const msIntoLeg = state.atMs - trip.legStartedAtMs;
  return {
    ...managerOnLeg(leg, msIntoLeg),
    carriesPaperwork: leg.paperworkIs === "being carried" && paperworkOf(state, MANAGER).length > 0,
    smoke: leg.smokes ? managerSmokeOn(leg, msIntoLeg) : [],
    legNumber: onHisRound.legNumber,
    roundsDone: onHisRound.roundsDone,
  };
}

function agentAtTheDoorOf(state: DeliveryState, trip: Trip): AgentAtTheDoor[] {
  const leg = trip.legs[trip.onLeg];
  if (leg.activity === "walking" || leg.atHouse === null) return [];
  return [
    {
      house: leg.atHouse,
      at: doorAgentSpot(leg.atHouse),
      holdsPaperwork: leg.paperworkIs === "being handed over" && paperworkOf(state, trip.carrier).length > 0,
    },
  ];
}

function speechOf(state: DeliveryState, trip: Trip, manager: ManagerState): SpeechBubble[] {
  const leg = trip.legs[trip.onLeg];
  // Paperwork that stopped waiting on the way leaves nothing to talk about.
  if (!leg.says || paperworkOf(state, trip.carrier).length === 0) return [];
  if (leg.says.who === "the agent at the door") {
    if (leg.activity === "walking" || leg.atHouse === null) return [];
    const agent = doorAgentSpot(leg.atHouse);
    return [{ words: leg.says.words, over: { x: agent.x, y: agent.y - DOOR_AGENT_HEIGHT - 1 } }];
  }
  // Step 14's carriers will have places of their own; today the only carrier is the manager.
  if (trip.carrier !== MANAGER) return [];
  return [
    {
      words: leg.says.words,
      over: { x: Math.round(manager.at.x), y: Math.round(manager.at.y) - MANAGER_HEIGHT - 1 },
    },
  ];
}

export function deliverySceneOf(
  state: DeliveryState,
  houses: readonly PlacedHouse[] = villageHouses,
): DeliveryScene {
  const manager = managerIn(state, houses);
  return {
    manager,
    stack: paperworkOnTheDesk(state),
    markIsShowing: markIsShowing(state),
    markIsRaised: Math.floor(state.atMs / MARK_BOB_MS) % 2 === 1,
    agentsAtTheDoor: state.trips.flatMap((trip) => agentAtTheDoorOf(state, trip)),
    speech: state.trips.flatMap((trip) => speechOf(state, trip, manager)),
    ownerIsBeingTapped: state.trips.some((trip) => trip.legs[trip.onLeg].activity === "tapping the shoulder"),
  };
}
