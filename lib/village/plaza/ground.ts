import { createSurface, setPixel, type ColourName, type Surface } from "../engine";
import { grain, softGrain } from "./grain";
import {
  HORIZON_Y,
  groundKindAt,
  plazaLayout,
  reachInEllipse,
  type ClutterKind,
  type Ellipse,
  type GroundKind,
  type PlantKind,
  type Point,
  type TreeKind,
} from "./layout";

// The part of the picture that never moves: sky, hills, grass, paths, paving,
// and the light and shadow lying on them.

type Tones = Partial<Record<ColourName, ColourName>>;

const oneStepBrighter: Tones = {
  ink: "night",
  night: "slate",
  dusk: "slate",
  slate: "stone",
  stone: "mist",
  pine: "moss",
  moss: "leaf",
  leaf: "grass",
  bark: "wood",
  wood: "clay",
  clay: "sand",
};

const oneStepDarker: Tones = {
  night: "ink",
  dusk: "night",
  slate: "night",
  stone: "slate",
  mist: "stone",
  pine: "night",
  moss: "pine",
  leaf: "moss",
  grass: "leaf",
  bark: "ink",
  wood: "bark",
  clay: "wood",
  sand: "clay",
};

function isOnChequer(x: number, y: number): boolean {
  return (x + y) % 2 === 0;
}

function isOnSparseDots(x: number, y: number): boolean {
  return (x + 2 * y) % 4 === 0;
}

const skyBands: readonly { fromY: number; colour: ColourName }[] = [
  { fromY: 0, colour: "night" },
  { fromY: 10, colour: "dusk" },
  { fromY: 18, colour: "plum" },
  { fromY: 25, colour: "mauve" },
  { fromY: 31, colour: "rose" },
  { fromY: 35, colour: "sunset" },
  { fromY: 38, colour: "peach" },
];

const cloudStreaks: readonly { x: number; y: number; length: number; colour: ColourName }[] = [
  { x: 22, y: 13, length: 46, colour: "plum" },
  { x: 250, y: 15, length: 58, colour: "plum" },
  { x: 96, y: 21, length: 54, colour: "mauve" },
  { x: 300, y: 22, length: 40, colour: "mauve" },
  { x: 150, y: 28, length: 30, colour: "rose" },
  { x: 214, y: 27, length: 44, colour: "rose" },
  { x: 40, y: 29, length: 36, colour: "rose" },
];

const SUN_RADIUS = 9;
const SUN_GLOW_RADIUS = 15;

function bandedSkyColour(x: number, y: number): ColourName {
  let band = 0;
  while (band + 1 < skyBands.length && skyBands[band + 1].fromY <= y) band += 1;
  const next = skyBands[band + 1];
  if (!next) return skyBands[band].colour;
  // Two colours meet in a speckled row or two, so the bands melt into each other.
  const rowsToNext = next.fromY - y;
  const bandIsTall = next.fromY - skyBands[band].fromY >= 5;
  if (rowsToNext === 1 && isOnChequer(x, y)) return next.colour;
  if (rowsToNext === 2 && bandIsTall && isOnSparseDots(x, y)) return next.colour;
  return skyBands[band].colour;
}

function farHillHeight(x: number): number {
  const distanceFromSun = Math.abs(x - plazaLayout.sunAt.x);
  // The hills dip where the sun goes down, so it sets into a valley.
  const dip = Math.min(1, 0.2 + distanceFromSun / 80);
  return Math.round((3 + 8 * softGrain(x, 0, 44, 1, 7)) * dip);
}

const TREELINE_SPACING = 6;

function treelineHeight(x: number): number {
  const distanceFromRoad = Math.abs(x - plazaLayout.sunAt.x);
  if (distanceFromRoad <= (plazaLayout.pathWidth - 1) / 2 + 1) return 0;
  const tree = Math.floor(x / TREELINE_SPACING);
  let height = 1;
  for (const neighbour of [tree - 1, tree, tree + 1]) {
    const middle = neighbour * TREELINE_SPACING + 3 + Math.round(grain(neighbour, 0, 3) * 2 - 1);
    const tall = 3 + Math.floor(grain(neighbour, 1, 3) * 6);
    height = Math.max(height, tall - 2 * Math.abs(x - middle));
  }
  return distanceFromRoad < 16 ? Math.min(height, 2) : height;
}

function skyColourAt(x: number, y: number): ColourName {
  const rowsAboveGround = HORIZON_Y - y;
  if (rowsAboveGround <= treelineHeight(x)) return "night";
  if (rowsAboveGround <= farHillHeight(x)) return "plum";

  const fromSun = Math.hypot(x - plazaLayout.sunAt.x, y - plazaLayout.sunAt.y);
  if (fromSun <= SUN_RADIUS - 2) return "cream";
  if (fromSun <= SUN_RADIUS) return "lamp";
  if (fromSun <= SUN_GLOW_RADIUS && isOnChequer(x, y)) return "peach";

  for (const streak of cloudStreaks) {
    const onTopRow = y === streak.y && x >= streak.x && x < streak.x + streak.length;
    const onLowerRow = y === streak.y + 1 && x >= streak.x + 5 && x < streak.x + streak.length - 9;
    if (onTopRow || onLowerRow) return streak.colour;
  }
  return bandedSkyColour(x, y);
}

function grassColourAt(x: number, y: number): ColourName {
  if (y === HORIZON_Y) return "moss";
  const patch = softGrain(x, y, 46, 12, 11);
  const inPatch = patch > 0.66 || (patch > 0.61 && isOnChequer(x, y));
  const base: ColourName = inPatch ? "moss" : "pine";
  const isBlade = grain(x, y, 5) < 0.018 || grain(x, y + 1, 5) < 0.018;
  if (isBlade) return inPatch ? "leaf" : "moss";
  return base;
}

function pathColourAt(x: number, y: number, onEdge: boolean): ColourName {
  const speck = grain(x, y, 9);
  if (onEdge) return speck < 0.12 ? grassColourAt(x, y) : "bark";
  if (speck < 0.015) return "clay";
  if (speck > 0.98) return "bark";
  return "wood";
}

const SLAB_WIDTH = 10;
const SLAB_HEIGHT = 5;

function pavingColourAt(x: number, y: number, onEdge: boolean): ColourName {
  if (onEdge) return "stone";
  const row = Math.floor(y / SLAB_HEIGHT);
  const shifted = x + (row % 2 === 0 ? 0 : SLAB_WIDTH / 2);
  const onJoint = y % SLAB_HEIGHT === 0 || shifted % SLAB_WIDTH === 0;
  if (onJoint) return grain(x, y, 13) < 0.07 ? "moss" : "night";
  return grain(Math.floor(shifted / SLAB_WIDTH), row, 17) < 0.2 ? "dusk" : "slate";
}

const LAMP_POOL = { radiusX: 30, radiusY: 12 };

const lightPools: readonly Ellipse[] = [
  ...plazaLayout.lampPosts.map((lamp) => ({ centre: { x: lamp.x, y: lamp.y + 2 }, ...LAMP_POOL })),
  // The glow of the computer on the paving around the desk.
  {
    centre: { x: plazaLayout.desk.tableAt.x + 8, y: plazaLayout.desk.footY - 5 },
    radiusX: 42,
    radiusY: 14,
  },
];

type ShadowSize = { readonly radiusX: number; readonly radiusY: number };

const treeShadows: Record<TreeKind, ShadowSize> = {
  oak: { radiusX: 12, radiusY: 4 },
  blossom: { radiusX: 12, radiusY: 4 },
  pine: { radiusX: 8, radiusY: 3 },
  sapling: { radiusX: 5, radiusY: 2 },
};

const plantShadows: Partial<Record<PlantKind, ShadowSize>> = {
  bush: { radiusX: 6, radiusY: 2 },
  "flowering bush": { radiusX: 6, radiusY: 2 },
};

const clutterShadows: Partial<Record<ClutterKind, ShadowSize>> = {
  "robot arm lying down": { radiusX: 12, radiusY: 2 },
  "robot arm reaching up": { radiusX: 10, radiusY: 2 },
};

function shadowUnder(at: Point, size: ShadowSize | undefined): Ellipse[] {
  return size ? [{ centre: { x: at.x, y: at.y + 1 }, ...size }] : [];
}

const shadows: readonly Ellipse[] = [
  ...plazaLayout.trees.flatMap((tree) => shadowUnder(tree.at, treeShadows[tree.kind])),
  ...plazaLayout.plants.flatMap((plant) => shadowUnder(plant.at, plantShadows[plant.kind])),
  ...plazaLayout.clutter.flatMap((piece) => shadowUnder(piece.at, clutterShadows[piece.kind])),
  ...plazaLayout.lampPosts.flatMap((lamp) => shadowUnder(lamp, { radiusX: 5, radiusY: 2 })),
  {
    centre: { x: plazaLayout.desk.tableAt.x + 21, y: plazaLayout.desk.footY - 2 },
    radiusX: 25,
    radiusY: 4,
  },
  {
    centre: { x: plazaLayout.desk.chairAt.x + 7, y: plazaLayout.desk.chairAt.y + 15 },
    radiusX: 9,
    radiusY: 2,
  },
];

/** A soft-edged spot: solid in the middle, speckled towards the rim. */
function isInSpot(spot: Ellipse, x: number, y: number, solidPart: number): boolean {
  const reach = reachInEllipse(spot, x, y);
  return reach <= solidPart || (reach <= 1 && isOnChequer(x, y));
}

function groundColourAt(x: number, y: number, kind: GroundKind, onEdge: boolean): ColourName {
  const colour =
    kind === "paving"
      ? pavingColourAt(x, y, onEdge)
      : kind === "path"
        ? pathColourAt(x, y, onEdge)
        : grassColourAt(x, y);
  const shaded = shadows.some((shadow) => isInSpot(shadow, x, y, 0.8));
  const lit = lightPools.some((pool) => isInSpot(pool, x, y, 0.8));
  // A shadow inside a pool of light cancels out. Darkening then brightening is
  // not the same thing: the two ladders of tones do not mirror each other.
  if (shaded === lit) return colour;
  return (shaded ? oneStepDarker[colour] : oneStepBrighter[colour]) ?? colour;
}

function paintBackdrop(surface: Surface): void {
  const kindAt = (x: number, y: number): GroundKind => groundKindAt(x, y);
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      const kind = kindAt(x, y);
      if (kind === "sky") {
        setPixel(surface, x, y, skyColourAt(x, y));
        continue;
      }
      const onEdge =
        kind !== "grass" &&
        (kindAt(x - 1, y) === "grass" ||
          kindAt(x + 1, y) === "grass" ||
          kindAt(x, y - 1) === "grass" ||
          kindAt(x, y + 1) === "grass");
      setPixel(surface, x, y, groundColourAt(x, y, kind, onEdge));
    }
  }
}

let paintedBackdrop: Surface | null = null;

/** Paints the still part of the plaza. It is worked out once and copied after that. */
export function drawBackdrop(surface: Surface): void {
  if (surface.width !== plazaLayout.width || surface.height !== plazaLayout.height) {
    paintBackdrop(surface);
    return;
  }
  if (!paintedBackdrop) {
    paintedBackdrop = createSurface(plazaLayout.width, plazaLayout.height);
    paintBackdrop(paintedBackdrop);
  }
  surface.pixels.set(paintedBackdrop.pixels);
}
