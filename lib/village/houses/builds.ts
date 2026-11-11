import {
  colourAt,
  createSurface,
  fillRect,
  setPixel,
  type ColourName,
  type Sprite,
  type Surface,
} from "../engine";
import { grain } from "../plaza/grain";
import type { Rect } from "../plaza/layout";

// How a house is built: its walls, roof, door and windows. Every build has the
// same outline and the same door in the same place, so a sign, a prop or a
// visitor fits any of them. Bodies are painted once, with every window dark;
// the light in the windows is drawn over them from the house's state.

export const BODY_WIDTH = 61;
const ROOF_ROWS = 22;
const WALL_ROWS = 30;
export const BODY_HEIGHT = ROOF_ROWS + WALL_ROWS;

const WALL_LEFT = 2;
const WALL_RIGHT = BODY_WIDTH - 1 - WALL_LEFT;
const WALL_TOP = ROOF_ROWS;
const FOUNDATION_ROWS = 2;

/** Measured from the top left of the body. A standing character is about 26 tall, so the door is too. */
export const DOOR: Rect = { x: 23, y: BODY_HEIGHT - 27, width: 15, height: 27 };
/** The small pane over the door, lit whenever the house is. */
export const DOOR_LIGHT: Rect = { x: DOOR.x + 2, y: DOOR.y + 2, width: DOOR.width - 4, height: 3 };

type RoofTones = { readonly light: ColourName; readonly base: ColourName; readonly shade: ColourName };

type Build = {
  /** Measured from the top left of the body, in the order they light up. */
  readonly windows: readonly Rect[];
  readonly windowTrim: ColourName | null;
  readonly roof: "tiles" | "sheet metal";
  readonly roofTones: RoofTones;
  readonly hasChimney: boolean;
  wallColourAt(x: number, y: number): ColourName;
  readonly foundation: ColourName;
  readonly door: {
    readonly paint: ColourName;
    readonly shade: ColourName;
    readonly kind: "panelled" | "braced";
  };
};

const TALL_WINDOW = { width: 13, height: 14 };
const leftTallWindow: Rect = { x: 6, y: WALL_TOP + 4, ...TALL_WINDOW };
const rightTallWindow: Rect = { x: BODY_WIDTH - 6 - TALL_WINDOW.width, y: WALL_TOP + 4, ...TALL_WINDOW };

const BRICK_WIDTH = 8;
const BRICK_COURSE_ROWS = 4;
const PLANK_WIDTH = 5;

const builds = {
  "brick office": {
    windows: [leftTallWindow, rightTallWindow],
    windowTrim: "cloud",
    roof: "tiles",
    roofTones: { light: "mauve", base: "plum", shade: "dusk" },
    hasChimney: false,
    wallColourAt(x, y) {
      const course = Math.floor(y / BRICK_COURSE_ROWS);
      const shifted = x + (course % 2 === 0 ? 0 : BRICK_WIDTH / 2);
      if (y % BRICK_COURSE_ROWS === BRICK_COURSE_ROWS - 1 || shifted % BRICK_WIDTH === 0) return "slate";
      return grain(Math.floor(shifted / BRICK_WIDTH), course, 31) < 0.16 ? "mist" : "stone";
    },
    foundation: "slate",
    door: { paint: "teal", shade: "pine", kind: "panelled" },
  },
  "timber workshop": {
    windows: [
      { x: 5, y: WALL_TOP + 5, width: 16, height: 12 },
      { x: 39, y: WALL_TOP + 4, width: 8, height: 14 },
      { x: 49, y: WALL_TOP + 4, width: 8, height: 14 },
    ],
    windowTrim: null,
    roof: "sheet metal",
    roofTones: { light: "mist", base: "stone", shade: "slate" },
    hasChimney: false,
    wallColourAt(x, y) {
      if (x % PLANK_WIDTH === 0) return "wood";
      const plank = Math.floor(x / PLANK_WIDTH);
      // A knot here and there, and the odd paler board, so the planks do not look printed.
      if (grain(plank, Math.floor(y / 3), 37) < 0.05) return "wood";
      return grain(plank, 0, 41) < 0.25 ? "sand" : "clay";
    },
    foundation: "bark",
    door: { paint: "wood", shade: "bark", kind: "braced" },
  },
  "plaster cottage": {
    windows: [leftTallWindow, rightTallWindow],
    windowTrim: "wood",
    roof: "tiles",
    roofTones: { light: "sunset", base: "clay", shade: "wood" },
    hasChimney: true,
    wallColourAt(x, y) {
      const onPost = x <= WALL_LEFT + 2 || x >= WALL_RIGHT - 2;
      if (onPost || y <= 1) return "wood";
      return grain(x, y, 43) < 0.07 ? "clay" : "sand";
    },
    foundation: "stone",
    door: { paint: "plum", shade: "dusk", kind: "panelled" },
  },
} satisfies Record<string, Build>;

export type BuildName = keyof typeof builds;

export const buildNames = Object.keys(builds) as BuildName[];

export function windowsOf(build: BuildName): readonly Rect[] {
  return builds[build].windows;
}

/** The roof narrows a little towards its ridge, so it leans away from the street. */
function roofInsetAt(row: number): number {
  return row < 8 ? Math.ceil((8 - row) / 2) : 0;
}

const TILE_WIDTH = 6;
const TILE_COURSE_ROWS = 4;
const CHIMNEY: Rect = { x: 42, y: -5, width: 8, height: 9 };

function paintRoof(surface: Surface, build: Build, top: number): void {
  const { light, base, shade } = build.roofTones;
  for (let row = 0; row < ROOF_ROWS; row += 1) {
    const inset = build.roof === "tiles" ? roofInsetAt(row) : 0;
    const left = inset;
    const right = BODY_WIDTH - 1 - inset;
    for (let x = left; x <= right; x += 1) {
      const onRim = row === 0 || row === ROOF_ROWS - 1 || x === left || x === right;
      setPixel(surface, x, top + row, onRim ? "ink" : roofColourAt(x, row));
    }
  }

  function roofColourAt(x: number, row: number): ColourName {
    if (row === ROOF_ROWS - 2) return light;
    if (build.roof === "sheet metal") {
      if (row === 1) return light;
      if (row === 9) return shade;
      const rib = x % 4;
      return rib === 0 ? light : rib === 3 ? shade : base;
    }
    if (row === 1) return light;
    const tileRow = (row - 2) % TILE_COURSE_ROWS;
    const course = Math.floor((row - 2) / TILE_COURSE_ROWS);
    const shifted = x + (course % 2 === 0 ? 0 : TILE_WIDTH / 2);
    if (tileRow === TILE_COURSE_ROWS - 1 || shifted % TILE_WIDTH === 0) return shade;
    return tileRow === 0 && shifted % TILE_WIDTH <= 2 ? light : base;
  }
}

function paintChimney(surface: Surface, top: number): void {
  const { x, width, height } = CHIMNEY;
  const y = top + CHIMNEY.y;
  fillRect(surface, x, y, width, height, "ink");
  fillRect(surface, x + 1, y + 3, width - 2, height - 3, "stone");
  fillRect(surface, x + 1, y + 3, 2, height - 3, "mist");
  fillRect(surface, x - 1, y, width + 2, 3, "ink");
  fillRect(surface, x, y + 1, width, 1, "mist");
}

function paintWall(surface: Surface, build: Build, top: number): void {
  for (let row = 0; row < WALL_ROWS; row += 1) {
    for (let x = WALL_LEFT; x <= WALL_RIGHT; x += 1) {
      const onRim = x === WALL_LEFT || x === WALL_RIGHT || row === WALL_ROWS - 1;
      const onFoundation = row >= WALL_ROWS - 1 - FOUNDATION_ROWS;
      const colour = onRim ? "ink" : onFoundation ? build.foundation : build.wallColourAt(x, row);
      setPixel(surface, x, top + WALL_TOP + row, colour);
    }
  }
}

function paintDarkGlass(surface: Surface, glass: Rect): void {
  fillRect(surface, glass.x, glass.y, glass.width, glass.height, "dusk");
  // The last of the sky caught in the top corner of the pane.
  fillRect(surface, glass.x, glass.y, Math.min(3, glass.width), 1, "plum");
  setPixel(surface, glass.x, glass.y + 1, "plum");
}

/** The glass of a window, inside its frame and trim: the part that lights up. */
export function glassOf(window: Rect, trim: ColourName | null): Rect {
  const edge = trim ? 2 : 1;
  return {
    x: window.x + edge,
    y: window.y + edge,
    width: window.width - 2 * edge,
    height: window.height - 2 * edge,
  };
}

export function glassOfWindow(build: BuildName, window: Rect): Rect {
  return glassOf(window, builds[build].windowTrim);
}

/** The bars across a pane: one upright for every five pixels or so, and one across the middle. */
export function paintWindowBars(surface: Surface, glass: Rect, colour: ColourName): void {
  const uprights = glass.width >= 12 ? 2 : glass.width >= 7 ? 1 : 0;
  for (let bar = 1; bar <= uprights; bar += 1) {
    const x = glass.x + Math.round((bar * (glass.width - uprights)) / (uprights + 1)) + bar - 1;
    fillRect(surface, x, glass.y, 1, glass.height, colour);
  }
  fillRect(surface, glass.x, glass.y + Math.floor(glass.height / 2), glass.width, 1, colour);
}

function paintWindow(surface: Surface, build: Build, window: Rect, top: number): void {
  const frame: Rect = { ...window, y: window.y + top };
  fillRect(surface, frame.x, frame.y, frame.width, frame.height, "ink");
  if (build.windowTrim) {
    fillRect(surface, frame.x + 1, frame.y + 1, frame.width - 2, frame.height - 2, build.windowTrim);
  }
  const glass = glassOf(frame, build.windowTrim);
  paintDarkGlass(surface, glass);
  paintWindowBars(surface, glass, "ink");
}

function paintDoor(surface: Surface, build: Build, top: number): void {
  const { paint, shade, kind } = build.door;
  const x = DOOR.x;
  const y = DOOR.y + top;
  fillRect(surface, x, y, DOOR.width, DOOR.height, "ink");
  const inside: Rect = { x: x + 1, y: y + 1, width: DOOR.width - 2, height: DOOR.height - 2 };
  fillRect(surface, inside.x, inside.y, inside.width, inside.height, paint);

  paintDarkGlass(surface, { ...DOOR_LIGHT, y: DOOR_LIGHT.y + top });
  fillRect(surface, inside.x, DOOR_LIGHT.y + top + DOOR_LIGHT.height, inside.width, 1, "ink");
  fillRect(surface, inside.x, DOOR_LIGHT.y + top - 1, inside.width, 1, shade);

  const leafTop = DOOR_LIGHT.y + top + DOOR_LIGHT.height + 1;
  const leafBottom = y + DOOR.height - 3;
  if (kind === "panelled") {
    const panelHeight = Math.floor((leafBottom - leafTop - 3) / 2);
    for (const panelTop of [leafTop + 1, leafTop + 2 + panelHeight]) {
      fillRect(surface, inside.x + 2, panelTop, inside.width - 4, panelHeight, shade);
      fillRect(surface, inside.x + 3, panelTop + 1, inside.width - 6, panelHeight - 2, paint);
    }
  } else {
    for (let plank = inside.x + 3; plank < inside.x + inside.width; plank += 4) {
      fillRect(surface, plank, leafTop, 1, leafBottom - leafTop + 1, shade);
    }
    fillRect(surface, inside.x, leafTop + 1, inside.width, 2, "sand");
    fillRect(surface, inside.x, leafBottom - 2, inside.width, 2, "sand");
    for (let step = 0; step < inside.width; step += 1) {
      const braceY = leafTop + 3 + Math.round((step * (leafBottom - leafTop - 7)) / (inside.width - 1));
      fillRect(surface, inside.x + inside.width - 1 - step, braceY, 1, 2, "sand");
    }
  }
  setPixel(surface, inside.x + inside.width - 3, leafTop + Math.floor((leafBottom - leafTop) / 2), "lamp");
  fillRect(surface, inside.x, y + DOOR.height - 2, inside.width, 1, "stone");
}

/** A step darker for every colour a house uses: a house with nobody in it, or no news. */
const unlit: Partial<Record<ColourName, ColourName>> = {
  cream: "sand",
  cloud: "mist",
  mist: "stone",
  stone: "slate",
  slate: "night",
  night: "ink",
  dusk: "night",
  plum: "dusk",
  mauve: "plum",
  rose: "mauve",
  sand: "clay",
  clay: "wood",
  wood: "bark",
  bark: "ink",
  sunset: "wood",
  peach: "clay",
  lamp: "clay",
  teal: "pine",
  pine: "night",
};

function spriteOf(surface: Surface, tone: (colour: ColourName) => ColourName): Sprite {
  const pixels: (ColourName | null)[] = [];
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      const colour = colourAt(surface, x, y);
      pixels.push(colour === null ? null : tone(colour));
    }
  }
  return { width: surface.width, height: surface.height, pixels };
}

/** Rows a chimney may stand above the top of the roof. The body sprite is this much taller than the body. */
export const ROWS_ABOVE_ROOF = -CHIMNEY.y;

const bodySprites = new Map<string, Sprite>();

/**
 * The whole house with every window dark. The sprite starts `ROWS_ABOVE_ROOF`
 * rows above the body, to leave room for a chimney.
 */
export function bodySprite(buildName: BuildName, isDark: boolean): Sprite {
  const key = `${buildName} ${isDark ? "dark" : "lit"}`;
  let sprite = bodySprites.get(key);
  if (!sprite) {
    const build: Build = builds[buildName];
    const surface = createSurface(BODY_WIDTH, BODY_HEIGHT + ROWS_ABOVE_ROOF);
    const top = ROWS_ABOVE_ROOF;
    if (build.hasChimney) paintChimney(surface, top);
    paintRoof(surface, build, top);
    paintWall(surface, build, top);
    // The eave throws a shadow on the top of the wall.
    for (let x = WALL_LEFT + 1; x < WALL_RIGHT; x += 1) {
      const colour = colourAt(surface, x, top + WALL_TOP);
      if (colour) setPixel(surface, x, top + WALL_TOP, unlit[colour] ?? colour);
    }
    for (const window of build.windows) paintWindow(surface, build, window, top);
    paintDoor(surface, build, top);
    // Two steps down: one step still reads as a lived-in house at dusk.
    const oneStep = (colour: ColourName): ColourName => unlit[colour] ?? colour;
    sprite = spriteOf(surface, (colour) => (isDark ? oneStep(oneStep(colour)) : colour));
    bodySprites.set(key, sprite);
  }
  return sprite;
}
