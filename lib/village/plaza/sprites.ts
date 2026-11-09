import { spriteFromRows, type ColourKey, type Sprite } from "../engine";
import { clumpedFoliage, dotted, skirtedFoliage, type FoliageTones } from "./foliage";
import type { ClutterKind, PlantKind, TreeKind } from "./layout";

const colours: ColourKey = {
  k: "ink",
  n: "night",
  S: "slate",
  t: "stone",
  i: "mist",
  u: "cloud",
  c: "cream",
  b: "bark",
  w: "wood",
  y: "clay",
  a: "sand",
  o: "sunset",
  l: "lamp",
  E: "ember",
  C: "cyan",
  I: "lime",
  m: "mauve",
  r: "rose",
  p: "plum",
  P: "pine",
  M: "moss",
  L: "leaf",
  G: "grass",
  K: "pink",
  V: "violet",
};

const greenLeaves: FoliageTones = {
  rim: "grass",
  light: "leaf",
  mid: "moss",
  dark: "pine",
  outline: "ink",
};

const blossomLeaves: FoliageTones = {
  rim: "peach",
  light: "rose",
  mid: "mauve",
  dark: "plum",
  outline: "ink",
};

const firNeedles: FoliageTones = {
  rim: "leaf",
  light: "moss",
  mid: "pine",
  dark: "night",
  outline: "ink",
};

export type TreeSprites = {
  readonly trunk: Sprite;
  readonly leaves: Sprite;
  /** How many rows of trunk show below the leaves. */
  readonly bareTrunkRows: number;
};

const thickTrunk = spriteFromRows(
  [
    ".kbwbk.",
    ".kbwbk.",
    ".kbwbk.",
    ".kbbbk.",
    ".kbwbk.",
    ".kbwbk.",
    ".kbwbk.",
    ".kbbwk.",
    "kbbwbbk",
    "kkkkkkk",
  ],
  colours,
);

const thinTrunk = spriteFromRows([".kbk.", ".kwk.", ".kbk.", ".kbk.", ".kwk.", "kbbbk", "kkkkk"], colours);

const stubTrunk = spriteFromRows([".kbwk.", ".kbwk.", ".kbbk.", ".kbwk.", "kbbwbk", "kkkkkk"], colours);

export const treeSprites: Record<TreeKind, TreeSprites> = {
  oak: {
    trunk: thickTrunk,
    bareTrunkRows: 6,
    leaves: clumpedFoliage(
      30,
      24,
      [
        { x: 9, y: 10, radius: 6 },
        { x: 20, y: 10, radius: 6 },
        { x: 15, y: 7, radius: 6.5 },
        { x: 7, y: 15, radius: 6 },
        { x: 22, y: 15, radius: 6 },
        { x: 14, y: 16, radius: 6.5 },
      ],
      greenLeaves,
    ),
  },
  blossom: {
    trunk: thickTrunk,
    bareTrunkRows: 7,
    leaves: clumpedFoliage(
      30,
      22,
      [
        { x: 15, y: 7, radius: 6 },
        { x: 8, y: 9, radius: 5.5 },
        { x: 22, y: 10, radius: 6 },
        { x: 6, y: 14, radius: 5 },
        { x: 14, y: 14, radius: 6.5 },
        { x: 23, y: 15, radius: 5 },
      ],
      blossomLeaves,
    ),
  },
  pine: {
    trunk: stubTrunk,
    bareTrunkRows: 3,
    leaves: skirtedFoliage(
      19,
      31,
      [
        { top: 0, bottom: 9, halfWidth: 4 },
        { top: 6, bottom: 16, halfWidth: 6 },
        { top: 13, bottom: 23, halfWidth: 8 },
        { top: 20, bottom: 30, halfWidth: 9 },
      ],
      firNeedles,
    ),
  },
  sapling: {
    trunk: thinTrunk,
    bareTrunkRows: 5,
    leaves: clumpedFoliage(
      15,
      12,
      [
        { x: 4, y: 7, radius: 4 },
        { x: 10, y: 7, radius: 4 },
        { x: 7, y: 4, radius: 4 },
      ],
      greenLeaves,
    ),
  },
};

const bush = clumpedFoliage(
  14,
  10,
  [
    { x: 4, y: 6, radius: 3.5 },
    { x: 10, y: 6, radius: 3.5 },
    { x: 7, y: 4, radius: 4 },
  ],
  greenLeaves,
);

const flowerRows = [
  ".F...F.",
  "FlF.FlF",
  ".F.F.F.",
  ".MFlFM.",
  ".M.F.M.",
  ".M.M.M.",
  "..MMM..",
];

export const plantSprites: Record<PlantKind, Sprite> = {
  bush,
  "flowering bush": dotted(bush, [
    { x: 4, y: 3, colour: "pink" },
    { x: 8, y: 2, colour: "lamp" },
    { x: 10, y: 5, colour: "pink" },
    { x: 6, y: 6, colour: "lamp" },
    { x: 3, y: 6, colour: "pink" },
    { x: 11, y: 7, colour: "lamp" },
  ]),
  fern: spriteFromRows(
    [
      "....L....",
      ".L..L..L.",
      "..L.M.L..",
      "L.LMMML.L",
      ".LMMMMML.",
      "..kMMMk..",
      "...kkk...",
    ],
    colours,
  ),
  "pink flowers": spriteFromRows(flowerRows, { ...colours, F: "pink" }),
  "violet flowers": spriteFromRows(flowerRows, { ...colours, F: "violet" }),
};

export const clutterSprites: Record<ClutterKind, Sprite> = {
  // Torn shoulder with loose wires on the left, elbow joint in the middle, a three-fingered hand on the right.
  "robot arm lying down": spriteFromRows(
    [
      "...................................kkk",
      ".............kkkkkkk...........kkkkiik",
      "..kkkkkkkkkkkkoooookkkkkkkkkkkkuiiikk.",
      "E.kSSuuuuuuuukoloookuuuuuuuookuiikkkkk",
      ".lkSSiiiiiiiikookookiiiiiiiookuiiiiiik",
      "C.kSSttttttttkoooooktttttttookuitkkkkk",
      ".Ekkkkkkkkkkkkoooookkkkkkkkkkkkuttkk..",
      ".............kkkkkkk...........kkkttk.",
      "..................................kkk.",
    ],
    colours,
  ),
  // Upper arm flat on the ground, forearm standing, fingers spread to the sky. The middle finger has snapped short.
  "robot arm reaching up": spriteFromRows(
    [
      ".....k.........k....",
      "....kik.......kik...",
      "....kik.......kik...",
      ".....kik.....kik....",
      ".....ktk.kkk.ktk....",
      "......kikkikkik.....",
      "......kikkikkik.....",
      ".......kikikik......",
      "......kuiiiiitk..kk.",
      "......kuiiiiitkkkik.",
      "......kuiiiiiiiitk..",
      "......kuiiiittkkk...",
      ".......kkuitkk......",
      "........koook.......",
      "........kuitk.......",
      "........kuitk.......",
      "........kuitk.......",
      "........kuitk.......",
      "........kuitk.......",
      ".......kkkkkkk......",
      ".kkkkkkkoooook......",
      "lkuuuuukoloook......",
      ".kiiiiikookook......",
      "Ektttttkoooook......",
      ".kkkkkkkoooook......",
      ".......kkkkkkk......",
    ],
    colours,
  ),
  // Orange filter, white paper, grey ash.
  "cigarette butt": spriteFromRows(["ooccct", "yyuuuk"], colours),
  // Stubbed out: the paper has kinked where it was pressed down.
  "bent cigarette butt": spriteFromRows(["oo...", "yycc.", "..uut"], colours),
};

const LAMP_POLE_ROWS = 22;

export const lampPost = spriteFromRows(
  [
    ".....kkk.....",
    "....kSSSk....",
    "..kkStttSkk..",
    ".kkkkkkkkkkk.",
    "..klllllllk..",
    "..kllcccllk..",
    "..kllcccllk..",
    "...klccclk...",
    "...klllllk...",
    "...kkkkkkk...",
    "....kStSk....",
    ...Array.from({ length: LAMP_POLE_ROWS }, (_, row) => (row < 8 ? ".....ktk....." : ".....kSk.....")),
    "....kSSSk....",
    "...kStSSSk...",
    "...kkkkkkk...",
  ],
  colours,
);

/** The middle of the lamp's glass, measured from the top left of `lampPost`. */
export const LAMP_GLASS = { x: 6, y: 6 } as const;

export const chair = spriteFromRows(
  [
    ".kk..........",
    "krrk.........",
    "krmk.........",
    "krmk.........",
    "krmk.........",
    "krmk.........",
    "kmmk.........",
    "kSSk.........",
    "kSSk.........",
    "kSSkkkkkkkkk.",
    ".krrrrrrrrrmk",
    "..kkkkkkkkkk.",
    "......kSk....",
    "..kkkkkSkkkk.",
    ".kSk..kkk.kSk",
  ],
  colours,
);

const TABLE_INSIDE_WIDTH = 39;
const KNEE_ROOM_WIDTH = 19;
const DRAWER_INSIDE_WIDTH = 17;

/** `grainAt` lists where a short darker streak of wood grain starts, counted from the left edge of the top. */
function tableTopRow(letter: string, grainAt: readonly number[] = []): string {
  const inside = Array.from({ length: TABLE_INSIDE_WIDTH }, (_, x) =>
    grainAt.some((start) => x >= start && x < start + 4) ? "w" : letter,
  );
  return `k${inside.join("")}k`;
}

function tableLegRow(drawerRow: string): string {
  return `kwk${".".repeat(KNEE_ROOM_WIDTH)}k${drawerRow}k`;
}

const plainDrawerRow = "w".repeat(DRAWER_INSIDE_WIDTH);
const drawerHandleRow = `${"w".repeat(7)}aaa${"w".repeat(7)}`;
const betweenDrawersRow = "b".repeat(DRAWER_INSIDE_WIDTH);

export const table = spriteFromRows(
  [
    `.${"k".repeat(TABLE_INSIDE_WIDTH)}.`,
    tableTopRow("a"),
    tableTopRow("y"),
    tableTopRow("y", [31]),
    tableTopRow("y"),
    tableTopRow("y", [11, 26]),
    tableTopRow("y"),
    tableTopRow("a"),
    tableTopRow("w"),
    "k".repeat(TABLE_INSIDE_WIDTH + 2),
    tableLegRow(plainDrawerRow),
    tableLegRow(drawerHandleRow),
    tableLegRow(betweenDrawersRow),
    tableLegRow(plainDrawerRow),
    tableLegRow(drawerHandleRow),
    tableLegRow(plainDrawerRow),
    `kkk${".".repeat(KNEE_ROOM_WIDTH)}${"k".repeat(DRAWER_INSIDE_WIDTH + 2)}`,
  ],
  colours,
);

export const keyboard = spriteFromRows(
  ["titititit", "ititititi", "SSSSSSSSS", "wwwwwwwww"],
  colours,
);

export const KEYBOARD_KEYS_ACROSS = 9;

export const mug = spriteFromRows([".bbb.", "kEEEk", "kEEEE", "kEEEk", ".kkk."], colours);

export const computer = spriteFromRows(
  [
    "....kkkkkkkkkkk.",
    "..kkuuuuuuuuuuk.",
    "kkkkkkkkkkiiiik.",
    "kiiiiiiiikiiiik.",
    "kiPPPPPPikiiiik.",
    "kiPPPPPPikiiitk.",
    "kiPPPPPPikiiitk.",
    "kiPPPPPPikiittk.",
    "kiPPPPPPikiittk.",
    "kiPPPPPPikitttk.",
    "kiiiiiiIikitttk.",
    "kkkkkkkkkkkkkk..",
    "...kttttttk.....",
    "..kkkkkkkkkk....",
  ],
  colours,
);
