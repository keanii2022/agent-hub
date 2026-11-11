import {
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  LETTER_GAP,
  LINE_HEIGHT,
  colourAt,
  createSurface,
  drawSprite,
  drawText,
  fillRect,
  hasGlyph,
  measureText,
  setPixel,
  spriteFromRows,
  type ColourName,
  type Sprite,
  type Surface,
} from "../engine";
import type { Point, Rect } from "../plaza/layout";

// A house's neon sign: a dark board on the roof, the project's name in glowing
// tubes, a frame of lights round it and a shape on top. The engine has no
// see-through paint, so a glow is a dimmer colour hugging the tubes and a
// speckle of light on whatever is behind the board, like the lamp posts.

export type SignTopper = "tick" | "arrow" | "star";

export type SignStyle = {
  /** The tubes that spell the name. */
  readonly letters: ColourName;
  /** The soft light right around a tube, and the colour of a tube that is off. */
  readonly lettersGlow: ColourName;
  /** "bulbs" run round the board; a "tube" is one steady line. */
  readonly frame: "bulbs" | "tube";
  readonly frameBright: ColourName;
  readonly frameDim: ColourName;
  /** Light spilling past the board: speckles close to it, then fewer further out. */
  readonly haloNear: ColourName;
  readonly haloFar: ColourName;
  readonly topper: SignTopper;
  readonly topperBright: ColourName;
  readonly topperDim: ColourName;
};

export const signStyles = {
  "green tick marquee": {
    letters: "lime",
    lettersGlow: "moss",
    frame: "bulbs",
    frameBright: "lamp",
    frameDim: "clay",
    haloNear: "sunset",
    haloFar: "clay",
    topper: "tick",
    topperBright: "lime",
    topperDim: "moss",
  },
  "blue arrow": {
    letters: "cyan",
    lettersGlow: "slate",
    frame: "tube",
    frameBright: "pink",
    frameDim: "plum",
    haloNear: "pink",
    haloFar: "rose",
    topper: "arrow",
    topperBright: "pink",
    topperDim: "plum",
  },
  "pink star": {
    letters: "pink",
    lettersGlow: "dusk",
    frame: "tube",
    frameBright: "violet",
    frameDim: "plum",
    haloNear: "violet",
    haloFar: "mauve",
    topper: "star",
    topperBright: "lamp",
    topperDim: "clay",
  },
} satisfies Record<string, SignStyle>;

export type SignStyleName = keyof typeof signStyles;

export const signStyleNames = Object.keys(signStyles) as SignStyleName[];

/** Thirteen letters is "approval-desk": the longest name that stays on one line. */
export const LETTERS_PER_SIGN_LINE = 13;
export const SIGN_LINES_AT_MOST = 2;

function lettersIn(text: string): number {
  return [...text].length;
}

/**
 * The name as its sign spells it: on one line if it fits, otherwise broken in
 * two after a hyphen or at a space. Throws, in plain words, when it cannot fit.
 */
export function signLinesFor(name: string): string[] {
  const letters = [...name];
  if (name.trim() === "" || name !== name.trim()) {
    throw new Error(`A sign needs a name with no spaces at its ends, and got "${name}"`);
  }
  const unknown = letters.filter((letter) => !hasGlyph(letter));
  if (unknown.length > 0) {
    throw new Error(`The sign for "${name}" uses "${unknown[0]}", which the village's letters do not have`);
  }
  if (letters.length <= LETTERS_PER_SIGN_LINE) return [name];

  const longestLineOf = (pair: readonly string[]): number => Math.max(...pair.map(lettersIn));
  // A hyphen stays at the end of the first line; a space is dropped, as on any sign.
  const waysToBreak = letters.flatMap((letter, index) => {
    if (letter !== "-" && letter !== " ") return [];
    const first = letters.slice(0, letter === "-" ? index + 1 : index).join("");
    return [[first, letters.slice(index + 1).join("")]];
  });
  const lines = waysToBreak.reduce<string[] | null>(
    (best, pair) => (!best || longestLineOf(pair) < longestLineOf(best) ? pair : best),
    null,
  );
  if (!lines || lines.some((line) => lettersIn(line) > LETTERS_PER_SIGN_LINE || line === "")) {
    throw new Error(
      `"${name}" is too long for a sign: ${LETTERS_PER_SIGN_LINE} letters fit on a line, ` +
        `and a longer name needs a hyphen or a space where it can break into ${SIGN_LINES_AT_MOST} lines`,
    );
  }
  return lines;
}

/** Each pixel of a line of text: true where the letters have ink. Rows from the top. */
function inkOf(line: string): boolean[][] {
  const { width } = measureText(line);
  const scratch = createSurface(Math.max(1, width), GLYPH_HEIGHT);
  drawText(scratch, line, 0, 0, "cream");
  return Array.from({ length: GLYPH_HEIGHT }, (_, y) =>
    Array.from({ length: width }, (_, x) => colourAt(scratch, x, y) !== null),
  );
}

const inkByLine = new Map<string, boolean[][]>();

function cachedInkOf(line: string): boolean[][] {
  let ink = inkByLine.get(line);
  if (!ink) {
    ink = inkOf(line);
    inkByLine.set(line, ink);
  }
  return ink;
}

const ROWS_ABOVE_TAILS = 7;

function hasTails(line: string): boolean {
  return cachedInkOf(line)
    .slice(ROWS_ABOVE_TAILS)
    .some((row) => row.includes(true));
}

// From the edge of the board inwards: a dark rim, the frame of lights, then clear board.
const BOARD_RIM = 1;
const FRAME_THICKNESS = 1;
const SIDE_PADDING = 2;
const TEXT_INSET_X = BOARD_RIM + FRAME_THICKNESS + SIDE_PADDING;
const TEXT_INSET_TOP = 4;
const TEXT_INSET_BOTTOM = 4;
// A last line with tails (g, p, y) already has two near-empty rows under its
// letters. One clear row more keeps a tail's glow off the frame of lights.
const TEXT_INSET_BOTTOM_WITH_TAILS = 3;
/** Wide enough for a topper and a tag side by side, however short the name. */
const NARROWEST_BOARD = 47;

/** The plate a tag is written on ("DEMO"), which rides on the right of the board's top edge. */
export const TAG_PLATE_PADDING = 2;
const WIDEST_TAG_PLATE = 27;

export const TOPPER_WIDTH = 13;
export const TOPPER_HEIGHT = 11;

export type PlacedSign = {
  readonly style: SignStyleName;
  /** The name, as the sign spells it. */
  readonly lines: readonly string[];
  readonly board: Rect;
  /** The top left of each line's first letter. */
  readonly lineAt: readonly Point[];
  /** The top left of the shape on top of the board. */
  readonly topperAt: Point;
  /** The board and its topper together. */
  readonly bounds: Rect;
};

/** A sign for `name`, centred on `middleX`, its lowest row at `bottomY`. */
export function placeSign(
  name: string,
  style: SignStyleName,
  middleX: number,
  bottomY: number,
): PlacedSign {
  const lines = signLinesFor(name);
  const lastLine = lines[lines.length - 1];
  const lettersHeight = hasTails(lastLine) ? GLYPH_HEIGHT : ROWS_ABOVE_TAILS;
  const textHeight = (lines.length - 1) * LINE_HEIGHT + lettersHeight;
  const insetBottom = hasTails(lastLine) ? TEXT_INSET_BOTTOM_WITH_TAILS : TEXT_INSET_BOTTOM;
  const textWidth = Math.max(...lines.map((line) => measureText(line).width));

  const width = Math.max(NARROWEST_BOARD, textWidth + 2 * TEXT_INSET_X);
  const height = TEXT_INSET_TOP + textHeight + insetBottom;
  const board: Rect = {
    x: middleX - (width - 1) / 2,
    y: bottomY - height + 1,
    width,
    height,
  };
  // The topper keeps to the left of where a tag rides, so the two never fight for room.
  const roomLeftOfTag = width - WIDEST_TAG_PLATE;
  const topperAt: Point = {
    x: board.x + Math.floor((roomLeftOfTag - TOPPER_WIDTH) / 2),
    y: board.y - TOPPER_HEIGHT + 1,
  };
  return {
    style,
    lines,
    board,
    lineAt: lines.map((line, lineNumber) => ({
      x: board.x + Math.floor((width - measureText(line).width) / 2),
      y: board.y + TEXT_INSET_TOP + lineNumber * LINE_HEIGHT,
    })),
    topperAt,
    bounds: {
      x: board.x,
      y: topperAt.y,
      width,
      height: board.y + height - topperAt.y,
    },
  };
}

export type SignState = {
  /** False on a dark house: every tube and bulb is off. */
  readonly isLit: boolean;
  /** A letter whose tube has buzzed out for a moment, counted along the whole name; null when all glow. */
  readonly letterOut: number | null;
  /** Which bulbs of the frame are bright. It steps on, so the lights seem to run round the board. */
  readonly bulbStep: number;
  /** How far round a tube frame its glint has run, in pixels. It keeps counting; the frame wraps it. */
  readonly glintStep: number;
  readonly topperIsBright: boolean;
};

const BULB_STEP_MS = 260;
const GLINT_STEP_MS = 60;
const GLINT_LENGTH = 3;
export const BULBS_IN_A_RUN = 3;
const BUZZ_EVERY_MS = 5300;
const BUZZ_STAGGER_MS = 900;
const BUZZ_FLASH_MS = 90;
const TOPPER_ROUND_MS = 1400;
const TOPPER_DIM_MS = 300;
// Small, so that every sign in the village has its topper bright in the same saved frame.
const TOPPER_STAGGER_MS = 100;

/** What a sign is doing at one moment. `turn` staggers the signs so they never blink together. */
export function signStateAt(timeMs: number, turn: number, letters: number, isLit: boolean = true): SignState {
  const time = Math.max(0, timeMs);
  if (!isLit) return { isLit: false, letterOut: null, bulbStep: 0, glintStep: 0, topperIsBright: false };

  const buzzEvery = BUZZ_EVERY_MS + turn * BUZZ_STAGGER_MS;
  const untilNextBuzz = buzzEvery - (time % buzzEvery);
  // Two quick dropouts just before each round ends, like a tired tube.
  const isOut =
    (untilNextBuzz <= 4 * BUZZ_FLASH_MS && untilNextBuzz > 3 * BUZZ_FLASH_MS) ||
    untilNextBuzz <= BUZZ_FLASH_MS;
  const round = Math.floor(time / buzzEvery);
  const sinceTopperRound = (time + TOPPER_ROUND_MS / 2 + turn * TOPPER_STAGGER_MS) % TOPPER_ROUND_MS;
  return {
    isLit: true,
    letterOut: isOut && letters > 0 ? (round * 7 + turn * 3) % letters : null,
    bulbStep: Math.floor(time / BULB_STEP_MS) % BULBS_IN_A_RUN,
    glintStep: Math.floor(time / GLINT_STEP_MS) + turn * 17,
    topperIsBright: sinceTopperRound >= TOPPER_DIM_MS,
  };
}

function isOnChequer(x: number, y: number): boolean {
  return (((x + y) % 2) + 2) % 2 === 0;
}

function isOnSparseDots(x: number, y: number): boolean {
  return (((x + 2 * y) % 4) + 4) % 4 === 0;
}

const HALO_NEAR_REACH = 2;
const HALO_FAR_REACH = 5;

function drawHalo(surface: Surface, board: Rect, style: SignStyle): void {
  const right = board.x + board.width - 1;
  const bottom = board.y + board.height - 1;
  for (let y = board.y - HALO_FAR_REACH; y <= bottom + HALO_FAR_REACH; y += 1) {
    for (let x = board.x - HALO_FAR_REACH; x <= right + HALO_FAR_REACH; x += 1) {
      const outside = Math.hypot(
        Math.max(board.x - x, 0, x - right),
        Math.max(board.y - y, 0, y - bottom),
      );
      if (outside === 0) continue;
      if (outside <= HALO_NEAR_REACH && isOnChequer(x, y)) setPixel(surface, x, y, style.haloNear);
      // Below the board is the roof, which the far speckles would only make noisy.
      else if (y <= bottom && outside <= HALO_FAR_REACH && isOnSparseDots(x, y)) {
        setPixel(surface, x, y, style.haloFar);
      }
    }
  }
}

/** Every pixel of the frame, in order round the board from its top left. */
function framePixels(board: Rect): Point[] {
  const left = board.x + BOARD_RIM;
  const top = board.y + BOARD_RIM;
  const right = board.x + board.width - 1 - BOARD_RIM;
  const bottom = board.y + board.height - 1 - BOARD_RIM;
  const pixels: Point[] = [];
  for (let x = left; x < right; x += 1) pixels.push({ x, y: top });
  for (let y = top; y < bottom; y += 1) pixels.push({ x: right, y });
  for (let x = right; x > left; x -= 1) pixels.push({ x, y: bottom });
  for (let y = bottom; y > top; y -= 1) pixels.push({ x: left, y });
  return pixels;
}

function drawFrame(surface: Surface, board: Rect, style: SignStyle, state: SignState): void {
  const pixels = framePixels(board);
  if (style.frame === "tube") {
    const colour = state.isLit ? style.frameBright : style.frameDim;
    const corners = new Set([0, board.width - 3, board.width + board.height - 6, 2 * board.width + board.height - 9]);
    // A bent tube has round corners: the corner pixels stay dark.
    pixels.forEach((pixel, index) => {
      if (!corners.has(index)) setPixel(surface, pixel.x, pixel.y, colour);
    });
    if (!state.isLit) return;
    // A hot spot runs round the tube, the way the gas in a real one never sits still.
    for (let part = 0; part < GLINT_LENGTH; part += 1) {
      const index = (state.glintStep + part) % pixels.length;
      if (!corners.has(index)) setPixel(surface, pixels[index].x, pixels[index].y, "cream");
    }
    return;
  }
  pixels.forEach((pixel, index) => {
    if (index % 2 !== 0) return;
    const bulb = index / 2;
    const isBright = state.isLit && (bulb + state.bulbStep) % BULBS_IN_A_RUN !== 0;
    setPixel(surface, pixel.x, pixel.y, isBright ? style.frameBright : style.frameDim);
  });
}

function drawLetters(surface: Surface, sign: PlacedSign, style: SignStyle, state: SignState): void {
  const letterPitch = GLYPH_WIDTH + LETTER_GAP;
  let lettersBefore = 0;
  const tubes: { x: number; y: number; glows: boolean }[] = [];

  sign.lines.forEach((line, lineNumber) => {
    const at = sign.lineAt[lineNumber];
    cachedInkOf(line).forEach((row, y) => {
      row.forEach((hasInk, x) => {
        if (!hasInk) return;
        const letter = lettersBefore + Math.floor(x / letterPitch);
        tubes.push({ x: at.x + x, y: at.y + y, glows: state.isLit && state.letterOut !== letter });
      });
    });
    lettersBefore += lettersIn(line);
  });

  for (const tube of tubes.filter((candidate) => candidate.glows)) {
    setPixel(surface, tube.x - 1, tube.y, style.lettersGlow);
    setPixel(surface, tube.x + 1, tube.y, style.lettersGlow);
    setPixel(surface, tube.x, tube.y - 1, style.lettersGlow);
    setPixel(surface, tube.x, tube.y + 1, style.lettersGlow);
  }
  for (const tube of tubes) {
    setPixel(surface, tube.x, tube.y, tube.glows ? style.letters : style.lettersGlow);
  }
}

const topperRows: Record<SignTopper, readonly string[]> = {
  tick: [
    "....kkkkk....",
    "..kkkkkkkkk..",
    ".kkkkkkkkkNk.",
    ".kkkkkkkkNNk.",
    "kkkkkkkkNNkkk",
    "kkNkkkkNNkkkk",
    "kkNNkkNNkkkkk",
    "kkkNNNNkkkkkk",
    "kkkkNNkkkkkkk",
    ".kkkkkkkkkkk.",
    ".kkkkkkkkkkk.",
  ],
  arrow: [
    "....kkkkk....",
    "....kNNNk....",
    "....kNNNk....",
    "....kNNNk....",
    "kkkkkNNNkkkkk",
    "kNNNNNNNNNNNk",
    "kkNNNNNNNNNkk",
    ".kkNNNNNNNkk.",
    "..kkNNNNNkk..",
    "...kkNNNkk...",
    "....kkNkk....",
  ],
  star: [
    "......k......",
    ".....kNk.....",
    ".....kNk.....",
    "kkkkkNNNkkkkk",
    "kNNNNNNNNNNNk",
    ".kkNNNNNNNkk.",
    "..kkNNNNNkk..",
    "..kNNNNNNNk..",
    "..kNNNkNNNk..",
    ".kNNkkkkkNNk.",
    ".kkkk...kkkk.",
  ],
};

const topperSprites = new Map<string, Sprite>();

function topperSprite(topper: SignTopper, colour: ColourName): Sprite {
  const key = `${topper} ${colour}`;
  let sprite = topperSprites.get(key);
  if (!sprite) {
    sprite = spriteFromRows(topperRows[topper], { k: "ink", N: colour });
    topperSprites.set(key, sprite);
  }
  return sprite;
}

export function drawSign(surface: Surface, sign: PlacedSign, state: SignState): void {
  const style: SignStyle = signStyles[sign.style];
  const { board } = sign;
  if (state.isLit) drawHalo(surface, board, style);
  fillRect(surface, board.x, board.y, board.width, board.height, "ink");
  drawFrame(surface, board, style, state);
  drawLetters(surface, sign, style, state);
  drawSprite(
    surface,
    topperSprite(style.topper, state.topperIsBright ? style.topperBright : style.topperDim),
    sign.topperAt.x,
    sign.topperAt.y,
  );
}

export type PlateColours = {
  readonly paper: ColourName;
  readonly words: ColourName;
};

/** The size of a small flat plate with `text` painted on it. */
export function plateSizeFor(text: string): { width: number; height: number } {
  const lettersHeight = text.split("\n").some(hasTails) ? GLYPH_HEIGHT : ROWS_ABOVE_TAILS;
  const lines = text.split("\n").length;
  return {
    width: measureText(text).width + 2 * TAG_PLATE_PADDING,
    height: (lines - 1) * LINE_HEIGHT + lettersHeight + 2 * TAG_PLATE_PADDING,
  };
}

/** A flat painted plate, dark-edged, with plain words on it. `x`, `y` is its top left. */
export function drawPlate(surface: Surface, text: string, x: number, y: number, colours: PlateColours): void {
  const { width, height } = plateSizeFor(text);
  fillRect(surface, x, y, width, height, "ink");
  fillRect(surface, x + 1, y + 1, width - 2, height - 2, colours.paper);
  drawText(surface, text, x + TAG_PLATE_PADDING, y + TAG_PLATE_PADDING, colours.words);
}
