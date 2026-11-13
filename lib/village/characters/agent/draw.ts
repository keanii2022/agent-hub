import { drawSprite, fillRect, setPixel, type Sprite, type Surface } from "../../engine";
import type { Drawable } from "../../plaza/draw";
import { desk } from "../../plaza/layout";
import { agentPicturesFor, agentPoints } from "./sprites";
import { agentBoxAt, type WalkingAgent } from "./walk";

function pictureFor(agent: WalkingAgent): Sprite {
  const pictures = agentPicturesFor(agent.look);
  const poses = agent.carriesPaperwork ? pictures.carrying : pictures.emptyHanded;
  const view = agent.facing === "up" || agent.facing === "down" ? agent.facing : "side";
  return agent.stride === null ? poses.standing[view] : poses.walking[view][agent.stride];
}

/** Draws a walking agent with the middle of its feet on `agent.at`. */
export function drawWalkingAgent(surface: Surface, agent: WalkingAgent): void {
  const box = agentBoxAt(agent.at, agent.facing);
  drawSprite(surface, pictureFor(agent), box.x, box.y, { flipX: agent.facing === "left" });
}

const HAND_DRAWN_BACK_PIXELS = 2;

/**
 * Its arm from its shoulder down to an elbow and across to the owner's
 * shoulder, with the hand on it or drawn a little back. It stands further
 * back than the owner sits, so the arm reaches down as well as across. Only
 * for an agent facing right, behind the chair.
 */
export function drawAgentsArmToTheShoulder(surface: Surface, agent: WalkingAgent): void {
  const box = agentBoxAt(agent.at, agent.facing);
  const shoulder = { x: box.x + agentPoints.shoulder.x, y: box.y + agentPoints.shoulder.y };
  const hand = {
    x: desk.shoulderSpot.x - (agent.handOnShoulder ? 0 : HAND_DRAWN_BACK_PIXELS),
    y: desk.shoulderSpot.y - (agent.handOnShoulder ? 0 : 1),
  };
  const upperArmRows = hand.y - shoulder.y;
  const forearmLength = hand.x - 1 - shoulder.x;
  fillRect(surface, shoulder.x - 1, shoulder.y - 1, 4, upperArmRows + 3, "ink");
  fillRect(surface, shoulder.x - 1, hand.y - 2, forearmLength + 4, 4, "ink");
  fillRect(surface, shoulder.x, shoulder.y, 2, upperArmRows + 1, "mist");
  fillRect(surface, shoulder.x, hand.y - 1, forearmLength, 2, "mist");
  // The same orange joints as the arms it types with inside.
  fillRect(surface, shoulder.x, shoulder.y, 2, 2, "sunset");
  fillRect(surface, shoulder.x, hand.y - 1, 2, 2, "sunset");
  fillRect(surface, hand.x - 1, hand.y - 1, 2, 2, "cloud");
  if (agent.handOnShoulder) {
    // Two short ticks over the hand: the tap itself.
    setPixel(surface, hand.x - 2, hand.y - 4, "cream");
    setPixel(surface, hand.x + 1, hand.y - 4, "cream");
  }
}

/**
 * Everything of a walking agent to mix in with the rest of the plaza. Its arm
 * on the owner's shoulder is its own thing, because the owner sits nearer than
 * it stands and would otherwise cover it.
 */
export function walkingAgentDrawables(agent: WalkingAgent): Drawable[] {
  const drawables: Drawable[] = [
    { footY: Math.round(agent.at.y), draw: (surface) => drawWalkingAgent(surface, agent) },
  ];
  if (agent.activity === "tapping the shoulder") {
    drawables.push({ footY: desk.footY, draw: (surface) => drawAgentsArmToTheShoulder(surface, agent) });
  }
  return drawables;
}
