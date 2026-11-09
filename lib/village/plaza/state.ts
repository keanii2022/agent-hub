import { humanStateAt, type HumanState } from "../characters/human";
import { plazaLayout, type Point } from "./layout";

// What the plaza is doing at one moment, worked out from the clock alone. The
// same time always gives the same state, and drawing only ever reads a state.

/** What the page knows that the clock cannot. */
export type PlazaInput = {
  /** The keyboard is on the computer, so it shows its focus mark. */
  readonly computerHasFocus?: boolean;
};

export type ComputerState = {
  /** How many letters show on each line of the glass, top line first. */
  readonly lines: readonly number[];
  /** Where the next letter will land. */
  readonly cursor: { readonly line: number; readonly column: number; readonly showing: boolean };
  /** Which key of the keyboard is down right now, counted from its left; null when none is. */
  readonly keyDown: number | null;
  readonly hasFocus: boolean;
};

export type PlazaState = {
  readonly timeMs: number;
  readonly human: HumanState;
  readonly computer: ComputerState;
  readonly mugIsOnDesk: boolean;
  readonly stars: readonly { readonly at: Point; readonly bright: boolean }[];
  readonly fireflies: readonly { readonly at: Point; readonly glowing: boolean }[];
  /** Puffs rising from the cigarette butt that is still burning. Old puffs are thin. */
  readonly smoke: readonly { readonly at: Point; readonly thin: boolean }[];
  readonly wiresAreSparking: boolean;
};

export const GLASS_LINES = 3;
export const LONGEST_LINE = 4;
// His lines are different lengths, like real writing, and repeat after eight.
const lineLengths = [4, 2, 3, 4, 1, 3, 2, 4] as const;
const LETTERS_PER_PAGE = lineLengths.reduce((total, length) => total + length, 0);

const CURSOR_BLINK_MS = 500;
const KEYBOARD_KEYS_UNDER_HANDS = 4;

function computerStateAt(timeMs: number, human: HumanState, hasFocus: boolean): ComputerState {
  const pagesDone = Math.floor(human.keysPressed / LETTERS_PER_PAGE);
  let lettersOnLine = human.keysPressed % LETTERS_PER_PAGE;
  let lineOnPage = 0;
  while (lettersOnLine >= lineLengths[lineOnPage]) {
    lettersOnLine -= lineLengths[lineOnPage];
    lineOnPage += 1;
  }
  const linesDone = pagesDone * lineLengths.length + lineOnPage;

  // Finished lines scroll up; the line being typed is the lowest one showing.
  const finishedShowing = Math.min(linesDone, GLASS_LINES - 1);
  const lines = Array.from({ length: GLASS_LINES }, (_, row) => {
    if (row < finishedShowing) {
      return lineLengths[(linesDone - finishedShowing + row) % lineLengths.length];
    }
    return row === finishedShowing ? lettersOnLine : 0;
  });

  const typing = human.activity === "typing";
  return {
    lines,
    cursor: {
      line: finishedShowing,
      column: lettersOnLine,
      showing: typing || Math.floor(timeMs / CURSOR_BLINK_MS) % 2 === 0,
    },
    keyDown: typing ? (human.keysPressed * 3) % KEYBOARD_KEYS_UNDER_HANDS : null,
    hasFocus,
  };
}

const TWINKLE_MS = 2600;
const TWINKLE_DIM_MS = 500;

function starsAt(timeMs: number): PlazaState["stars"] {
  return plazaLayout.stars.map((star, index) => ({
    at: star.at,
    bright: !star.twinkles || (timeMs + index * 700) % TWINKLE_MS >= TWINKLE_DIM_MS,
  }));
}

const FULL_TURN = Math.PI * 2;

function firefliesAt(timeMs: number): PlazaState["fireflies"] {
  return plazaLayout.fireflies.map((route, index) => {
    const lap = (timeMs / route.lapMs) * FULL_TURN;
    return {
      at: {
        x: route.home.x + Math.round(route.roams.x * Math.sin(lap + index)),
        y: route.home.y + Math.round(route.roams.y * Math.sin(lap * 0.73 + index * 2)),
      },
      glowing: (timeMs + index * 600) % route.blinkMs < route.blinkMs * 0.55,
    };
  });
}

const SMOKE_PUFFS = 3;
const SMOKE_PUFF_LIFE_MS = 2700;
const SMOKE_RISE_MS = 180;
const SMOKE_THINS_ABOVE_ROWS = 8;
const smokeDrift = [0, 0, 1, 1, 1, 0, 0, -1, -1, 0, 0, 1, 1, 2, 2] as const;

function smokeAt(timeMs: number): PlazaState["smoke"] {
  const source = plazaLayout.smoulderingButt;
  return Array.from({ length: SMOKE_PUFFS }, (_, puff) => {
    const age = (timeMs + (puff * SMOKE_PUFF_LIFE_MS) / SMOKE_PUFFS) % SMOKE_PUFF_LIFE_MS;
    const risen = Math.floor(age / SMOKE_RISE_MS);
    return {
      at: { x: source.x + smokeDrift[risen % smokeDrift.length], y: source.y - 1 - risen },
      thin: risen >= SMOKE_THINS_ABOVE_ROWS,
    };
  });
}

const SPARK_EVERY_MS = 3100;
const SPARK_FLASH_MS = 80;

function wiresAreSparkingAt(timeMs: number): boolean {
  const sinceLastSpark = timeMs % SPARK_EVERY_MS;
  // Two quick flashes with a gap between, like a loose wire.
  return sinceLastSpark < SPARK_FLASH_MS || (sinceLastSpark >= 2 * SPARK_FLASH_MS && sinceLastSpark < 3 * SPARK_FLASH_MS);
}

export function plazaStateAt(timeMs: number, input: PlazaInput = {}): PlazaState {
  const time = Math.max(0, timeMs);
  const human = humanStateAt(time);
  return {
    timeMs: time,
    human,
    computer: computerStateAt(time, human, input.computerHasFocus ?? false),
    mugIsOnDesk: !human.holdingMug,
    stars: starsAt(time),
    fireflies: firefliesAt(time),
    smoke: smokeAt(time),
    wiresAreSparking: wiresAreSparkingAt(time),
  };
}
