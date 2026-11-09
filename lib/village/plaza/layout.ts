import { humanPoints } from "../characters/human";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../engine";

// Where everything in the plaza is, as plain data. Drawing reads this file and
// keeps no positions of its own, so a later step can move or add things here.

export type Point = { readonly x: number; readonly y: number };

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type Ellipse = {
  readonly centre: Point;
  readonly radiusX: number;
  readonly radiusY: number;
};

/** A path is straight runs between its points, each run level or upright. */
export type PlazaPath = {
  readonly name: string;
  readonly points: readonly Point[];
};

/** Room kept clear for one house. Nothing tall is planted inside it. */
export type HouseLot = {
  readonly name: string;
  readonly area: Rect;
  /** On a path, right below the middle of the lot: where a house's front door opens. */
  readonly doorstep: Point;
};

export type TreeKind = "oak" | "blossom" | "pine" | "sapling";
export type PlantKind = "bush" | "flowering bush" | "fern" | "pink flowers" | "violet flowers";
export type ClutterKind =
  | "robot arm lying down"
  | "robot arm reaching up"
  | "cigarette butt"
  | "bent cigarette butt";

/** Butts lie flat: things standing on the ground are drawn over them, never behind. */
export function liesFlat(kind: ClutterKind): boolean {
  return kind === "cigarette butt" || kind === "bent cigarette butt";
}

/** `at` is the middle of the thing's foot, where it meets the ground. */
export type Planted<Kind> = { readonly kind: Kind; readonly at: Point; readonly mirrored?: boolean };

/** Where the sky stops and the ground starts. */
export const HORIZON_Y = 40;
/** An odd number, so a path has a middle row of pixels to walk on. */
export const PATH_WIDTH = 11;

const UPPER_STREET_Y = 94;
const LOWER_STREET_Y = 190;
const MIDDLE_X = SCREEN_WIDTH / 2;

const square: Ellipse = { centre: { x: MIDDLE_X, y: 142 }, radiusX: 74, radiusY: 29 };

// The human, his chair, the table and everything on it are placed from this
// one corner, so the whole desk moves together.
const DESK_CORNER: Point = { x: 164, y: 123 };

function fromDeskCorner(x: number, y: number): Point {
  return { x: DESK_CORNER.x + x, y: DESK_CORNER.y + y };
}

const humanAt = fromDeskCorner(3, 0);

export const desk = {
  chairAt: fromDeskCorner(0, 9),
  /** Top left of the human's box. */
  humanAt,
  tableAt: fromDeskCorner(16, 10),
  keyboardAt: fromDeskCorner(18, 12),
  mugAt: fromDeskCorner(20, 7),
  computerAt: fromDeskCorner(31, 0),
  /** The dark glass of the computer, where its text shows. */
  computerGlass: { ...fromDeskCorner(33, 4), width: 6, height: 6 },
  /** The computer and its keyboard: the area a click or the keyboard reaches. */
  computerBounds: { ...fromDeskCorner(17, -1), width: 31, height: 18 },
  /** The lowest ground the desk touches. Things with a lower foot are drawn in front of it. */
  footY: DESK_CORNER.y + 26,
  /** Where a visitor's feet stand to reach the human: behind his chair, facing right. */
  visitorSpot: fromDeskCorner(-7, 23),
  /** The human's near shoulder, where a visitor taps. */
  shoulderSpot: { x: humanAt.x + humanPoints.shoulder.x, y: humanAt.y + humanPoints.shoulder.y },
  /** Where a visitor's feet stand to put something on the desk: at its far end, facing left. */
  dropOffSpot: fromDeskCorner(63, 24),
  /** The middle of the bottom of a stack of paperwork sitting on the desk. */
  stackSpot: fromDeskCorner(51, 15),
  /** The middle of the bottom of a mark floating above the computer. */
  markSpot: fromDeskCorner(39, -3),
  /** The middle of the bottom of something small lying at the front of the desk. */
  clipboardSpot: fromDeskCorner(27, 16),
} as const;

const LOT_WIDTH = 80;
const LOT_HEIGHT = 56;

function lot(name: string, left: number, streetY: number): HouseLot {
  const streetTop = streetY - (PATH_WIDTH - 1) / 2;
  return {
    name,
    area: { x: left, y: streetTop - LOT_HEIGHT, width: LOT_WIDTH, height: LOT_HEIGHT },
    doorstep: { x: left + LOT_WIDTH / 2, y: streetTop },
  };
}

const houseLots: readonly HouseLot[] = [
  lot("far left of the upper street", 8, UPPER_STREET_Y),
  lot("left of the upper street", 98, UPPER_STREET_Y),
  lot("right of the upper street", 206, UPPER_STREET_Y),
  lot("far right of the upper street", 296, UPPER_STREET_Y),
  lot("left of the lower street", 8, LOWER_STREET_Y),
  lot("right of the lower street", 296, LOWER_STREET_Y),
];

const paths: readonly PlazaPath[] = [
  {
    name: "road to the hills",
    points: [
      { x: MIDDLE_X, y: HORIZON_Y },
      { x: MIDDLE_X, y: UPPER_STREET_Y },
    ],
  },
  {
    name: "upper street",
    points: [
      { x: 0, y: UPPER_STREET_Y },
      { x: SCREEN_WIDTH - 1, y: UPPER_STREET_Y },
    ],
  },
  {
    name: "walk through the square",
    points: [
      { x: MIDDLE_X, y: UPPER_STREET_Y },
      { x: MIDDLE_X, y: LOWER_STREET_Y },
    ],
  },
  {
    name: "lower street",
    points: [
      { x: 0, y: LOWER_STREET_Y },
      { x: SCREEN_WIDTH - 1, y: LOWER_STREET_Y },
    ],
  },
];

const trees: readonly Planted<TreeKind>[] = [
  { kind: "oak", at: { x: 106, y: 126 } },
  { kind: "pine", at: { x: 268, y: 126 } },
  { kind: "sapling", at: { x: 286, y: 122 } },
  { kind: "blossom", at: { x: 276, y: 180 } },
  { kind: "pine", at: { x: 104, y: 181 } },
  { kind: "oak", at: { x: 12, y: 226 } },
  { kind: "oak", at: { x: 372, y: 230 }, mirrored: true },
];

const plants: readonly Planted<PlantKind>[] = [
  { kind: "bush", at: { x: 93, y: 86 } },
  { kind: "flowering bush", at: { x: 291, y: 86 } },
  { kind: "bush", at: { x: 124, y: 113 } },
  { kind: "fern", at: { x: 98, y: 130 } },
  { kind: "flowering bush", at: { x: 258, y: 170 } },
  { kind: "bush", at: { x: 122, y: 179 } },
  { kind: "fern", at: { x: 290, y: 183 } },
  { kind: "pink flowers", at: { x: 118, y: 168 } },
  { kind: "violet flowers", at: { x: 274, y: 141 } },
  { kind: "pink flowers", at: { x: 201, y: 76 } },
  { kind: "violet flowers", at: { x: 182, y: 62 } },
  { kind: "fern", at: { x: 150, y: 208 } },
  { kind: "bush", at: { x: 228, y: 212 } },
  { kind: "pink flowers", at: { x: 252, y: 206 } },
  { kind: "violet flowers", at: { x: 120, y: 204 } },
  { kind: "fern", at: { x: 322, y: 210 } },
  { kind: "flowering bush", at: { x: 56, y: 211 } },
  { kind: "fern", at: { x: 30, y: 108 } },
  { kind: "pink flowers", at: { x: 352, y: 112 } },
];

const clutter: readonly Planted<ClutterKind>[] = [
  { kind: "robot arm lying down", at: { x: 150, y: 181 } },
  { kind: "robot arm reaching up", at: { x: 240, y: 181 } },
  { kind: "robot arm lying down", at: { x: 316, y: 111 }, mirrored: true },
  { kind: "cigarette butt", at: { x: 150, y: 149 } },
  { kind: "bent cigarette butt", at: { x: 155, y: 152 }, mirrored: true },
  { kind: "cigarette butt", at: { x: 147, y: 153 }, mirrored: true },
  { kind: "cigarette butt", at: { x: 181, y: 158 }, mirrored: true },
  { kind: "cigarette butt", at: { x: 212, y: 160 } },
  { kind: "bent cigarette butt", at: { x: 217, y: 158 } },
  { kind: "cigarette butt", at: { x: 236, y: 153 }, mirrored: true },
  { kind: "bent cigarette butt", at: { x: 199, y: 177 } },
  { kind: "cigarette butt", at: { x: 186, y: 108 }, mirrored: true },
  { kind: "bent cigarette butt", at: { x: 174, y: 172 }, mirrored: true },
];

const lampPosts: readonly Point[] = [
  { x: 238, y: 123 },
  { x: 144, y: 162 },
];

/** A star's `twinkles` says whether it is one of the few that blink. */
const stars: readonly { readonly at: Point; readonly twinkles: boolean }[] = [
  { at: { x: 14, y: 4 }, twinkles: false },
  { at: { x: 47, y: 8 }, twinkles: true },
  { at: { x: 83, y: 3 }, twinkles: false },
  { at: { x: 121, y: 6 }, twinkles: false },
  { at: { x: 158, y: 2 }, twinkles: true },
  { at: { x: 204, y: 7 }, twinkles: false },
  { at: { x: 239, y: 3 }, twinkles: false },
  { at: { x: 277, y: 9 }, twinkles: true },
  { at: { x: 312, y: 4 }, twinkles: false },
  { at: { x: 349, y: 7 }, twinkles: false },
  { at: { x: 372, y: 2 }, twinkles: true },
  { at: { x: 66, y: 13 }, twinkles: false },
  { at: { x: 188, y: 12 }, twinkles: false },
  { at: { x: 331, y: 14 }, twinkles: false },
];

/** Each firefly wanders around its `home`, never further than `roams` from it. */
export type FireflyRoute = {
  readonly home: Point;
  readonly roams: Point;
  readonly lapMs: number;
  readonly blinkMs: number;
};

const fireflies: readonly FireflyRoute[] = [
  { home: { x: 124, y: 140 }, roams: { x: 9, y: 5 }, lapMs: 7300, blinkMs: 1900 },
  { home: { x: 262, y: 160 }, roams: { x: 11, y: 6 }, lapMs: 9100, blinkMs: 2300 },
  { home: { x: 96, y: 196 }, roams: { x: 12, y: 5 }, lapMs: 8200, blinkMs: 1700 },
  { home: { x: 300, y: 200 }, roams: { x: 10, y: 6 }, lapMs: 6700, blinkMs: 2100 },
  { home: { x: 226, y: 110 }, roams: { x: 8, y: 4 }, lapMs: 7900, blinkMs: 2500 },
  { home: { x: 60, y: 112 }, roams: { x: 12, y: 5 }, lapMs: 8800, blinkMs: 2000 },
];

export const plazaLayout = {
  width: SCREEN_WIDTH,
  height: SCREEN_HEIGHT,
  horizonY: HORIZON_Y,
  /** The paved round in the middle, where the desk stands. */
  square,
  desk,
  paths,
  pathWidth: PATH_WIDTH,
  houseLots,
  trees,
  plants,
  clutter,
  lampPosts,
  stars,
  fireflies,
  /** The burning tip of the one butt that is still alight: smoke rises from here. */
  smoulderingButt: { x: 178, y: 157 } as Point,
  /** The torn end of the first robot arm, where loose wires spark. */
  sparkingWires: { x: 131, y: 177 } as Point,
  /** Where the sun goes down, on the horizon. */
  sunAt: { x: MIDDLE_X, y: HORIZON_Y } as Point,
} as const;

/** Every place a new path may start from without crossing grass: each doorstep, and each end of a path. */
export const pathJoins: readonly Point[] = [
  ...houseLots.map((houseLot) => houseLot.doorstep),
  ...paths.flatMap((path) => [path.points[0], path.points[path.points.length - 1]]),
];

export function isInsideRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

/** 0 at the middle, 1 on the edge, more outside. */
export function reachInEllipse(ellipse: Ellipse, x: number, y: number): number {
  const across = (x - ellipse.centre.x) / ellipse.radiusX;
  const down = (y - ellipse.centre.y) / ellipse.radiusY;
  return across * across + down * down;
}

export function isOnPath(path: PlazaPath, x: number, y: number, width: number = PATH_WIDTH): boolean {
  const reach = (width - 1) / 2;
  for (let index = 1; index < path.points.length; index += 1) {
    const from = path.points[index - 1];
    const to = path.points[index];
    const nearestX = Math.min(Math.max(x, Math.min(from.x, to.x)), Math.max(from.x, to.x));
    const nearestY = Math.min(Math.max(y, Math.min(from.y, to.y)), Math.max(from.y, to.y));
    if (Math.abs(x - nearestX) <= reach && Math.abs(y - nearestY) <= reach) return true;
  }
  return false;
}

export type GroundKind = "sky" | "grass" | "path" | "paving";

/** What is underfoot at a pixel. Walkers keep to "path" and "paving". */
export function groundKindAt(x: number, y: number): GroundKind {
  if (y < HORIZON_Y) return "sky";
  if (reachInEllipse(square, x, y) <= 1) return "paving";
  if (paths.some((path) => isOnPath(path, x, y))) return "path";
  return "grass";
}
