import { TRANSPARENT_LETTER, spriteFromRows, type ColourKey, type Sprite } from "../../engine";
import type { StridePart } from "../../routes";

/** The box the manager is drawn in. Its bottom row is the ground his shoes stand on. */
export const MANAGER_WIDTH = 18;
export const MANAGER_HEIGHT = 26;

/** Offsets inside the manager's box that other things line up with. */
export const managerPoints = {
  /** The middle of his shoes, on the ground. */
  feet: { x: 9, y: 25 },
  /** His knuckles when they are on a door. */
  knuckles: { x: 14, y: 5 },
  /** The middle of the red band of his hat, while he stands. */
  hatBand: { x: 9, y: 3 },
} as const;

const colours: ColourKey = {
  k: "ink",
  n: "night",
  S: "slate",
  t: "stone",
  i: "mist",
  u: "cloud",
  c: "cream",
  e: "peach",
  E: "ember",
  b: "bark",
  x: "ink",
};

type Part = {
  readonly rows: readonly string[];
  /** Where the part's top left sits inside the manager's box. */
  readonly x: number;
  readonly y: number;
};

function mirrored(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(""));
}

function lowered(part: Part, rows: number = 1): Part {
  return { ...part, y: part.y + rows };
}

/** One picture of the whole manager from its parts, back to front: a later part covers an earlier one. */
function pictureOf(parts: readonly Part[]): Sprite {
  const box = Array.from({ length: MANAGER_HEIGHT }, () =>
    Array.from({ length: MANAGER_WIDTH }, () => TRANSPARENT_LETTER),
  );
  for (const part of parts) {
    part.rows.forEach((row, rowNumber) => {
      [...row].forEach((letter, column) => {
        if (letter !== TRANSPARENT_LETTER) box[part.y + rowNumber][part.x + column] = letter;
      });
    });
  }
  return spriteFromRows(
    box.map((row) => row.join("")),
    colours,
  );
}

// Heads, bodies and legs are 14 wide and sit two pixels in from the box's
// left edge, which leaves room at the sides for a swinging or a raised arm.
const BODY_X = 2;
const HEAD_ROWS = 10;

function head(rows: readonly string[]): Part {
  return { rows, x: BODY_X, y: 0 };
}

function torso(rows: readonly string[]): Part {
  return { rows, x: BODY_X, y: HEAD_ROWS };
}

/** Legs always end on the ground, however many rows they are. */
function legs(rows: readonly string[]): Part {
  return { rows, x: BODY_X, y: MANAGER_HEIGHT - rows.length };
}

const headFromTheSide = head([
  "....kkkkkk....",
  "...knnnnnnk...",
  "...knnnnSnk...",
  "...kEEEEEEk...",
  "..kkkkkkkkkkkk",
  "...kbeeeeek...",
  "...kbeeexek...",
  "...keeeeeeek..",
  "....keeebek...",
  ".....keek.....",
]);

const headFromTheFront = head([
  "....kkkkkk....",
  "...knnnnnnk...",
  "...knSnnnnk...",
  "...kEEEEEEk...",
  ".kkkkkkkkkkkk.",
  "...keeeeeek...",
  "...kexeexek...",
  "...keeeeeek...",
  "....kebbek....",
  ".....keek.....",
]);

const headFromBehind = head([
  "....kkkkkk....",
  "...knnnnnnk...",
  "...knnnnSnk...",
  "...kEEEEEEk...",
  ".kkkkkkkkkkkk.",
  "...kbbbbbbk...",
  "...kbbbbbbk...",
  "...kebbbbek...",
  "....keeeek....",
  ".....keek.....",
]);

const torsoFromTheSide = torso([
  "....kkkkkk....",
  "...kuuiiick...",
  "...kiiiiiEk...",
  "...ktiiiiEk...",
  "...ktiiiiik...",
  "...ktiiiiik...",
  "...kttiiiik...",
  "...kttttttk...",
]);

const torsoFromTheFront = torso([
  "..kkkkkkkkkk..",
  ".kuuiuccuiuuk.",
  ".kiituEEutiik.",
  ".kiitiEEitiik.",
  ".kiitiEEitiik.",
  ".kiitiiiitiik.",
  ".keektiitkeek.",
  "..kkkttttkkk..",
]);

const torsoFromBehind = torso([
  "..kkkkkkkkkk..",
  ".kuuuiiiiuuuk.",
  ".kiitiiiitiik.",
  ".kiitiiiitiik.",
  ".kiitiiiitiik.",
  ".kiitiiiitiik.",
  ".keektiitkeek.",
  "..kkkttttkkk..",
]);

/** From behind, with the right arm missing: it is raised to the door and drawn on its own. */
const torsoFromBehindArmRaised = torso([
  "..kkkkkkkkkk..",
  ".kuuuiiiiuuk..",
  ".kiitiiiik....",
  ".kiitiiiik....",
  ".kiitiiiik....",
  ".kiitiiiik....",
  ".keektiitk....",
  "..kkkttttk....",
]);

const armRows = {
  hangingDown: [".kk.", "kiik", "kiik", "kiik", "kiik", "keek", ".kk."],
  swungForward: [".kk...", "kiik..", "kiiik.", ".kiiek", "..keek", "...kk."],
};

const SIDE_ARM_Y = HEAD_ROWS + 1;
const sideArms = {
  hangingDown: { rows: armRows.hangingDown, x: BODY_X + 5, y: SIDE_ARM_Y },
  swungForward: { rows: armRows.swungForward, x: BODY_X + 5, y: SIDE_ARM_Y },
  swungBack: { rows: mirrored(armRows.swungForward), x: BODY_X + 3, y: SIDE_ARM_Y },
} satisfies Record<string, Part>;

const RAISED_ARM_X = BODY_X + 10;
const armRaisedToTheDoor: Part = {
  x: RAISED_ARM_X,
  y: 4,
  rows: ["..kk", ".kek", ".kek", ".kik", ".kik", ".kik", "kiik", "kiik", "kkk."],
};
const armDrawnBackFromTheDoor: Part = {
  x: RAISED_ARM_X,
  y: 5,
  rows: ["..kk", ".kek", ".kek", ".kik", ".kik", "kiik", "kiik", "kkk."],
};
/** Three short ticks beside his fist: the sound of the knock. */
const knockTicks: Part = { x: RAISED_ARM_X + 4, y: 3, rows: ["c.", ".c", "..", ".c", "c."] };

const legsFromTheSide = {
  standing: legs([
    "...kSSSSSSk...",
    "....kSSSSk....",
    "....kSSSSk....",
    "....kSSSSk....",
    "....kSSSSk....",
    "....kSSSSk....",
    "....kccccck...",
    "....kkkkkkk...",
  ]),
  // One row shorter than the others: with his legs wide apart his whole body rides a pixel lower.
  apart: legs([
    "....kSSSSSk...",
    "...kSSSkSSSk..",
    "..kSSSk.kSSSk.",
    ".kSSSk...kSSk.",
    ".kSSk....kSSk.",
    "kccck....kccck",
    "kkkkk....kkkkk",
  ]),
  passing: legs([
    "...kSSSSSSk...",
    "....kSSSSk....",
    "....kSSSSk....",
    "...kSSSSSk....",
    "..kSSkSSSk....",
    "..kcckSSSk....",
    "..kkkkcccck...",
    ".....kkkkkk...",
  ]),
};

const steppingRows = [
  "...kSSSSSSk...",
  "...kSSSSSSk...",
  "...kSSkkSSk...",
  "...kSSkkSSk...",
  "...kSSkkSSk...",
  "...kSSkkcck...",
  "..kccck.kkk...",
  "..kkkkk.......",
];

/** The same legs serve from the front and from behind: at this size shoes look alike both ways. */
const legsFromTheFront = {
  standing: legs([
    "...kSSSSSSk...",
    "...kSSSSSSk...",
    "...kSSkkSSk...",
    "...kSSkkSSk...",
    "...kSSkkSSk...",
    "...kSSkkSSk...",
    "..kccckkccck..",
    "..kkkkkkkkkk..",
  ]),
  leftFootDown: legs(steppingRows),
  rightFootDown: legs(mirrored(steppingRows)),
};

const standingFromTheSide = pictureOf([
  legsFromTheSide.standing,
  torsoFromTheSide,
  sideArms.hangingDown,
  headFromTheSide,
]);

function stridingFromTheSide(arm: Part): Sprite {
  return pictureOf([legsFromTheSide.apart, lowered(torsoFromTheSide), lowered(arm), lowered(headFromTheSide)]);
}

const passingFromTheSide = pictureOf([
  legsFromTheSide.passing,
  torsoFromTheSide,
  sideArms.hangingDown,
  headFromTheSide,
]);

function walkingUpOrDown(headPart: Part, torsoPart: Part): Record<StridePart, Sprite> {
  const standing = pictureOf([legsFromTheFront.standing, torsoPart, headPart]);
  const stepping = (legsPart: Part): Sprite => pictureOf([legsPart, lowered(torsoPart), lowered(headPart)]);
  return {
    0: stepping(legsFromTheFront.leftFootDown),
    1: standing,
    2: stepping(legsFromTheFront.rightFootDown),
    3: standing,
  };
}

const walkingDown = walkingUpOrDown(headFromTheFront, torsoFromTheFront);
const walkingUp = walkingUpOrDown(headFromBehind, torsoFromBehind);

/** Every picture of the manager. The ones from the side face right; mirror them for left. */
export const managerPictures = {
  standing: {
    side: standingFromTheSide,
    down: walkingDown[1],
    up: walkingUp[1],
  },
  walking: {
    side: {
      0: stridingFromTheSide(sideArms.swungBack),
      1: passingFromTheSide,
      2: stridingFromTheSide(sideArms.swungForward),
      3: passingFromTheSide,
    } satisfies Record<StridePart, Sprite>,
    down: walkingDown,
    up: walkingUp,
  },
  knocking: {
    knucklesOnDoor: pictureOf([
      legsFromTheFront.standing,
      torsoFromBehindArmRaised,
      armRaisedToTheDoor,
      headFromBehind,
      knockTicks,
    ]),
    handDrawnBack: pictureOf([
      legsFromTheFront.standing,
      torsoFromBehindArmRaised,
      armDrawnBackFromTheDoor,
      headFromBehind,
    ]),
  },
} as const;
