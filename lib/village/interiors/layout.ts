import { LINE_HEIGHT, SCREEN_HEIGHT, SCREEN_WIDTH } from "../engine";
import type { Point, Rect } from "../plaza/layout";
import { stepInPlainWords, type InsideAgent } from "./state";
import { cutToFit, lettersThatFit, wrapWords, writable } from "./text";

// Where everything in a room goes, worked out from the list of agents alone.
// Nothing here is drawn: the same list always gives the same places, and a
// test can check them as plain numbers.

/** A room has stations for this many agents. More than this still live there, and the room says how many it left out. */
export const STATIONS_AT_MOST = 10;
export const STATIONS_PER_ROW_AT_MOST = 5;
/** Each bunk bed sleeps two. */
export const AGENTS_PER_BUNK = 2;

/** The strip along the top with the way back, the house's name and its tag. */
export const HEADER_HEIGHT = 15;
/** A desk, its computer, a chair, and whoever sits there. */
export const STATION_SIZE = { width: 40, height: 22 } as const;
export const BED_SIZE = { width: 36, height: 13 } as const;
export const BUNK_BED_SIZE = { width: 36, height: 30 } as const;

/** The back button's plate: the area a click or the keyboard reaches. */
export const backButtonBounds: Rect = { x: 3, y: 2, width: 45, height: 11 };

const SIDE_MARGIN = 2;
/** A lone agent's card stops growing here, so its lines stay short enough to read. */
const CELL_WIDTH_AT_MOST = 222;
const GAP_BETWEEN_CARDS = 1;

/** One row of ink round the card, one row of air inside it. */
export const CARD_INSET = 2;
/** The band the name is written on, measured from the card's top. */
export const CARD_NAME_BAND = { top: 1, height: 11 } as const;
export const CARD_NAME_TOP = 2;
/** The thin line under the name band, in the agent's own colour. */
export const CARD_UNDERLINE_TOP = 12;
/** The first line under the name: the step, then what the agent is doing, one line after another. */
export const CARD_STEP_TOP = 14;
const CARD_HEIGHT_WITHOUT_LINES = 15;
/** A step of several words may take a second line; a longer one is cut short. */
const STEP_LINES_AT_MOST = 2;

const GAP_STATION_TO_CARD = 3;
const BED_GAP = 4;
/** Where along the wall a lamp can hang, nearest the window first. A lamp gives way to a bed. */
const WALL_LAMP_XS = [144, 222] as const;
const WALL_LAMP_KEEPS_CLEAR = 14;
const BED_RIGHT_MARGIN = 6;
/** How far a bed's feet stand out from the wall onto the floor. */
const BED_FEET_ON_FLOOR_ROWS = 2;

type RoomShape = {
  /** The first row of floor. */
  readonly floorTop: number;
  /** The top of each row of stations. */
  readonly stationTops: readonly number[];
  /** How many lines fit under the name: the step's and the "what" together. */
  readonly linesUnderNameAtMost: number;
  readonly window: Rect;
  readonly pinboard: Rect;
  /** The row the wall lamps' glass hangs at. */
  readonly wallLampY: number;
};

const oneRowRoom: RoomShape = {
  floorTop: 78,
  stationTops: [82],
  linesUnderNameAtMost: 7,
  window: { x: 14, y: 27, width: 44, height: 32 },
  pinboard: { x: 76, y: 31, width: 36, height: 24 },
  wallLampY: 36,
};

const twoRowRoom: RoomShape = {
  floorTop: 54,
  stationTops: [54, 136],
  linesUnderNameAtMost: 4,
  window: { x: 14, y: 20, width: 44, height: 25 },
  pinboard: { x: 76, y: 22, width: 36, height: 21 },
  wallLampY: 24,
};

export type StationPlace = {
  /** Which agent of the list works here, counted from 0. */
  readonly agentIndex: number;
  readonly row: number;
  readonly column: number;
  /** The desk, the computer and the chair. */
  readonly station: Rect;
  /** The card under the station. Only as tall as its words need. */
  readonly card: Rect;
  /** The agent's name as it fits on the card. */
  readonly nameLine: string;
  /** The agent's step in plain words: one line, or two when it is several words long. */
  readonly stepLines: readonly string[];
  /** What the agent is doing, broken into the card's remaining lines. */
  readonly whatLines: readonly string[];
};

export type BedPlace = {
  readonly kind: "bed" | "bunk bed";
  readonly bounds: Rect;
};

export type InsideLayout = {
  readonly header: Rect;
  readonly wall: Rect;
  readonly floor: Rect;
  readonly window: Rect;
  readonly pinboard: Rect;
  /** The middle of the glass of each lamp on the back wall. */
  readonly wallLamps: readonly Point[];
  /** How many rows of stations the room has: 1 or 2. */
  readonly rows: number;
  /** One per agent with a station, in list order. */
  readonly stations: readonly StationPlace[];
  /** A bed of its own for a lone agent; bunk beds, one per two agents, when the house is shared. */
  readonly beds: readonly BedPlace[];
  /** Agents the room had no station left for. */
  readonly agentsWithoutStation: number;
};

function bedsFor(agentCount: number, floorTop: number): BedPlace[] {
  if (agentCount === 0) return [];
  const sharing = agentCount >= AGENTS_PER_BUNK;
  const size = sharing ? BUNK_BED_SIZE : BED_SIZE;
  const bedCount = sharing ? Math.ceil(agentCount / AGENTS_PER_BUNK) : 1;
  return Array.from({ length: bedCount }, (_, bed) => ({
    kind: sharing ? ("bunk bed" as const) : ("bed" as const),
    bounds: {
      x: SCREEN_WIDTH - BED_RIGHT_MARGIN - (bed + 1) * size.width - bed * BED_GAP,
      y: floorTop + BED_FEET_ON_FLOOR_ROWS - size.height,
      ...size,
    },
  }));
}

/** Where the stations, their cards and the beds of a room go, for any list of agents. */
export function layoutInside(agents: readonly InsideAgent[]): InsideLayout {
  const seated = Math.min(agents.length, STATIONS_AT_MOST);
  const rows = seated > STATIONS_PER_ROW_AT_MOST ? 2 : 1;
  const shape = rows === 2 ? twoRowRoom : oneRowRoom;
  // The back row is never the shorter one: an odd agent out sits at the back.
  const inBackRow = rows === 2 ? Math.ceil(seated / 2) : seated;
  const cellWidth = Math.min(
    CELL_WIDTH_AT_MOST,
    Math.floor((SCREEN_WIDTH - 2 * SIDE_MARGIN) / Math.max(1, inBackRow)),
  );
  const cardWidth = cellWidth - GAP_BETWEEN_CARDS;
  const lettersPerLine = lettersThatFit(cardWidth - 2 * CARD_INSET);

  const stations = agents.slice(0, seated).map((agent, agentIndex): StationPlace => {
    const row = agentIndex < inBackRow ? 0 : 1;
    const column = row === 0 ? agentIndex : agentIndex - inBackRow;
    const inThisRow = row === 0 ? inBackRow : seated - inBackRow;
    const cellLeft = Math.floor((SCREEN_WIDTH - inThisRow * cellWidth) / 2) + column * cellWidth;
    const stationTop = shape.stationTops[row];
    const stepLines = wrapWords(writable(stepInPlainWords(agent.step)), lettersPerLine, STEP_LINES_AT_MOST);
    const whatLines = wrapWords(
      writable(agent.what),
      lettersPerLine,
      shape.linesUnderNameAtMost - stepLines.length,
    );
    return {
      agentIndex,
      row,
      column,
      station: {
        x: cellLeft + Math.floor((cellWidth - STATION_SIZE.width) / 2),
        y: stationTop,
        ...STATION_SIZE,
      },
      card: {
        x: cellLeft,
        y: stationTop + STATION_SIZE.height + GAP_STATION_TO_CARD,
        width: cardWidth,
        height: CARD_HEIGHT_WITHOUT_LINES + (stepLines.length + whatLines.length) * LINE_HEIGHT,
      },
      nameLine: cutToFit(writable(agent.name), lettersPerLine),
      stepLines,
      whatLines,
    };
  });

  const beds = bedsFor(seated, shape.floorTop);
  const bedsStartAt = Math.min(SCREEN_WIDTH, ...beds.map((bed) => bed.bounds.x));

  return {
    header: { x: 0, y: 0, width: SCREEN_WIDTH, height: HEADER_HEIGHT },
    wall: { x: 0, y: HEADER_HEIGHT, width: SCREEN_WIDTH, height: shape.floorTop - HEADER_HEIGHT },
    floor: { x: 0, y: shape.floorTop, width: SCREEN_WIDTH, height: SCREEN_HEIGHT - shape.floorTop },
    window: shape.window,
    pinboard: shape.pinboard,
    wallLamps: WALL_LAMP_XS.filter((x) => x + WALL_LAMP_KEEPS_CLEAR <= bedsStartAt).map((x) => ({
      x,
      y: shape.wallLampY,
    })),
    rows,
    stations,
    beds,
    agentsWithoutStation: agents.length - seated,
  };
}
