import { drawSprite, type Sprite, type Surface } from "../../engine";
import type { Drawable } from "../../plaza/draw";
import type { ManagerState } from "./round";
import { managerPictures, managerPoints } from "./sprites";

function pictureFor(manager: ManagerState): Sprite {
  if (manager.activity === "knocking") {
    return manager.knucklesOnDoor
      ? managerPictures.knocking.knucklesOnDoor
      : managerPictures.knocking.handDrawnBack;
  }
  const view = manager.facing === "up" || manager.facing === "down" ? manager.facing : "side";
  return manager.stride === null
    ? managerPictures.standing[view]
    : managerPictures.walking[view][manager.stride];
}

/** Draws the manager with the middle of his feet on `manager.at`. */
export function drawManager(surface: Surface, manager: ManagerState): void {
  const picture = pictureFor(manager);
  const feet = { x: Math.round(manager.at.x), y: Math.round(manager.at.y) };
  drawSprite(surface, picture, feet.x - managerPoints.feet.x, feet.y - managerPoints.feet.y, {
    flipX: manager.facing === "left",
  });
}

/** The manager as one of the things standing in the plaza, so nearer things cover him and he covers further ones. */
export function managerDrawable(manager: ManagerState): Drawable {
  return {
    footY: Math.round(manager.at.y),
    draw: (surface) => drawManager(surface, manager),
  };
}
