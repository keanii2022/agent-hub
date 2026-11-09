import { drawSprite, type Surface } from "../../engine";
import type { HumanArms, HumanState } from "./routine";
import { arms, body, heads, type PlacedSprite } from "./sprites";

const armsFor: Record<HumanArms, PlacedSprite> = {
  "near hand on the keys": arms.nearHandOnKeys,
  "far hand on the keys": arms.farHandOnKeys,
  "resting on the keys": arms.restingOnKeys,
  "reaching for the mug": arms.reachingForMug,
  "mug at the mouth": arms.mugAtMouth,
  "behind his head": arms.behindHead,
};

/** `x`, `y` is the top left of the human's box (see HUMAN_WIDTH and HUMAN_HEIGHT). He faces right. */
export function drawHuman(surface: Surface, human: HumanState, x: number, y: number): void {
  const arm = armsFor[human.arms];
  // Arms behind his head are the one pose where the arm is further away than the rest of him.
  const armIsBehindHim = human.arms === "behind his head";
  if (armIsBehindHim) drawSprite(surface, arm.sprite, x + arm.x, y + arm.y);

  drawSprite(surface, body.sprite, x + body.x, y + body.y);

  const head = human.head === "at the viewer" ? heads.facingViewer : heads.inProfile;
  const headLean = human.head === "tipped back" ? -1 : 0;
  drawSprite(surface, head[human.eyes], x + headLean, y);

  if (!armIsBehindHim) drawSprite(surface, arm.sprite, x + arm.x, y + arm.y);
}
