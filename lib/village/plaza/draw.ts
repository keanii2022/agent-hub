import { drawHuman } from "../characters/human";
import { drawSprite, fillRect, setPixel, type ColourName, type Sprite, type Surface } from "../engine";
import { drawBackdrop } from "./ground";
import { liesFlat, plazaLayout, type Point, type Rect } from "./layout";
import {
  LAMP_GLASS,
  chair,
  clutterSprites,
  computer,
  keyboard,
  lampPost,
  mug,
  plantSprites,
  table,
  treeSprites,
} from "./sprites";
import type { PlazaState } from "./state";

/** Something standing on the ground. `footY` is where it touches: a lower foot is nearer, so it is drawn later. */
export type Drawable = {
  readonly footY: number;
  draw(surface: Surface): void;
};

/** Draws things back to front, so whatever stands nearer covers what stands behind it. */
export function drawInDepthOrder(surface: Surface, drawables: readonly Drawable[]): void {
  [...drawables].sort((behind, inFront) => behind.footY - inFront.footY).forEach((drawable) => drawable.draw(surface));
}

function drawStandingOn(surface: Surface, sprite: Sprite, foot: Point, mirrored: boolean = false): void {
  drawSprite(surface, sprite, foot.x - Math.floor(sprite.width / 2), foot.y - sprite.height + 1, {
    flipX: mirrored,
  });
}

const flatClutter = plazaLayout.clutter.filter((piece) => liesFlat(piece.kind));
const standingClutter = plazaLayout.clutter.filter((piece) => !liesFlat(piece.kind));

// Three rings of speckles, warmer and denser towards the glass, stand in for a soft glow.
const LAMP_HALO: readonly {
  reach: number;
  colour: ColourName;
  isLit(x: number, y: number): boolean;
}[] = [
  { reach: 10, colour: "wood", isLit: (x, y) => (x + 2 * y) % 4 === 0 },
  { reach: 7, colour: "clay", isLit: (x, y) => (x + y) % 2 === 0 },
  { reach: 5, colour: "sunset", isLit: (x, y) => (x + y) % 2 === 0 },
];

function drawLampPost(surface: Surface, foot: Point): void {
  const left = foot.x - Math.floor(lampPost.width / 2);
  const top = foot.y - lampPost.height + 1;
  const glass = { x: left + LAMP_GLASS.x, y: top + LAMP_GLASS.y };
  for (const ring of LAMP_HALO) {
    for (let y = glass.y - ring.reach; y <= glass.y + ring.reach; y += 1) {
      for (let x = glass.x - ring.reach; x <= glass.x + ring.reach; x += 1) {
        const inReach = Math.hypot(x - glass.x, y - glass.y) <= ring.reach;
        if (inReach && ring.isLit(x, y)) setPixel(surface, x, y, ring.colour);
      }
    }
  }
  drawSprite(surface, lampPost, left, top);
}

const GLASS_LINE_STEP = 2;

function drawDesk(surface: Surface, state: PlazaState): void {
  const { desk } = plazaLayout;
  drawSprite(surface, chair, desk.chairAt.x, desk.chairAt.y);
  drawSprite(surface, table, desk.tableAt.x, desk.tableAt.y);

  drawSprite(surface, keyboard, desk.keyboardAt.x, desk.keyboardAt.y);
  if (state.computer.keyDown !== null) {
    setPixel(surface, desk.keyboardAt.x + state.computer.keyDown, desk.keyboardAt.y + 1, "lamp");
  }
  if (state.mugIsOnDesk) drawSprite(surface, mug, desk.mugAt.x, desk.mugAt.y);

  drawSprite(surface, computer, desk.computerAt.x, desk.computerAt.y);
  const glass = desk.computerGlass;
  state.computer.lines.forEach((letters, line) => {
    fillRect(surface, glass.x, glass.y + line * GLASS_LINE_STEP, letters, 1, "lime");
  });
  const { cursor } = state.computer;
  if (cursor.showing) {
    setPixel(surface, glass.x + cursor.column, glass.y + cursor.line * GLASS_LINE_STEP, "cream");
  }

  drawHuman(surface, state.human, desk.humanAt.x, desk.humanAt.y);
}

/** Everything in the plaza that stands up, for drawing in depth order. Add houses or walkers to this list before drawing. */
export function plazaDrawables(state: PlazaState): Drawable[] {
  return [
    ...plazaLayout.trees.map((tree) => ({
      footY: tree.at.y,
      draw(surface: Surface): void {
        const sprites = treeSprites[tree.kind];
        drawStandingOn(surface, sprites.trunk, tree.at, tree.mirrored);
        drawStandingOn(
          surface,
          sprites.leaves,
          { x: tree.at.x, y: tree.at.y - sprites.bareTrunkRows },
          tree.mirrored,
        );
      },
    })),
    ...plazaLayout.plants.map((plant) => ({
      footY: plant.at.y,
      draw: (surface: Surface) =>
        drawStandingOn(surface, plantSprites[plant.kind], plant.at, plant.mirrored),
    })),
    ...standingClutter.map((piece) => ({
      footY: piece.at.y,
      draw: (surface: Surface) =>
        drawStandingOn(surface, clutterSprites[piece.kind], piece.at, piece.mirrored),
    })),
    ...plazaLayout.lampPosts.map((lamp) => ({
      footY: lamp.y,
      draw: (surface: Surface) => drawLampPost(surface, lamp),
    })),
    { footY: plazaLayout.desk.footY, draw: (surface: Surface) => drawDesk(surface, state) },
  ];
}

/** The still backdrop, the stars, and the litter lying flat on the ground. */
export function drawPlazaGround(surface: Surface, state: PlazaState): void {
  drawBackdrop(surface);
  for (const star of state.stars) {
    setPixel(surface, star.at.x, star.at.y, star.bright ? "cream" : "stone");
  }
  for (const butt of flatClutter) {
    drawStandingOn(surface, clutterSprites[butt.kind], butt.at, butt.mirrored);
  }
  setPixel(surface, plazaLayout.smoulderingButt.x, plazaLayout.smoulderingButt.y, "ember");
}

const FOCUS_MARK_ARM = 4;
const FOCUS_MARK_GAP = 2;

/** Four corner brackets around an area: the "the keyboard is here" mark. */
export function drawFocusMark(surface: Surface, around: Rect, colour: ColourName = "lamp"): void {
  const left = around.x - FOCUS_MARK_GAP;
  const top = around.y - FOCUS_MARK_GAP;
  const right = around.x + around.width - 1 + FOCUS_MARK_GAP;
  const bottom = around.y + around.height - 1 + FOCUS_MARK_GAP;

  const arms: Rect[] = [];
  for (const x of [left, right]) {
    for (const y of [top, bottom]) {
      arms.push({ x: x === left ? x : x - FOCUS_MARK_ARM + 1, y, width: FOCUS_MARK_ARM, height: 1 });
      arms.push({ x, y: y === top ? y : y - FOCUS_MARK_ARM + 1, width: 1, height: FOCUS_MARK_ARM });
    }
  }
  // A dark edge all round keeps the mark clear on anything behind it, light wood as much as dark stone.
  for (const arm of arms) fillRect(surface, arm.x - 1, arm.y - 1, arm.width + 2, arm.height + 2, "ink");
  for (const arm of arms) fillRect(surface, arm.x, arm.y, arm.width, arm.height, colour);
}

/** What floats over everything: smoke, sparks, fireflies and the focus mark. */
export function drawPlazaAir(surface: Surface, state: PlazaState): void {
  for (const puff of state.smoke) {
    setPixel(surface, puff.at.x, puff.at.y, puff.thin ? "stone" : "mist");
  }
  if (state.wiresAreSparking) {
    const wires = plazaLayout.sparkingWires;
    setPixel(surface, wires.x, wires.y, "cream");
    setPixel(surface, wires.x - 1, wires.y - 1, "lamp");
    setPixel(surface, wires.x + 1, wires.y - 2, "lamp");
    setPixel(surface, wires.x - 2, wires.y + 1, "lamp");
  }
  for (const firefly of state.fireflies) {
    if (firefly.glowing) setPixel(surface, firefly.at.x, firefly.at.y, "lime");
  }
  if (state.computer.hasFocus) drawFocusMark(surface, plazaLayout.desk.computerBounds);
}

export function drawPlaza(surface: Surface, state: PlazaState): void {
  drawPlazaGround(surface, state);
  drawInDepthOrder(surface, plazaDrawables(state));
  drawPlazaAir(surface, state);
}
