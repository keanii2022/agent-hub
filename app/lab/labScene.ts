import {
  clear,
  colourNames,
  drawSprite,
  drawText,
  fillRect,
  frameAt,
  measureText,
  outlineRect,
  spriteFromRows,
  type Animation,
  type ColourKey,
  type Surface,
} from "../../lib/village/engine";

const MARGIN = 10;

const SWATCH_COLUMNS = 7;
const SWATCH_WIDTH = 48;
const SWATCH_HEIGHT = 12;
const SWATCH_COLUMN_STEP = 52;
const SWATCH_ROW_STEP = 25;
const PALETTE_TOP = 20;

const SAMPLE_TEXT_TOP = 126;
const SAMPLE_TEXT_LINE_STEP = 11;

const SPRITE_ROW_TOP = 172;
const MOVING_SPRITE_TOP = 194;
const MOVING_SPRITE_LEFT = 60;
const MOVING_SPRITE_RIGHT = 358;
const THERE_AND_BACK_MS = 6000;

const fireColours: ColourKey = {
  e: "ember",
  s: "sunset",
  l: "lamp",
  c: "cream",
  w: "wood",
  b: "bark",
};

const logs = ["..bwwwwwwwwb....", ".bwwbwwwwbwwb...", "..bbbbbbbbbb...."];

const campfire: Animation = {
  frameMs: 160,
  frames: [
    spriteFromRows(
      [
        "................",
        "......s.........",
        "......ss........",
        ".....sss........",
        ".....slss.......",
        "....sslls..s....",
        "....sllls.......",
        "...ssllllss.....",
        "...sllcclls.....",
        "..esllccllse....",
        "..eslccccllse...",
        "..eesllccllsee..",
        "...eessllssee...",
        ...logs,
      ],
      fireColours,
    ),
    spriteFromRows(
      [
        ".......s........",
        ".......s........",
        "......sss.......",
        "......sls.......",
        ".....sslss......",
        ".....sllls......",
        "....sslllss.....",
        "....sllclls.....",
        "...ssllcclss....",
        "..esllcccllse...",
        "..eslccccclse...",
        "..eesllcllsee...",
        "...eesslssee....",
        ...logs,
      ],
      fireColours,
    ),
    spriteFromRows(
      [
        "................",
        ".........s......",
        "........ss......",
        "...s....sss.....",
        ".......ssls.....",
        "......sllss.....",
        ".....sslls......",
        "....sslllss.....",
        "...sllccllss....",
        "..esllccclse....",
        "..esllccccse....",
        "..eeslccllsee...",
        "...eesslssee....",
        ...logs,
      ],
      fireColours,
    ),
  ],
};

function drawPalette(surface: Surface): void {
  colourNames.forEach((name, position) => {
    const left = MARGIN + (position % SWATCH_COLUMNS) * SWATCH_COLUMN_STEP;
    const top = PALETTE_TOP + Math.floor(position / SWATCH_COLUMNS) * SWATCH_ROW_STEP;
    fillRect(surface, left, top, SWATCH_WIDTH, SWATCH_HEIGHT, name);
    outlineRect(surface, left - 1, top - 1, SWATCH_WIDTH + 2, SWATCH_HEIGHT + 2, "slate");
    drawText(surface, name, left, top + SWATCH_HEIGHT + 2, "mist");
  });
}

function drawSampleText(surface: Surface): void {
  const lines = [
    { text: "The quick brown fox jumps over the lazy dog.", colour: "cream" },
    { text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789", colour: "peach" },
    { text: "abcdefghijklmnopqrstuvwxyz", colour: "cyan" },
    { text: "!?.,:;'\"()[]{}<>+-*/=_#@&%$^~|\\`", colour: "pink" },
  ] as const;
  lines.forEach((line, lineNumber) => {
    drawText(
      surface,
      line.text,
      MARGIN,
      SAMPLE_TEXT_TOP + lineNumber * SAMPLE_TEXT_LINE_STEP,
      line.colour,
    );
  });
}

function drawSampleSprite(surface: Surface, timeMs: number): void {
  const labelTop = SPRITE_ROW_TOP + 4;

  drawText(surface, "frames", MARGIN, labelTop, "mist");
  campfire.frames.forEach((frame, frameNumber) => {
    drawSprite(surface, frame, 52 + frameNumber * 20, SPRITE_ROW_TOP);
  });

  drawText(surface, "playing", 130, labelTop, "mist");
  drawSprite(surface, frameAt(campfire, timeMs), 178, SPRITE_ROW_TOP);

  drawText(surface, "mirrored", 210, labelTop, "mist");
  drawSprite(surface, frameAt(campfire, timeMs), 264, SPRITE_ROW_TOP, { flipX: true });

  const partOfTrip = (timeMs % THERE_AND_BACK_MS) / THERE_AND_BACK_MS;
  const headingBack = partOfTrip >= 0.5;
  const partOfWay = headingBack ? 2 - partOfTrip * 2 : partOfTrip * 2;
  drawText(surface, "moving", MARGIN, MOVING_SPRITE_TOP + 4, "mist");
  drawSprite(
    surface,
    frameAt(campfire, timeMs),
    MOVING_SPRITE_LEFT + partOfWay * (MOVING_SPRITE_RIGHT - MOVING_SPRITE_LEFT),
    MOVING_SPRITE_TOP,
    { flipX: headingBack },
  );
}

export function drawLabScene(surface: Surface, timeMs: number, paused: boolean): void {
  clear(surface, "night");

  drawText(surface, "Pixel engine lab", MARGIN, 6, "cream");
  const seconds = (timeMs / 1000).toFixed(1);
  const clockText = paused ? `paused at ${seconds} s` : `time ${seconds} s`;
  drawText(
    surface,
    clockText,
    surface.width - MARGIN - measureText(clockText).width,
    6,
    paused ? "lamp" : "mist",
  );

  drawPalette(surface);
  drawSampleText(surface);
  drawSampleSprite(surface, timeMs);
}
