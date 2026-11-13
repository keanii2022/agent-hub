import { spriteFromRows, type ColourKey, type ColourName, type Sprite } from "../engine";

// The agents are robots, built from the same metal as the broken arms lying
// around the plaza: cloud and mist plates, stone shadows, sunset joints.

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
  P: "pine",
  I: "lime",
  m: "mauve",
  r: "rose",
  p: "plum",
  T: "teal",
};

// Letters the looks below fill in: A the antenna's bulb, e and f the upper and
// lower half of the eye, C the stripe painted across the top of the head.
const freshHeadRows = [
  "......A.......",
  "......k.......",
  "..kkkkkkkkk...",
  ".kuuuuCCCCuk..",
  ".kiiiiiikkik..",
  ".kiiiiikeekk..",
  ".kiiiiikffkk..",
  ".kiiiiiikkik..",
  ".kttttttttik..",
  "..kkkkkkkkk...",
];

// Long hours show: a bent antenna, a plaster over a dent, rust on the jaw and a dark ring under the eye.
const wornOutHeadRows = [
  ".......A......",
  "......k.......",
  "..kkkkkkkkk...",
  ".kuaauCCCCuk..",
  ".kiaaiiikkik..",
  ".kitiiikeekk..",
  ".kiiiiikffkk..",
  ".kiiiiiSSSik..",
  ".kttyytttiik..",
  "..kkkkkkkkk...",
];

const bodyRows = [
  "....kSSk......",
  "..kkkkkkkk....",
  "..kuiiiiik....",
  "..kiiiiiik....",
  "..kiiiiitk....",
  "..kiiiittkkkk.",
  "..ktttttiiiik.",
  "..kkkkkkkkkik.",
  "..........kik.",
  ".........kkkk.",
];

export type RobotEye = "wide open" | "half shut" | "shut" | "dimmed";

const eyeColours: Record<RobotEye, { upper: ColourName; lower: ColourName }> = {
  "wide open": { upper: "cyan", lower: "cyan" },
  "half shut": { upper: "stone", lower: "cyan" },
  shut: { upper: "stone", lower: "stone" },
  dimmed: { upper: "stone", lower: "teal" },
};

export type RobotLook = {
  readonly isWornOut: boolean;
  readonly eye: RobotEye;
  /** The colour of the bulb on its antenna right now. */
  readonly bulb: ColourName;
  /** The agent's own colour, painted as a stripe across the top of its head. */
  readonly stripe: ColourName;
};

const robotSprites = new Map<string, Sprite>();

/** A seated robot in profile, facing right, without its arm. Its bottom row is the floor its foot stands on. */
export function robotSprite(look: RobotLook): Sprite {
  const key = `${look.isWornOut} ${look.eye} ${look.bulb} ${look.stripe}`;
  let sprite = robotSprites.get(key);
  if (!sprite) {
    const eye = eyeColours[look.eye];
    sprite = spriteFromRows([...(look.isWornOut ? wornOutHeadRows : freshHeadRows), ...bodyRows], {
      ...colours,
      A: look.bulb,
      e: eye.upper,
      f: eye.lower,
      C: look.stripe,
    });
    robotSprites.set(key, sprite);
  }
  return sprite;
}

export type PlacedSprite = {
  readonly sprite: Sprite;
  /** Where the sprite's top left sits inside the station's box. */
  readonly x: number;
  readonly y: number;
};

/** Where the robot's box sits inside the station's box. */
export const ROBOT_AT = { x: 1, y: 2 } as const;

export const stool: PlacedSprite = {
  x: 2,
  y: 19,
  sprite: spriteFromRows(["kkkkkkkkk", "krrrrrrmk", "kkkkSkkkk"], colours),
};

export const arms = {
  handOnTheKeys: {
    x: 4,
    y: 13,
    sprite: spriteFromRows(
      [".kkk...........", "kolokkkkkkkkk..", "koookiiiiiiiuk.", ".kkkkkkkkkkkkk."],
      colours,
    ),
  },
  handLifted: {
    x: 4,
    y: 13,
    sprite: spriteFromRows(
      [".kkk.......kkk.", "kolokkkkkkkiuk.", "koookiiiiiikkk.", ".kkkkkkkkkkk..."],
      colours,
    ),
  },
  hangingDown: {
    x: 4,
    y: 13,
    sprite: spriteFromRows([".kkk.", "kolok", "koook", ".kik.", ".kik.", ".kuk.", ".kkk."], colours),
  },
} satisfies Record<string, PlacedSprite>;

export const desk: PlacedSprite = {
  x: 14,
  y: 10,
  sprite: spriteFromRows(
    [
      "kkkkkkkkkkkkkkkkkkkkkkkkkk",
      "kaaaaaaaaaaaaaaaaaaaaaaaak",
      "kyyyyyyyyyyyyyyyyyyyyyyyyk",
      "kyyyyyyyyyyyyyyyyyyyyyyyyk",
      "kyyyyyyyyyyyyyyyyyyyyyyyyk",
      "kyyyyyyyyyyyyyyyyyyyyyyyyk",
      "kwwwwwwwwwwwwwwwwwwwwwwwwk",
      "kkkkkkkkkkkkkkkkkkkkkkkkkk",
      "kwk.............kwwwwwwwwk",
      "kwk.............kwwwaawwwk",
      "kwk.............kwwwwwwwwk",
      "kkk.............kkkkkkkkkk",
    ],
    colours,
  ),
};

const monitorRows = [
  "...kkkkkkkk.",
  ".kkuuuuuuuk.",
  "kkkkkkkiiik.",
  "kiiiiikiiik.",
  "kiGGGGikiik.",
  "kiGGGGikitk.",
  "kiGGGGikitk.",
  "kiGGGGikttk.",
  "kiiiiLikttk.",
  "kkkkkkkkkk..",
  "..kttttk....",
  ".kkkkkkkk...",
];

/** An old boxy computer seen from the side, its glass facing the chair. */
export const monitor = {
  x: 27,
  y: 1,
  on: spriteFromRows(monitorRows, { ...colours, G: "pine", L: "lime" }),
  off: spriteFromRows(monitorRows, { ...colours, G: "night", L: "stone" }),
  /** The glass, measured from the monitor's top left. */
  glass: { x: 2, y: 4, width: 4, height: 4 },
} as const;

export const keyboard: PlacedSprite = {
  x: 17,
  y: 15,
  sprite: spriteFromRows(["titititi", "SSSSSSSS"], colours),
};

/** A coffee mug left on the desk by whoever has been at it too long. */
export const mug: PlacedSprite = {
  x: 22,
  y: 11,
  sprite: spriteFromRows([".bb.", "kEEk", "kEEE", ".kk."], colours),
};

/** A lamp on the back wall. Its glass is the third row down, in the middle. */
export const wallLamp = spriteFromRows([".kkk.", "klllk", "klclk", "klllk", ".kSk.", "..k.."], colours);
export const WALL_LAMP_GLASS = { x: 2, y: 2 } as const;

/** A fern in a pot: what a room looks like when someone has time to water it. */
export const pottedFern = spriteFromRows(
  [
    "....L....",
    ".L..L..L.",
    "..L.M.L..",
    "L.LMMML.L",
    ".LMMMMML.",
    "..kMMMk..",
    ".kkkkkkk.",
    ".kyyyyak.",
    "..kyyak..",
    "..kkkkk..",
  ],
  { ...colours, L: "leaf", M: "moss" },
);

/** Where the first wisp of steam leaves a robot's head, inside the station's box. */
export const STEAM_FROM = { x: 4, y: 3 } as const;

export const paperBall = spriteFromRows([".cu.", "cuic", ".ii."], colours);
export const emptyCan = spriteFromRows([".tt.", "kook", "kolk", "kook", "kkkk"], colours);
/** Paperwork that never made it off the floor. */
export const paperStack = spriteFromRows(
  ["kkkkkkkk", "kcccccck", "kuiuiuik", "kiuiuiuk", "kuiuiuik", "kiuiuiuk", "kkkkkkkk"],
  colours,
);

/** A rug under the station of an agent with a room to itself. `x`, `y` is where it lies inside the station's box. */
export const rug: PlacedSprite = {
  x: -9,
  y: 15,
  sprite: spriteFromRows(
    [
      `${".m".repeat(28)}.`,
      `k${"m".repeat(55)}k`,
      `km${"p".repeat(53)}mk`,
      `km${"prp".repeat(17)}ppmk`,
      `km${"p".repeat(53)}mk`,
      `km${"prp".repeat(17)}ppmk`,
      `km${"p".repeat(53)}mk`,
      `k${"m".repeat(55)}k`,
      `${".m".repeat(28)}.`,
    ],
    colours,
  ),
};

const BED_POST = "kwk";
const BED_INSIDE_WIDTH = 30;
const LADDER = "k...k";
const LADDER_RUNG = "kkkkk";
const LADDER_FROM_LEFT = 23;

function bedRow(inside: string): string {
  return `${BED_POST}${inside}${BED_POST}`;
}

function gapRow(rowOfGap: number, hasLadder: boolean): string {
  if (!hasLadder) return bedRow(".".repeat(BED_INSIDE_WIDTH));
  const ladder = rowOfGap % 2 === 1 ? LADDER_RUNG : LADDER;
  return bedRow(
    ".".repeat(LADDER_FROM_LEFT) + ladder + ".".repeat(BED_INSIDE_WIDTH - LADDER_FROM_LEFT - ladder.length),
  );
}

/** A pillow at the head, a blanket (B, shaded D) to the foot, on a wooden rail. */
const mattressRows = [
  bedRow(".kkkkkkk" + ".".repeat(22)),
  bedRow("kuuuuuuuk" + "k".repeat(21)),
  bedRow("kuuuuuuuk" + "B".repeat(20) + "k"),
  bedRow("kccccccck" + "B".repeat(20) + "k"),
  bedRow("kkkkkkkkk" + "D".repeat(20) + "k"),
  bedRow("k".repeat(BED_INSIDE_WIDTH)),
  bedRow("w".repeat(BED_INSIDE_WIDTH)),
  bedRow("y".repeat(BED_INSIDE_WIDTH)),
  bedRow("k".repeat(BED_INSIDE_WIDTH)),
];

const postTopsRow = `kkk${".".repeat(BED_INSIDE_WIDTH)}kkk`;
const BED_LEG_ROWS = 2;
const ROWS_BETWEEN_BUNKS = 7;

function recoloured(rows: readonly string[], blanket: string, blanketShade: string): string[] {
  return rows.map((row) => row.replaceAll("B", blanket).replaceAll("D", blanketShade));
}

export const bed = spriteFromRows(
  [
    postTopsRow,
    ...recoloured(mattressRows, "r", "m"),
    ...Array.from({ length: BED_LEG_ROWS }, (_, row) => gapRow(row, false)),
    postTopsRow,
  ],
  colours,
);

export const bunkBed = spriteFromRows(
  [
    postTopsRow,
    ...recoloured(mattressRows, "m", "p"),
    ...Array.from({ length: ROWS_BETWEEN_BUNKS }, (_, row) => gapRow(row, true)),
    ...recoloured(mattressRows, "T", "P"),
    ...Array.from({ length: BED_LEG_ROWS + 1 }, (_, row) => gapRow(row, false)),
    postTopsRow,
  ],
  colours,
);

const shadowOf: Partial<Record<ColourName, ColourName>> = {
  ink: "ink",
  cream: "slate",
  cloud: "slate",
  mist: "slate",
  sand: "slate",
  lamp: "slate",
  peach: "slate",
};

const shadowSprites = new WeakMap<Sprite, Sprite>();

/** The same sprite as it looks with the lights out: its shape in a few dark tones. */
export function inTheDark(sprite: Sprite): Sprite {
  let dark = shadowSprites.get(sprite);
  if (!dark) {
    dark = { ...sprite, pixels: sprite.pixels.map((colour) => (colour ? (shadowOf[colour] ?? "dusk") : null)) };
    shadowSprites.set(sprite, dark);
  }
  return dark;
}
