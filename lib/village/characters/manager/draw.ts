import { drawSprite, fillRect, setPixel, type Sprite, type Surface } from "../../engine";
import type { Drawable } from "../../plaza/draw";
import { desk } from "../../plaza/layout";
import type { ManagerState, SmokePuff } from "./round";
import { managerPictures, managerPoints } from "./sprites";

function pictureFor(manager: ManagerState): Sprite {
  if (manager.activity === "knocking") {
    return manager.knucklesOnDoor
      ? managerPictures.knocking.knucklesOnDoor
      : managerPictures.knocking.handDrawnBack;
  }
  const pictures = manager.carriesPaperwork ? managerPictures.carrying : managerPictures;
  const view = manager.facing === "up" || manager.facing === "down" ? manager.facing : "side";
  return manager.stride === null ? pictures.standing[view] : pictures.walking[view][manager.stride];
}

function topLeftOf(manager: ManagerState): { x: number; y: number } {
  return {
    x: Math.round(manager.at.x) - managerPoints.feet.x,
    y: Math.round(manager.at.y) - managerPoints.feet.y,
  };
}

/** Draws the manager with the middle of his feet on `manager.at`. */
export function drawManager(surface: Surface, manager: ManagerState): void {
  const box = topLeftOf(manager);
  drawSprite(surface, pictureFor(manager), box.x, box.y, { flipX: manager.facing === "left" });
}

/** The manager as one of the things standing in the plaza, so nearer things cover him and he covers further ones. */
export function managerDrawable(manager: ManagerState): Drawable {
  return {
    footY: Math.round(manager.at.y),
    draw: (surface) => drawManager(surface, manager),
  };
}

const HAND_DRAWN_BACK_PIXELS = 2;

/**
 * His arm reaching from his shoulder to the owner's, with the hand on it or
 * drawn a little back. Only for a manager standing at the desk's visitor spot.
 */
export function drawArmToTheShoulder(surface: Surface, manager: ManagerState): void {
  const fromX = topLeftOf(manager).x + managerPoints.shoulder.x;
  const hand = {
    x: desk.shoulderSpot.x - (manager.handOnShoulder ? 0 : HAND_DRAWN_BACK_PIXELS),
    y: desk.shoulderSpot.y - (manager.handOnShoulder ? 0 : 1),
  };
  const sleeveLength = hand.x - 1 - fromX;
  fillRect(surface, fromX - 1, hand.y - 2, sleeveLength + 4, 4, "ink");
  fillRect(surface, fromX, hand.y - 1, sleeveLength, 2, "mist");
  fillRect(surface, hand.x - 1, hand.y - 1, 2, 2, "peach");
  if (manager.handOnShoulder) {
    // Two short ticks over the hand: the tap itself.
    setPixel(surface, hand.x - 2, hand.y - 4, "cream");
    setPixel(surface, hand.x + 1, hand.y - 4, "cream");
  }
}

/**
 * Everything of the manager to mix in with the rest of the plaza. His arm on
 * the owner's shoulder is its own thing, because the owner sits nearer than he
 * stands and would otherwise cover it.
 */
export function managerDrawables(manager: ManagerState): Drawable[] {
  const drawables = [managerDrawable(manager)];
  if (manager.activity === "tapping the shoulder") {
    drawables.push({ footY: desk.footY, draw: (surface) => drawArmToTheShoulder(surface, manager) });
  }
  return drawables;
}

/** Cigarette smoke, whoever's it is. It floats over everything, so it is drawn after the plaza's own air. */
export function drawSmoke(surface: Surface, puffs: readonly SmokePuff[]): void {
  for (const puff of puffs) {
    setPixel(surface, puff.at.x, puff.at.y, puff.age === "thin" ? "mist" : "cloud");
    if (puff.age === "fresh") setPixel(surface, puff.at.x + 1, puff.at.y - 1, "cloud");
  }
}

export function drawManagersSmoke(surface: Surface, manager: ManagerState): void {
  drawSmoke(surface, manager.smoke ?? []);
}
