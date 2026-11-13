import type { ColourName } from "../engine";
import type { RobotLook } from "./sprites";
import type { InsideAgent } from "./state";

// What one station is doing at one moment, worked out from the clock and the
// agent's news. The same time always gives the same state, and drawing only
// ever reads a state.

export type StationArm = "hand on the keys" | "hand lifted" | "hanging down";

export type StationState = {
  /** The agent's own colour: the stripe on its head and the line on its card. */
  readonly colour: ColourName;
  /** False while the agent is away: the stool is empty. */
  readonly isSeated: boolean;
  /** Seated and working: it types, and its computer is on. */
  readonly isTyping: boolean;
  readonly look: RobotLook;
  readonly arm: StationArm;
  readonly screen: {
    readonly isOn: boolean;
    /** How many letters show on each line of the glass, top line first. */
    readonly lines: readonly [number, number];
  };
  /** Which key is down right now, counted from the keyboard's left; null when none is. */
  readonly keyDown: number | null;
  /**
   * Wisps of steam off the head of a worn-out agent hard at work, as rows
   * risen above its head and pixels drifted sideways. Empty for anyone else.
   */
  readonly steam: readonly { readonly risen: number; readonly drift: number; readonly thin: boolean }[];
};

/**
 * Each agent of a house gets the next colour, so a station and its card can be
 * told from their neighbours. None of them is a colour that already means
 * something in a room: the yellow of work, the cyan of an open eye, the green
 * of a screen, the sand of a plaster.
 */
export const agentColours: readonly ColourName[] = [
  "pink",
  "violet",
  "sunset",
  "grass",
  "rose",
  "peach",
  "ember",
  "teal",
  "mauve",
  "leaf",
];

export const KEY_PRESS_MS = 160;
const BLINK_EVERY_MS = 3300;
const BLINK_LASTS_MS = 150;
const BULB_BLINK_MS = 500;
/** Neighbours start a little apart, so a full room never types or blinks in step. */
const KEY_HEAD_START_MS = 90;
const BLINK_HEAD_START_MS = 700;
export const LONGEST_SCREEN_LINE = 4;
/** How many keys of the keyboard are under the typing hand, counted from its left. */
const KEYS_IN_REACH = 4;

const STEAM_WISPS = 2;
const STEAM_WISP_LIFE_MS = 1500;
const STEAM_RISE_MS = 250;
const STEAM_THINS_ABOVE_ROWS = 3;
const steamDrift = [0, 0, 1, 1, 0, -1] as const;

function steamAt(timeMs: number, agentIndex: number): StationState["steam"] {
  return Array.from({ length: STEAM_WISPS }, (_, wisp) => {
    const age = (timeMs + agentIndex * 400 + (wisp * STEAM_WISP_LIFE_MS) / STEAM_WISPS) % STEAM_WISP_LIFE_MS;
    const risen = Math.floor(age / STEAM_RISE_MS);
    return { risen, drift: steamDrift[risen % steamDrift.length], thin: risen >= STEAM_THINS_ABOVE_ROWS };
  });
}

export function stationStateAt(
  timeMs: number,
  agentIndex: number,
  agent: InsideAgent,
  isWornOut: boolean,
): StationState {
  const time = Math.max(0, timeMs);
  const colour = agentColours[agentIndex % agentColours.length];
  const isSeated = !agent.isAway;
  const isTyping = isSeated && agent.isWorking;

  const keysPressed = Math.floor((time + agentIndex * KEY_HEAD_START_MS) / KEY_PRESS_MS);
  const handIsDown = keysPressed % 2 === 0;
  const blinking = (time + 1000 + agentIndex * BLINK_HEAD_START_MS) % BLINK_EVERY_MS < BLINK_LASTS_MS;
  const bulbIsBright = Math.floor((time + agentIndex * KEY_HEAD_START_MS) / BULB_BLINK_MS) % 2 === 0;

  const lettersPerPage = LONGEST_SCREEN_LINE + 1;
  return {
    colour,
    isSeated,
    isTyping,
    look: {
      isWornOut,
      eye: !isTyping ? "dimmed" : blinking ? "shut" : isWornOut ? "half shut" : "wide open",
      bulb: !isTyping ? "stone" : bulbIsBright ? "lamp" : "sunset",
      stripe: colour,
    },
    arm: !isTyping ? "hanging down" : handIsDown ? "hand on the keys" : "hand lifted",
    screen: {
      isOn: isTyping,
      lines: isTyping
        ? [1 + ((Math.floor(keysPressed / lettersPerPage) * 3 + agentIndex) % LONGEST_SCREEN_LINE), keysPressed % lettersPerPage]
        : [0, 0],
    },
    keyDown: isTyping && handIsDown ? (keysPressed * 3) % KEYS_IN_REACH : null,
    steam: isTyping && isWornOut ? steamAt(time, agentIndex) : [],
  };
}
