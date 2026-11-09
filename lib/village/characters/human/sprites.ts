import { spriteFromRows, type ColourKey, type Sprite } from "../../engine";

/** The box the seated human is drawn in. Its bottom row is the ground his shoes stand on. */
export const HUMAN_WIDTH = 16;
export const HUMAN_HEIGHT = 24;

const colours: ColourKey = {
  k: "ink",
  b: "bark",
  w: "wood",
  e: "peach",
  y: "clay",
  c: "cream",
  H: "teal",
  h: "pine",
  p: "dusk",
  d: "night",
  E: "ember",
};

const openEyes: ColourKey = { ...colours, x: "ink" };
const closedEyes: ColourKey = { ...colours, x: "clay" };

export type PlacedSprite = {
  readonly sprite: Sprite;
  /** Where the sprite's top left sits inside the human's box. */
  readonly x: number;
  readonly y: number;
};

const headInProfileRows = [
  "...kkkkkk...",
  "..kbbbbbbk..",
  ".kbbwwbbbbk.",
  ".kbbbbbbeek.",
  ".kbbbeeeeek.",
  ".kbbyeexeck.",
  ".kbbeeeeecek",
  "..kbeeeeeck.",
  "..kkeeeyek..",
  "....keek....",
];

const headFacingViewerRows = [
  "...kkkkkk...",
  "..kbbbbbbk..",
  ".kbbwwbbbbk.",
  ".kbbbbbbbbk.",
  ".kbeeeeeebk.",
  ".keexeexeek.",
  ".keeeeeeeek.",
  "..keeyyeek..",
  "..kkeeeekk..",
  "....keek....",
];

export const heads = {
  inProfile: {
    open: spriteFromRows(headInProfileRows, openEyes),
    closed: spriteFromRows(headInProfileRows, closedEyes),
  },
  facingViewer: {
    open: spriteFromRows(headFacingViewerRows, openEyes),
    closed: spriteFromRows(headFacingViewerRows, closedEyes),
  },
};

export const body: PlacedSprite = {
  x: 0,
  y: 10,
  sprite: spriteFromRows(
    [
      "..kkkkkk........",
      ".kHHHHHHk.......",
      "kHHHHHHHk.......",
      "khHHHHHHk.......",
      "khHHHHHHk.......",
      "khHHHHHhkkkkk...",
      "khhHHHhpppppdk..",
      ".kkpppppppppdk..",
      "...kkkkkkkpppk..",
      ".........kdppk..",
      ".........kdppk..",
      ".........kccckk.",
      ".........kcccck.",
      ".........kkkkkk.",
    ],
    colours,
  ),
};

export const arms = {
  nearHandOnKeys: {
    x: 3,
    y: 10,
    sprite: spriteFromRows(
      [
        ".kkkk..........",
        "kHHHHk.........",
        "kHHHHkkkkkkk.yy",
        "khHHHHHHHHHHk..",
        ".khhhhhhhhhkeek",
        "..kkkkkkkkkkeek",
        "............kk.",
      ],
      colours,
    ),
  },
  farHandOnKeys: {
    x: 3,
    y: 10,
    sprite: spriteFromRows(
      [
        ".kkkk..........",
        "kHHHHk.........",
        "kHHHHkkkkkkkkk.",
        "khHHHHHHHHHkeek",
        ".khhhhhhhhhkeek",
        "..kkkkkkkkkk.yy",
      ],
      colours,
    ),
  },
  restingOnKeys: {
    x: 3,
    y: 10,
    sprite: spriteFromRows(
      [
        ".kkkk..........",
        "kHHHHk.........",
        "kHHHHkkkkkkk...",
        "khHHHHHHHHHHk..",
        ".khhhhhhhhhkeek",
        "..kkkkkkkkkkeek",
        "............kk.",
      ],
      colours,
    ),
  },
  reachingForMug: {
    x: 3,
    y: 9,
    sprite: spriteFromRows(
      [
        "............kk.",
        ".kkkk.....kkeek",
        "kHHHHk..kkHHeek",
        "kHHHHkkkHHHHkk.",
        "khHHHHHHHhkk...",
        ".khhhhhhkk.....",
        "..kkkkkk.......",
      ],
      colours,
    ),
  },
  mugAtMouth: {
    x: 3,
    y: 5,
    sprite: spriteFromRows(
      [
        ".........kkk.",
        "........kEEEk",
        "........kEEEk",
        "........keeEk",
        ".......kHekk.",
        ".kkkk.kHHk...",
        "kHHHHkHHk....",
        "kHHHHHHk.....",
        "khHHHHk......",
        ".khhhk.......",
        "..kkk........",
      ],
      colours,
    ),
  },
  // Only the elbow shows, pointing back; the hands are hidden behind his head.
  behindHead: {
    x: -4,
    y: 2,
    sprite: spriteFromRows(
      [
        "....kkk..",
        "...kHHHk.",
        "..kHHHHk.",
        ".kHHHHk..",
        "kHHHHk...",
        "khHHHk...",
        ".khHHHk..",
        "..khHHHk.",
        "...khHHHk",
        "....khhHk",
        ".....kkk.",
      ],
      colours,
    ),
  },
} satisfies Record<string, PlacedSprite>;

/** Offsets inside the human's box that other things line up with. */
export const humanPoints = {
  /** Where a visitor's hand lands when tapping him on the shoulder. */
  shoulder: { x: 2, y: 11 },
  /** The middle of his shoes, on the ground. */
  feet: { x: 11, y: 23 },
} as const;
