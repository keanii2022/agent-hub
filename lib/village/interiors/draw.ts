import {
  LINE_HEIGHT,
  SCREEN_WIDTH,
  drawSprite,
  drawText,
  fillRect,
  measureText,
  setPixel,
  type ColourName,
  type Sprite,
  type Surface,
} from "../engine";
import type { BuildName } from "../houses/builds";
import { FOR_SALE_WORDS } from "../houses/place";
import { drawPlate, plateSizeFor, signStyles, type PlateColours } from "../houses/signs";
import { DEMO_TAG } from "../houses/state";
import { drawFocusMark } from "../plaza/draw";
import { grain } from "../plaza/grain";
import type { Point, Rect } from "../plaza/layout";
import { NO_NEWS_NOTE } from "../state/house-status";
import {
  CARD_INSET,
  CARD_NAME_BAND,
  CARD_NAME_TOP,
  CARD_STEP_TOP,
  CARD_UNDERLINE_TOP,
  STATION_SIZE,
  backButtonBounds,
  layoutInside,
  type BedPlace,
  type InsideLayout,
  type StationPlace,
} from "./layout";
import {
  ROBOT_AT,
  arms,
  bed,
  bunkBed,
  desk,
  STEAM_FROM,
  WALL_LAMP_GLASS,
  emptyCan,
  inTheDark,
  keyboard,
  monitor,
  mug,
  paperBall,
  paperStack,
  pottedFern,
  robotSprite,
  rug,
  stool,
  wallLamp,
  type PlacedSprite,
} from "./sprites";
import type { InsideAgent, InsideState } from "./state";
import { stationStateAt, type StationArm, type StationState } from "./stations";
import { cutToFit, lettersThatFit, wrapWords, writable } from "./text";

/** What the page knows that the house's news cannot. */
export type InsideInput = {
  /** The keyboard is on the back button, so it shows its focus mark. */
  readonly backHasFocus?: boolean;
};

/** The words painted on the back button. */
export const BACK_PLATE_WORDS = "< Plaza";

type RoomTones = {
  readonly wall: ColourName;
  readonly wallSeam: ColourName;
  readonly wallFleck: ColourName;
  readonly skirting: ColourName;
  readonly floor: ColourName;
  readonly floorSeam: ColourName;
  readonly floorFleck: ColourName;
  readonly windowFrame: ColourName;
};

const lampLitFloor = { skirting: "bark", floor: "bark", floorSeam: "ink", floorFleck: "wood", windowFrame: "clay" } as const;

const litTones: Record<BuildName, RoomTones> = {
  "brick office": { wall: "slate", wallSeam: "night", wallFleck: "stone", ...lampLitFloor },
  "timber workshop": { wall: "wood", wallSeam: "bark", wallFleck: "clay", ...lampLitFloor },
  "plaster cottage": { wall: "plum", wallSeam: "dusk", wallFleck: "mauve", ...lampLitFloor },
};

const lightsOutTones: RoomTones = {
  wall: "night",
  wallSeam: "ink",
  wallFleck: "dusk",
  skirting: "ink",
  floor: "ink",
  floorSeam: "night",
  floorFleck: "night",
  windowFrame: "bark",
};

const BRICK = { width: 8, height: 4 };
const WALL_PLANK_WIDTH = 7;

/** Each build's wall is laid its own way: bricks, upright planks, or rough plaster. */
function wallColourAt(build: BuildName, x: number, y: number, tones: RoomTones): ColourName {
  if (build === "brick office") {
    const course = Math.floor(y / BRICK.height);
    const along = x + (course % 2) * (BRICK.width / 2);
    if (y % BRICK.height === BRICK.height - 1 || along % BRICK.width === BRICK.width - 1) return tones.wallSeam;
    return grain(Math.floor(along / BRICK.width), course, 7) < 0.2 ? tones.wallFleck : tones.wall;
  }
  if (build === "timber workshop") {
    if (x % WALL_PLANK_WIDTH === WALL_PLANK_WIDTH - 1) return tones.wallSeam;
    return grain(x, Math.floor(y / 4), 3) < 0.05 ? tones.wallFleck : tones.wall;
  }
  return grain(Math.floor(x / 2), y, 5) < 0.05 ? tones.wallFleck : tones.wall;
}

const CEILING_SHADOW_ROWS = 2;
const SKIRTING_ROWS = 3;

function drawWall(surface: Surface, wall: Rect, build: BuildName, tones: RoomTones): void {
  for (let y = wall.y; y < wall.y + wall.height; y += 1) {
    for (let x = wall.x; x < wall.x + wall.width; x += 1) {
      setPixel(surface, x, y, wallColourAt(build, x, y - wall.y, tones));
    }
  }
  fillRect(surface, wall.x, wall.y, wall.width, CEILING_SHADOW_ROWS, tones.wallSeam);
  const skirtingTop = wall.y + wall.height - SKIRTING_ROWS;
  fillRect(surface, wall.x, skirtingTop, wall.width, SKIRTING_ROWS, tones.skirting);
  fillRect(surface, wall.x, skirtingTop, wall.width, 1, "ink");
}

const FLOORBOARD_HEIGHT = 6;
const FLOORBOARD_LENGTH = 47;
/** Each board's ends sit this much further along than the board above, so the joints never line up. */
const FLOORBOARD_STAGGER = 37;

function drawFloor(surface: Surface, floor: Rect, tones: RoomTones): void {
  for (let y = floor.y; y < floor.y + floor.height; y += 1) {
    const board = Math.floor((y - floor.y) / FLOORBOARD_HEIGHT);
    const isSeamRow = (y - floor.y) % FLOORBOARD_HEIGHT === FLOORBOARD_HEIGHT - 1;
    for (let x = floor.x; x < floor.x + floor.width; x += 1) {
      const isJoint = (x + board * FLOORBOARD_STAGGER) % FLOORBOARD_LENGTH === 0;
      const colour =
        isSeamRow || isJoint
          ? tones.floorSeam
          : grain(Math.floor(x / 3), y, 11) < 0.015
            ? tones.floorFleck
            : tones.floor;
      setPixel(surface, x, y, colour);
    }
  }
}

/** The dusk outside, top of the glass to the bottom: the same sky the plaza stands under. */
const duskSky: readonly ColourName[] = ["night", "dusk", "dusk", "plum", "plum", "mauve", "rose", "sunset", "peach"];
const HILL_ROWS = 4;
const WINDOW_FRAME = 2;
const starsInWindow = [
  { x: 5, y: 2 },
  { x: 17, y: 4 },
  { x: 29, y: 1 },
  { x: 34, y: 5 },
] as const;

function drawWindow(surface: Surface, window: Rect, tones: RoomTones): void {
  fillRect(surface, window.x - 1, window.y - 1, window.width + 2, window.height + 2, "ink");
  fillRect(surface, window.x, window.y, window.width, window.height, tones.windowFrame);
  const glass: Rect = {
    x: window.x + WINDOW_FRAME,
    y: window.y + WINDOW_FRAME,
    width: window.width - 2 * WINDOW_FRAME,
    height: window.height - 2 * WINDOW_FRAME,
  };
  for (let row = 0; row < glass.height; row += 1) {
    const band = Math.floor((row * duskSky.length) / glass.height);
    fillRect(surface, glass.x, glass.y + row, glass.width, 1, duskSky[band]);
  }
  for (const star of starsInWindow) setPixel(surface, glass.x + star.x, glass.y + star.y, "cream");
  for (let x = 0; x < glass.width; x += 1) {
    const rise = Math.round(1.5 + 1.5 * Math.sin(x / 5));
    fillRect(surface, glass.x + x, glass.y + glass.height - HILL_ROWS + (3 - rise), 1, HILL_ROWS - (3 - rise), "pine");
  }
  fillRect(surface, glass.x + Math.floor(glass.width / 2) - 1, glass.y, 2, glass.height, tones.windowFrame);
  fillRect(surface, glass.x, glass.y + Math.floor(glass.height * 0.4), glass.width, 1, tones.windowFrame);
  fillRect(surface, window.x - 2, window.y + window.height, window.width + 4, 2, "ink");
  fillRect(surface, window.x - 1, window.y + window.height, window.width + 2, 1, tones.windowFrame);
}

const DUSK_LIGHT_ROWS = 22;

/** With the lamps out, the last of the dusk falls through the window onto the floor. */
function drawDuskLightOnFloor(surface: Surface, layout: InsideLayout): void {
  for (let row = 0; row < DUSK_LIGHT_ROWS; row += 1) {
    const y = layout.floor.y + 2 + row;
    const left = layout.window.x + 8 + row;
    for (let x = left; x < left + layout.window.width - 6; x += 1) {
      if ((x + y) % 2 === 0) setPixel(surface, x, y, row < DUSK_LIGHT_ROWS / 2 ? "plum" : "dusk");
    }
  }
}

// Rings of speckles, warmer and denser towards the glass, stand in for a soft glow, as round the plaza's lamp posts.
const WALL_LAMP_HALO: readonly { reach: number; colour: ColourName; isLit(x: number, y: number): boolean }[] = [
  { reach: 11, colour: "clay", isLit: (x, y) => (x + 2 * y) % 4 === 0 },
  { reach: 7, colour: "sunset", isLit: (x, y) => (x + y) % 2 === 0 },
  { reach: 4, colour: "peach", isLit: (x, y) => (x + y) % 2 === 0 },
];

function drawWallLamp(surface: Surface, glass: Point): void {
  for (const ring of WALL_LAMP_HALO) {
    for (let y = glass.y - ring.reach; y <= glass.y + ring.reach; y += 1) {
      for (let x = glass.x - ring.reach; x <= glass.x + ring.reach; x += 1) {
        const inReach = Math.hypot(x - glass.x, y - glass.y) <= ring.reach;
        if (inReach && ring.isLit(x, y)) setPixel(surface, x, y, ring.colour);
      }
    }
  }
  drawSprite(surface, wallLamp, glass.x - WALL_LAMP_GLASS.x, glass.y - WALL_LAMP_GLASS.y);
}

type PinnedNote = { x: number; y: number; width: number; height: number; paper: ColourName };

const tidyNotes: readonly PinnedNote[] = [
  { x: 5, y: 4, width: 9, height: 8, paper: "cream" },
  { x: 20, y: 6, width: 9, height: 8, paper: "peach" },
];

/** The board of a shared house: more lists than it has room for, pinned over one another. */
const piledUpNotes: readonly PinnedNote[] = [
  { x: 3, y: 3, width: 9, height: 8, paper: "cream" },
  { x: 9, y: 7, width: 9, height: 8, paper: "peach" },
  { x: 15, y: 2, width: 8, height: 7, paper: "cloud" },
  { x: 21, y: 6, width: 9, height: 8, paper: "cream" },
  { x: 26, y: 2, width: 7, height: 6, paper: "lamp" },
  { x: 4, y: 12, width: 8, height: 7, paper: "cloud" },
  { x: 17, y: 11, width: 9, height: 7, paper: "peach" },
];

function drawPinboard(surface: Surface, board: Rect, isPiledUp: boolean): void {
  fillRect(surface, board.x - 1, board.y - 1, board.width + 2, board.height + 2, "ink");
  fillRect(surface, board.x, board.y, board.width, board.height, "wood");
  fillRect(surface, board.x + 2, board.y + 2, board.width - 4, board.height - 4, "clay");
  for (const note of isPiledUp ? piledUpNotes : tidyNotes) {
    const height = Math.min(note.height, board.height - 3 - note.y);
    if (height < 4) continue;
    const left = board.x + note.x;
    const top = board.y + note.y;
    fillRect(surface, left, top, note.width, height, "bark");
    fillRect(surface, left, top, note.width - 1, height - 1, note.paper);
    for (let line = 2; line < height - 2; line += 2) {
      fillRect(surface, left + 1, top + line, note.width - 3 - (line % 4), 1, "stone");
    }
    setPixel(surface, left + Math.floor(note.width / 2) - 1, top, "ember");
  }
}

function drawBed(surface: Surface, place: BedPlace): void {
  drawSprite(surface, place.kind === "bunk bed" ? bunkBed : bed, place.bounds.x, place.bounds.y);
}

function drawPlaced(surface: Surface, placed: PlacedSprite, station: Rect, sprite: Sprite = placed.sprite): void {
  drawSprite(surface, sprite, station.x + placed.x, station.y + placed.y);
}

const armSprites: Record<StationArm, PlacedSprite> = {
  "hand on the keys": arms.handOnTheKeys,
  "hand lifted": arms.handLifted,
  "hanging down": arms.hangingDown,
};

const GLASS_LINE_STEP = 2;
const awayColours: PlateColours = { paper: "cloud", words: "slate" };
export const AWAY_WORDS = "away";
/** Where the "away" sign hangs inside the station's box: over the empty stool. */
const AWAY_SIGN_AT = { x: -8, y: 2 } as const;

function drawStation(surface: Surface, station: Rect, state: StationState): void {
  drawPlaced(surface, stool, station);
  if (state.isSeated) drawSprite(surface, robotSprite(state.look), station.x + ROBOT_AT.x, station.y + ROBOT_AT.y);
  drawPlaced(surface, desk, station);
  drawPlaced(surface, keyboard, station);
  if (state.keyDown !== null) {
    setPixel(surface, station.x + keyboard.x + state.keyDown, station.y + keyboard.y, "lamp");
  }
  drawSprite(surface, state.screen.isOn ? monitor.on : monitor.off, station.x + monitor.x, station.y + monitor.y);
  if (state.screen.isOn) {
    const glassLeft = station.x + monitor.x + monitor.glass.x;
    const glassTop = station.y + monitor.y + monitor.glass.y;
    state.screen.lines.forEach((letters, line) => {
      fillRect(surface, glassLeft, glassTop + line * GLASS_LINE_STEP, Math.min(letters, monitor.glass.width), 1, "lime");
    });
  }
  if (state.look.isWornOut) drawPlaced(surface, mug, station);
  for (const wisp of state.steam) {
    setPixel(
      surface,
      station.x + STEAM_FROM.x + wisp.drift,
      station.y + STEAM_FROM.y - wisp.risen,
      wisp.thin ? "stone" : "mist",
    );
  }
  if (state.isSeated) drawPlaced(surface, armSprites[state.arm], station);
  else drawPlate(surface, AWAY_WORDS, station.x + AWAY_SIGN_AT.x, station.y + AWAY_SIGN_AT.y, awayColours);
}

/** What long hours leave on the floor round a station: paperwork by the desk, and rubbish behind the stool. */
function drawLitter(surface: Surface, station: Rect, agentIndex: number): void {
  const floorY = station.y + station.height - 1;
  drawSprite(surface, paperStack, station.x + station.width + 2, floorY - paperStack.height + 1);
  const dropped = agentIndex % 2 === 0 ? paperBall : emptyCan;
  drawSprite(surface, dropped, station.x - 7, floorY - dropped.height + 1);
}

type CardColours = { band: ColourName; name: ColourName; underline: ColourName; step: ColourName; what: ColourName };

function cardColoursFor(agent: InsideAgent, state: StationState): CardColours {
  if (agent.isAway) return { band: "night", name: "mist", underline: "slate", step: "stone", what: "stone" };
  // No yellow on the card of an agent that isn't working, so it is never taken for one that is.
  if (!agent.isWorking) return { band: "slate", name: "cloud", underline: state.colour, step: "mist", what: "mist" };
  return { band: "plum", name: "cream", underline: state.colour, step: "lamp", what: "cloud" };
}

function drawCard(surface: Surface, place: StationPlace, colours: CardColours): void {
  const { card } = place;
  const left = card.x + CARD_INSET;
  fillRect(surface, card.x, card.y, card.width, card.height, "ink");
  fillRect(surface, card.x + 1, card.y + 1, card.width - 2, card.height - 2, "night");
  fillRect(surface, card.x + 1, card.y + CARD_NAME_BAND.top, card.width - 2, CARD_NAME_BAND.height, colours.band);
  drawText(surface, place.nameLine, left, card.y + CARD_NAME_TOP, colours.name);
  fillRect(surface, card.x + 1, card.y + CARD_UNDERLINE_TOP, card.width - 2, 1, colours.underline);
  const stepTop = card.y + CARD_STEP_TOP;
  drawText(surface, place.stepLines.join("\n"), left, stepTop, colours.step);
  drawText(surface, place.whatLines.join("\n"), left, stepTop + place.stepLines.length * LINE_HEIGHT, colours.what);
}

const HEADER_TEXT_TOP = 3;
const HEADER_PLATE_TOP = 2;
const HEADER_SIDE_MARGIN = 3;
const backColours: PlateColours = { paper: "cloud", words: "night" };
const tagColours: PlateColours = { paper: "sand", words: "ember" };
const noteColours: PlateColours = { paper: "cloud", words: "slate" };

/** Where the DEMO tag sits in the header. */
export function demoTagBounds(): Rect {
  const plate = plateSizeFor(DEMO_TAG);
  return { x: SCREEN_WIDTH - HEADER_SIDE_MARGIN - plate.width, y: HEADER_PLATE_TOP, ...plate };
}

/** Agents the room has no station for are counted here, in plain words, beside the tag. */
function moreAgentsWords(agentsWithoutStation: number): string {
  return `+${agentsWithoutStation} more`;
}

const GAP_ROUND_TITLE = 8;

function drawHeader(surface: Surface, layout: InsideLayout, inside: InsideState): void {
  const { header } = layout;
  fillRect(surface, header.x, header.y, header.width, header.height, "ink");
  fillRect(surface, header.x, header.y + header.height - 1, header.width, 1, "slate");
  drawPlate(surface, BACK_PLATE_WORDS, backButtonBounds.x, backButtonBounds.y, backColours);

  const tag = demoTagBounds();
  if (inside.isDemo) drawPlate(surface, DEMO_TAG, tag.x, tag.y, tagColours);
  let platesStartAt = tag.x;
  if (layout.agentsWithoutStation > 0) {
    const words = moreAgentsWords(layout.agentsWithoutStation);
    platesStartAt -= plateSizeFor(words).width + 3;
    drawPlate(surface, words, platesStartAt, HEADER_PLATE_TOP, noteColours);
  }

  // The title stays in the middle of the screen, so it may only be as wide as the narrower side leaves it.
  const backEndsAt = backButtonBounds.x + backButtonBounds.width;
  const roomEachSide = Math.min(SCREEN_WIDTH / 2 - backEndsAt, platesStartAt - SCREEN_WIDTH / 2) - GAP_ROUND_TITLE;
  const title = cutToFit(writable(inside.houseName), lettersThatFit(2 * roomEachSide));
  drawText(
    surface,
    title,
    Math.floor((SCREEN_WIDTH - measureText(title).width) / 2),
    HEADER_TEXT_TOP,
    inside.sign ? signStyles[inside.sign].letters : "cream",
  );
}

const SENTENCE_LETTERS_PER_LINE = 44;

/** A plain sentence in the middle of a room with no stations. `top` is its first row. */
function drawSentence(surface: Surface, sentence: string, top: number, colour: ColourName): void {
  wrapWords(writable(sentence), SENTENCE_LETTERS_PER_LINE, 3).forEach((line, lineNumber) => {
    const left = Math.floor((SCREEN_WIDTH - measureText(line).width) / 2);
    drawText(surface, line, left, top + lineNumber * LINE_HEIGHT, colour);
  });
}

/** The one station of a room nobody is known to be in: its stool empty and its computer off. */
function spareStation(layout: InsideLayout): Rect {
  return {
    x: Math.floor((SCREEN_WIDTH - STATION_SIZE.width) / 2),
    y: layout.floor.y + 6,
    ...STATION_SIZE,
  };
}

function drawStationInTheDark(surface: Surface, station: Rect): void {
  drawPlaced(surface, stool, station, inTheDark(stool.sprite));
  drawPlaced(surface, desk, station, inTheDark(desk.sprite));
  drawSprite(surface, inTheDark(monitor.off), station.x + monitor.x, station.y + monitor.y);
}

function drawEmptyLitStation(surface: Surface, station: Rect): void {
  drawPlaced(surface, stool, station);
  drawPlaced(surface, desk, station);
  drawPlaced(surface, keyboard, station);
  drawSprite(surface, monitor.off, station.x + monitor.x, station.y + monitor.y);
}

const COBWEB_REACH = 9;

function drawCobweb(surface: Surface, cornerX: number, cornerY: number, towardsRight: boolean): void {
  const step = towardsRight ? 1 : -1;
  for (let along = 0; along < COBWEB_REACH; along += 1) {
    setPixel(surface, cornerX + step * along, cornerY + COBWEB_REACH - 1 - along, "stone");
    if (along % 3 === 0) {
      setPixel(surface, cornerX + step * along, cornerY, "stone");
      setPixel(surface, cornerX, cornerY + along, "stone");
    }
    if (along < COBWEB_REACH - 4) setPixel(surface, cornerX + step * along, cornerY + COBWEB_REACH - 5 - along, "slate");
  }
}

const FOR_SALE_BOARD = { width: 29, height: 22 };
const FOR_SALE_LINE_STEP = 9;

/** The same board that stands in the yard, here left leaning against the back wall. */
function drawForSaleBoard(surface: Surface, floorTop: number): void {
  const board: Rect = {
    x: Math.floor((SCREEN_WIDTH - FOR_SALE_BOARD.width) / 2),
    y: floorTop + 4 - FOR_SALE_BOARD.height,
    ...FOR_SALE_BOARD,
  };
  fillRect(surface, board.x, board.y, board.width, board.height, "ink");
  fillRect(surface, board.x + 1, board.y + 1, board.width - 2, board.height - 2, "cream");
  fillRect(surface, board.x + 1, board.y + board.height - 2, board.width - 2, 1, "sand");
  FOR_SALE_WORDS.forEach((word, line) => {
    const left = board.x + Math.floor((board.width - measureText(word).width) / 2);
    drawText(surface, word, left, board.y + 3 + line * FOR_SALE_LINE_STEP, "ember");
  });
}

const SENTENCE_BELOW_FLOOR_TOP = 62;
const NOTE_BELOW_FLOOR_TOP = 42;

function drawRoomWithoutStations(surface: Surface, layout: InsideLayout, inside: InsideState): void {
  const { floor, wall } = layout;
  const sentenceTop = floor.y + SENTENCE_BELOW_FLOOR_TOP;

  if (inside.kind === "for sale") {
    drawCobweb(surface, wall.x, wall.y + 2, true);
    drawCobweb(surface, wall.x + wall.width - 1, wall.y + 2, false);
    drawForSaleBoard(surface, floor.y);
    drawSentence(surface, inside.sentence, sentenceTop, "cloud");
    return;
  }
  if (inside.kind === "nobody home") {
    drawPinboard(surface, layout.pinboard, false);
    drawEmptyLitStation(surface, spareStation(layout));
    drawSentence(surface, inside.sentence, sentenceTop, "cream");
    return;
  }

  drawStationInTheDark(surface, spareStation(layout));
  if (inside.kind === "no news") {
    const plate = plateSizeFor(NO_NEWS_NOTE);
    drawPlate(
      surface,
      NO_NEWS_NOTE,
      Math.floor((SCREEN_WIDTH - plate.width) / 2),
      floor.y + NOTE_BELOW_FLOOR_TOP,
      noteColours,
    );
    drawSentence(surface, inside.sentence, sentenceTop, "cloud");
  }
}

function drawRoomWithStations(surface: Surface, layout: InsideLayout, inside: InsideState, timeMs: number): void {
  drawPinboard(surface, layout.pinboard, inside.isWornOut);
  for (const place of layout.beds) drawBed(surface, place);
  const ownBed = layout.beds.find((place) => place.kind === "bed");
  if (ownBed) {
    drawSprite(
      surface,
      pottedFern,
      ownBed.bounds.x - pottedFern.width - 4,
      ownBed.bounds.y + ownBed.bounds.height - pottedFern.height,
    );
  }

  for (const place of layout.stations) {
    const agent = inside.agents[place.agentIndex];
    const state = stationStateAt(timeMs, place.agentIndex, agent, inside.isWornOut);
    if (inside.isWornOut) drawLitter(surface, place.station, place.agentIndex);
    else drawPlaced(surface, rug, place.station);
    drawStation(surface, place.station, state);
    drawCard(surface, place, cardColoursFor(agent, state));
  }
}

/** The whole picture of the inside of one house. It covers the screen. */
export function drawInside(
  surface: Surface,
  inside: InsideState,
  timeMs: number,
  input: InsideInput = {},
): void {
  const layout = layoutInside(inside.agents);
  const lampsAreOn = inside.kind === "agents home" || inside.kind === "nobody home";
  const tones = lampsAreOn ? litTones[inside.build] : lightsOutTones;

  drawWall(surface, layout.wall, inside.build, tones);
  drawFloor(surface, layout.floor, tones);
  drawWindow(surface, layout.window, tones);
  if (lampsAreOn) for (const lamp of layout.wallLamps) drawWallLamp(surface, lamp);
  else drawDuskLightOnFloor(surface, layout);

  if (inside.kind === "agents home") drawRoomWithStations(surface, layout, inside, timeMs);
  else drawRoomWithoutStations(surface, layout, inside);

  drawHeader(surface, layout, inside);
  if (input.backHasFocus) drawFocusMark(surface, backButtonBounds);
}
