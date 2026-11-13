import { spriteFromRows, type ColourKey, type ColourName, type Sprite } from "../../engine";
import { robotSprite } from "../../interiors/sprites";
import type { StridePart } from "../../routes";

// An agent out of its house: the robot that sits at a station inside, standing
// up. Seen from the side its head is the very one painted inside, so the same
// agent is the same robot wherever it is: the same metal, the same wear, and
// its own colour striped across the top of its head.

/** The box a walking agent is drawn in. Its bottom row is the ground it stands on. */
export const AGENT_WIDTH = 20;
export const AGENT_HEIGHT = 24;

/** Offsets inside the agent's box that other things line up with. Seen from the side it faces right. */
export const agentPoints = {
  /** The middle of its feet, on the ground. */
  feet: { x: 8, y: 23 },
  /** The front of its shoulders seen from the side, where an arm reaching forward starts. */
  shoulder: { x: 11, y: 11 },
  /** The middle of the paperwork it holds out in front, seen from the side. */
  paperworkInHand: { x: 16, y: 14 },
  /** The stripe of its own colour across the top of its head: its left end and how long it is. */
  stripe: { side: { x: 8, y: 3, length: 4 }, down: { x: 6, y: 3, length: 5 }, up: { x: 6, y: 3, length: 5 } },
  /** The bulb on its antenna. Worn out, the antenna is bent a pixel forward. */
  bulb: { x: 8, y: 0 },
  /** The glowing end of its cigarette, by the way it faces. From behind it is hidden: the smoke rises over its head. */
  cigaretteTip: { side: { x: 15, y: 8 }, down: { x: 12, y: 8 }, up: { x: 8, y: 0 } },
} as const;

const colours: ColourKey = {
  k: "ink",
  S: "slate",
  t: "stone",
  i: "mist",
  u: "cloud",
  c: "cream",
  a: "sand",
  y: "clay",
  o: "sunset",
  l: "lamp",
  E: "ember",
};

export type AgentLook = {
  /** The agent's own colour: the stripe across the top of its head, as inside its house. */
  readonly stripe: ColourName;
  /** It shares its house and shows the long hours, as it does inside. */
  readonly isWornOut: boolean;
  /** The colour of the bulb on its antenna right now. */
  readonly bulb: ColourName;
};

type Part = {
  readonly sprite: Sprite;
  /** Where the part's top left sits inside the agent's box. */
  readonly x: number;
  readonly y: number;
};

function part(rows: readonly string[], x: number, y: number, key: ColourKey = colours): Part {
  return { sprite: spriteFromRows(rows, key), x, y };
}

function mirrored(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(""));
}

function lowered(given: Part, rows: number = 1): Part {
  return { ...given, y: given.y + rows };
}

/** One picture of the whole agent from its parts, back to front: a later part covers an earlier one. */
function pictureOf(parts: readonly Part[]): Sprite {
  const pixels: (ColourName | null)[] = Array.from({ length: AGENT_WIDTH * AGENT_HEIGHT }, () => null);
  for (const { sprite, x, y } of parts) {
    if (x < 0 || y < 0 || x + sprite.width > AGENT_WIDTH || y + sprite.height > AGENT_HEIGHT) {
      throw new Error("A part of the walking agent does not fit in its box");
    }
    sprite.pixels.forEach((colour, index) => {
      if (colour === null) return;
      const column = index % sprite.width;
      const row = (index - column) / sprite.width;
      pixels[(y + row) * AGENT_WIDTH + x + column] = colour;
    });
  }
  return { width: AGENT_WIDTH, height: AGENT_HEIGHT, pixels };
}

const HEAD_ROWS = 10;
const HEAD_AT = { x: 2, y: 0 } as const;
const TORSO_Y = HEAD_ROWS + 1;

/** The head of the robot painted at a station inside: the top rows of that very picture. */
function headFromTheSide(look: AgentLook): Part {
  const seated = robotSprite({
    isWornOut: look.isWornOut,
    eye: look.isWornOut ? "half shut" : "wide open",
    bulb: look.bulb,
    stripe: look.stripe,
  });
  return {
    sprite: { width: seated.width, height: HEAD_ROWS, pixels: seated.pixels.slice(0, seated.width * HEAD_ROWS) },
    ...HEAD_AT,
  };
}

// Letters the looks fill in: A the antenna's bulb, e and f the upper and lower
// half of each eye, C the stripe.
const freshHeadFromTheFront = [
  "......A.......",
  "......k.......",
  "..kkkkkkkkk...",
  ".kuuCCCCCuuk..",
  ".kikkiiikkik..",
  ".kkeekikeekk..",
  ".kkffkikffkk..",
  ".kikkiiikkik..",
  ".ktttttttttk..",
  "..kkkkkkkkk...",
];

// The same wear as inside: a bent antenna, a plaster over a dent, rust on the jaw and dark rings under the eyes.
const wornOutHeadFromTheFront = [
  ".......A......",
  "......k.......",
  "..kkkkkkkkk...",
  ".kaaCCCCCuuk..",
  ".kaakiiikkik..",
  ".kkeekikeekk..",
  ".kkffkikffkk..",
  ".kiSSiiiSSik..",
  ".ktyytttttik..",
  "..kkkkkkkkk...",
];

// The back of its head is one plate with a hatch in it: nothing there that could be taken for a face.
const freshHeadFromBehind = [
  "......A.......",
  "......k.......",
  "..kkkkkkkkk...",
  ".kuuCCCCCuuk..",
  ".kiiiiiiiiik..",
  ".kiikkkkkiik..",
  ".kiiktttkiik..",
  ".kiikkkkkiik..",
  ".ktttttttttk..",
  "..kkkkkkkkk...",
];

const wornOutHeadFromBehind = [
  ".....A........",
  "......k.......",
  "..kkkkkkkkk...",
  ".kuuCCCCCaak..",
  ".kiiiiiiiaak..",
  ".kiikkkkkiik..",
  ".kiiktttkiik..",
  ".kiikkkkkiik..",
  ".kttttttyytk..",
  "..kkkkkkkkk...",
];

function headKeyFor(look: AgentLook): ColourKey {
  return { ...colours, A: look.bulb, C: look.stripe, e: look.isWornOut ? "stone" : "cyan", f: "cyan" };
}

const neckFromTheSide = part(["kSSk"], 6, HEAD_ROWS);
const neckFromTheFront = part(["kSk"], 7, HEAD_ROWS);

const torsoFromTheSide = part(
  ["kkkkkkkk", "kuiiiiik", "kiiiiiik", "kiiiiiik", "kiiiiitk", "kttttttk", "kkkkkkkk"],
  4,
  TORSO_Y,
);

/** With an arm hanging at each side, each from an orange shoulder joint. */
const torsoFromTheFront = part(
  [
    "..kkkkkkkkk..",
    "kokuuiiiiikok",
    "kikuiiiiiikik",
    "kikiiiiiiikik",
    "kikiiiiiitkik",
    "kukiiiiittkuk",
    ".kkkkkkkkkkk.",
  ],
  2,
  TORSO_Y,
);

const torsoFromBehind = part(
  [
    "..kkkkkkkkk..",
    "kokuiiiiiikok",
    "kikiiSSSiikik",
    "kikiiiiiiikik",
    "kikiiSSSiikik",
    "kukittttttkuk",
    ".kkkkkkkkkkk.",
  ],
  2,
  TORSO_Y,
);

const SIDE_ARM_Y = TORSO_Y + 1;
const armSwungForwardRows = [".kkk...", "kolok..", "koookk.", ".kkiik.", "...kuk.", "...kkk."];
const sideArms = {
  hangingDown: part([".kkk.", "kolok", "koook", ".kik.", ".kuk.", ".kkk."], 6, SIDE_ARM_Y),
  swungForward: part(armSwungForwardRows, 6, SIDE_ARM_Y),
  swungBack: part(mirrored(armSwungForwardRows), 4, SIDE_ARM_Y),
  /** Reaching forward with a wad of paperwork in its hand. */
  holdingPaperwork: part(
    [".kkk...kkkkkk", "kolok..kcccck", "koookkkkuuuuk", ".kkiiiiukccck", "...kkkkkkkkkk"],
    6,
    SIDE_ARM_Y,
  ),
};

/** Held across its chest with both hands. */
const paperworkFromTheFront = part(
  ["kkkkkkkkkkk", "kccccccccck", "ukuuuuuuuku", "kccccccccck", "kkkkkkkkkkk"],
  3,
  TORSO_Y + 2,
);
/** From behind only the end of it shows, past its elbow. */
const paperworkFromBehind = part(["kkkk", "kcck", "kuuk", "kcck", "kkkk"], 14, TORSO_Y + 2);

const cigaretteFromTheSide = part(["cE"], 14, 8);
const cigaretteFromTheFront = part(["ccE"], 10, 8);

/** Legs always end on the ground, however many rows they are. */
function legs(rows: readonly string[], x: number): Part {
  return part(rows, x, AGENT_HEIGHT - rows.length);
}

const SIDE_LEGS_X = 3;
const legsFromTheSide = {
  standing: legs(
    ["...kook...", "...kiik...", "...kiik...", "...kiik...", "...kttkk..", "...kkkkk.."],
    SIDE_LEGS_X,
  ),
  // One row shorter than the others: with its legs wide apart the whole robot rides a pixel lower.
  apart: legs(["...kook...", "..kikkik..", ".kik..kik.", "kttk..kttk", "kkkk..kkkk"], SIDE_LEGS_X),
  passing: legs(
    ["...kook...", "...kiik...", "..kkiik...", ".kttkik...", ".kkkkttk..", "....kkkk.."],
    SIDE_LEGS_X,
  ),
};

const FRONT_LEGS_X = 4;
const steppingRows = [".kok.kok.", ".kik.kik.", ".kik.kik.", "kkik.kttk", "kttk.kkkk", "kkkk....."];
/** The same legs serve from the front and from behind: at this size feet look alike both ways. */
const legsFromTheFront = {
  standing: legs(
    [".kok.kok.", ".kik.kik.", ".kik.kik.", "kkik.kikk", "kttkkkttk", "kkkkkkkkk"],
    FRONT_LEGS_X,
  ),
  leftFootDown: legs(steppingRows, FRONT_LEGS_X),
  rightFootDown: legs(mirrored(steppingRows), FRONT_LEGS_X),
};

type Views = { readonly side: Sprite; readonly down: Sprite; readonly up: Sprite };
type WalkingViews = {
  readonly side: Record<StridePart, Sprite>;
  readonly down: Record<StridePart, Sprite>;
  readonly up: Record<StridePart, Sprite>;
};
type Poses = { readonly standing: Views; readonly walking: WalkingViews };

/** Every picture of one walking agent. The ones from the side face right; mirror them for left. */
export type AgentPictures = {
  readonly emptyHanded: Poses;
  /** With urgent paperwork in its hands and a cigarette lit. */
  readonly carrying: Poses;
};

function fromTheSide(head: Part, arms: Record<StridePart | "standing", Part>, held: readonly Part[]) {
  const upper = (arm: Part): Part[] => [torsoFromTheSide, neckFromTheSide, arm, head, ...held];
  const striding = (arm: Part): Sprite =>
    pictureOf([legsFromTheSide.apart, ...upper(arm).map((given) => lowered(given))]);
  const passing = (arm: Part): Sprite => pictureOf([legsFromTheSide.passing, ...upper(arm)]);
  return {
    standing: pictureOf([legsFromTheSide.standing, ...upper(arms.standing)]),
    walking: { 0: striding(arms[0]), 1: passing(arms[1]), 2: striding(arms[2]), 3: passing(arms[3]) },
  };
}

function upOrDown(head: Part, torso: Part, held: readonly Part[]) {
  const upper = [torso, neckFromTheFront, head, ...held];
  const standing = pictureOf([legsFromTheFront.standing, ...upper]);
  const stepping = (legsPart: Part): Sprite => pictureOf([legsPart, ...upper.map((given) => lowered(given))]);
  return {
    standing,
    walking: {
      0: stepping(legsFromTheFront.leftFootDown),
      1: standing,
      2: stepping(legsFromTheFront.rightFootDown),
      3: standing,
    },
  };
}

function posesOf(
  side: ReturnType<typeof fromTheSide>,
  down: ReturnType<typeof upOrDown>,
  up: ReturnType<typeof upOrDown>,
): Poses {
  return {
    standing: { side: side.standing, down: down.standing, up: up.standing },
    walking: { side: side.walking, down: down.walking, up: up.walking },
  };
}

function picturesOf(look: AgentLook): AgentPictures {
  const sideHead = headFromTheSide(look);
  const key = headKeyFor(look);
  const frontHead = part(look.isWornOut ? wornOutHeadFromTheFront : freshHeadFromTheFront, HEAD_AT.x, HEAD_AT.y, key);
  const backHead = part(look.isWornOut ? wornOutHeadFromBehind : freshHeadFromBehind, HEAD_AT.x, HEAD_AT.y, key);
  const { hangingDown, swungBack, swungForward, holdingPaperwork } = sideArms;

  return {
    emptyHanded: posesOf(
      fromTheSide(sideHead, { standing: hangingDown, 0: swungBack, 1: hangingDown, 2: swungForward, 3: hangingDown }, []),
      upOrDown(frontHead, torsoFromTheFront, []),
      upOrDown(backHead, torsoFromBehind, []),
    ),
    carrying: posesOf(
      fromTheSide(
        sideHead,
        { standing: holdingPaperwork, 0: holdingPaperwork, 1: holdingPaperwork, 2: holdingPaperwork, 3: holdingPaperwork },
        [cigaretteFromTheSide],
      ),
      upOrDown(frontHead, torsoFromTheFront, [paperworkFromTheFront, cigaretteFromTheFront]),
      upOrDown(backHead, torsoFromBehind, [paperworkFromBehind]),
    ),
  };
}

const picturesByLook = new Map<string, AgentPictures>();

/** The pictures of an agent with this look, painted once and kept. */
export function agentPicturesFor(look: AgentLook): AgentPictures {
  const key = `${look.stripe} ${look.isWornOut} ${look.bulb}`;
  let pictures = picturesByLook.get(key);
  if (!pictures) {
    pictures = picturesOf(look);
    picturesByLook.set(key, pictures);
  }
  return pictures;
}
