import { walkingAgentDrawables } from "../characters/agent";
import { drawManagersSmoke, drawSmoke, managerDrawables } from "../characters/manager";
import {
  drawSprite,
  drawText,
  fillRect,
  measureText,
  setPixel,
  type ColourName,
  type Surface,
} from "../engine";
import type { PlacedHouse } from "../houses/place";
import type { Drawable } from "../plaza/draw";
import { desk, type Point } from "../plaza/layout";
import type { AgentAtTheDoor, DeliveryScene, SpeechBubble } from "./scene";
import { deskMark, doorAgentFeet, doorAgentPictures } from "./sprites";

/** What drawing needs to know of one paper in the stack. */
export type StackedPaper = { readonly isUrgent: boolean };

export const STACK_WIDTH = 9;
/** One waiting thing is a wad of paperwork, not a single sheet. */
export const ROWS_OF_A_THICK_PAPER = 3;
/** This many papers at the top of the stack show at full thickness; the ones under them are pressed thin. */
const THICK_PAPERS_AT_MOST = 4;
/** The stack never shows more rows of paper than this, so it stays on the desk and clear of the sky. */
export const STACK_ROWS_AT_MOST = 20;
/** With more papers than this the stack is as tall as it gets, and shows that it is overflowing. */
export const STACK_PAPERS_SHOWN_AT_MOST =
  THICK_PAPERS_AT_MOST + (STACK_ROWS_AT_MOST - THICK_PAPERS_AT_MOST * ROWS_OF_A_THICK_PAPER);

// Nobody squares up a pile of paperwork: each paper sits a little off the one under it.
const paperSlip = [0, 1, 0, -1, 0, 1, -1, 0] as const;

/** How many rows of paper a stack of `count` shows: taller with every paper, up to the tallest it gets. */
export function stackRowsFor(count: number): number {
  const papers = Math.max(0, Math.floor(count));
  const thick = Math.min(papers, THICK_PAPERS_AT_MOST);
  return Math.min(thick * ROWS_OF_A_THICK_PAPER + (papers - thick), STACK_ROWS_AT_MOST);
}

function drawPaperRow(surface: Surface, left: number, y: number, paper: ColourName, isUrgent: boolean): void {
  fillRect(surface, left, y, STACK_WIDTH, 1, "ink");
  fillRect(surface, left + 1, y, STACK_WIDTH - 2, 1, paper);
  // An urgent paper wears a red tab on its edge.
  if (isUrgent) fillRect(surface, left + STACK_WIDTH - 3, y, 2, 1, "ember");
}

// With more paperwork than the stack can show, the top slides and sheets end up on the ground.
const fallenSheets: readonly Point[] = [
  { x: desk.stackSpot.x + 9, y: desk.footY + 2 },
  { x: desk.stackSpot.x + 17, y: desk.footY + 1 },
];

function drawFallenSheet(surface: Surface, at: Point): void {
  fillRect(surface, at.x - 3, at.y - 2, 7, 3, "ink");
  fillRect(surface, at.x - 2, at.y - 1, 5, 1, "cream");
}

/**
 * The stack of paperwork with the middle of its bottom on `spot`, oldest paper
 * at the bottom. It grows with every paper until it is as tall as it gets;
 * past that the top leans and loose sheets lie by the desk.
 */
export function drawStack(surface: Surface, papers: readonly StackedPaper[], spot: Point = desk.stackSpot): void {
  if (papers.length === 0) return;
  const shown = papers.slice(-STACK_PAPERS_SHOWN_AT_MOST);
  const isOverflowing = papers.length > STACK_PAPERS_SHOWN_AT_MOST;
  const thinPapers = shown.length - Math.min(shown.length, THICK_PAPERS_AT_MOST);
  const rows = stackRowsFor(papers.length);
  const left = spot.x - (STACK_WIDTH - 1) / 2;

  fillRect(surface, left, spot.y, STACK_WIDTH, 1, "ink");
  let y = spot.y - 1;
  let topLeft = left;
  shown.forEach((paper, index) => {
    const leansBy = isOverflowing ? Math.max(0, index - (shown.length - 4)) : 0;
    topLeft = left + paperSlip[index % paperSlip.length] + leansBy;
    if (index < thinPapers) {
      drawPaperRow(surface, topLeft, y, index % 2 === 0 ? "cloud" : "cream", paper.isUrgent);
      y -= 1;
    } else {
      for (let row = 0; row < ROWS_OF_A_THICK_PAPER; row += 1) {
        drawPaperRow(surface, topLeft, y - row, row === 0 ? "cloud" : "cream", paper.isUrgent);
      }
      y -= ROWS_OF_A_THICK_PAPER;
    }
  });
  // The face of the top sheet, seen a little from above, and its far edge.
  drawPaperRow(surface, topLeft, spot.y - rows - 1, "cream", false);
  fillRect(surface, topLeft + 1, spot.y - rows - 2, STACK_WIDTH - 2, 1, "ink");

  if (isOverflowing) fallenSheets.forEach((sheet) => drawFallenSheet(surface, sheet));
}

/** The exclamation mark with the middle of its bottom on `spot`, or a pixel higher while it bobs. */
export function drawDeskMark(surface: Surface, isRaised: boolean, spot: Point = desk.markSpot): void {
  drawSprite(
    surface,
    deskMark,
    spot.x - Math.floor(deskMark.width / 2),
    spot.y - deskMark.height + 1 - (isRaised ? 1 : 0),
  );
}

const BUBBLE_LETTERS_PER_LINE = 16;
const BUBBLE_PADDING = { left: 4, right: 3, top: 3, bottom: 2 } as const;
/** The tail hangs this many rows below the bubble's bottom edge; its last pixel is the spot it points at. */
const BUBBLE_TAIL_ROWS = 2;
const BUBBLE_KEEPS_FROM_EDGE = 2;

/** Breaks words over lines of at most `lettersPerLine`, never inside a word. */
export function wrappedForABubble(words: string, lettersPerLine: number = BUBBLE_LETTERS_PER_LINE): string[] {
  const lines: string[] = [];
  for (const word of words.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= lettersPerLine) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** Where a bubble for these words sits when its tail ends on `over`: always whole and inside the picture. */
export function bubbleBoxFor(surface: Surface, bubble: SpeechBubble): { x: number; y: number; width: number; height: number } {
  const text = measureText(wrappedForABubble(bubble.words).join("\n"));
  const width = text.width + BUBBLE_PADDING.left + BUBBLE_PADDING.right;
  const height = text.height + BUBBLE_PADDING.top + BUBBLE_PADDING.bottom;
  const furthestLeft = BUBBLE_KEEPS_FROM_EDGE;
  const furthestRight = surface.width - BUBBLE_KEEPS_FROM_EDGE - width;
  return {
    x: Math.min(Math.max(bubble.over.x - Math.floor(width / 2), furthestLeft), furthestRight),
    y: Math.max(bubble.over.y - BUBBLE_TAIL_ROWS - height + 1, BUBBLE_KEEPS_FROM_EDGE),
    width,
    height,
  };
}

/** A small speech bubble: dark words on pale paper with a dark edge, so it reads over anything. */
export function drawSpeechBubble(surface: Surface, bubble: SpeechBubble): void {
  const box = bubbleBoxFor(surface, bubble);
  const bottom = box.y + box.height - 1;
  fillRect(surface, box.x + 1, box.y, box.width - 2, box.height, "ink");
  fillRect(surface, box.x, box.y + 1, box.width, box.height - 2, "ink");
  fillRect(surface, box.x + 1, box.y + 1, box.width - 2, box.height - 2, "cream");

  const tailX = Math.min(Math.max(bubble.over.x, box.x + 4), box.x + box.width - 5);
  fillRect(surface, tailX - 1, bottom, 3, 1, "cream");
  fillRect(surface, tailX - 1, bottom + 1, 3, 1, "ink");
  setPixel(surface, tailX, bottom + 1, "cream");
  setPixel(surface, tailX, bottom + 2, "ink");

  drawText(
    surface,
    wrappedForABubble(bubble.words).join("\n"),
    box.x + BUBBLE_PADDING.left,
    box.y + BUBBLE_PADDING.top,
    "ink",
  );
}

/** Warm light where the shut door was: someone has just come out. */
function drawOpenDoor(surface: Surface, house: PlacedHouse): void {
  const inside = { x: house.door.x + 1, y: house.door.y + 1, width: house.door.width - 2, height: house.door.height - 2 };
  fillRect(surface, inside.x, inside.y, inside.width, inside.height, "lamp");
  fillRect(surface, inside.x, inside.y, inside.width, 1, "cream");
  fillRect(surface, inside.x, inside.y + inside.height - 7, inside.width, 7, "sunset");
  fillRect(surface, inside.x, inside.y + inside.height - 2, inside.width, 2, "clay");
}

function drawAgentAtTheDoor(surface: Surface, agent: AgentAtTheDoor): void {
  const picture = agent.holdsPaperwork ? doorAgentPictures.holdingPaperworkOut : doorAgentPictures.handsEmpty;
  drawSprite(surface, picture, agent.at.x - doorAgentFeet.x, agent.at.y - doorAgentFeet.y);
}

/**
 * Everything of the handover that stands in the plaza, to hand to `drawVillage`
 * as who is out: the manager, an agent at a door with the door open behind it,
 * every agent walking its own paperwork over, and the stack on the desk.
 */
export function deliveryDrawables(scene: DeliveryScene): Drawable[] {
  return [
    ...managerDrawables(scene.manager),
    ...scene.agentsAtTheDoor.flatMap((agent) => [
      // Same foot as the house, and later in the list: drawn straight after it, over its shut door.
      { footY: agent.house.footY, draw: (surface: Surface) => drawOpenDoor(surface, agent.house) },
      { footY: agent.at.y, draw: (surface: Surface) => drawAgentAtTheDoor(surface, agent) },
    ]),
    ...scene.walkers.flatMap((walker) => [
      // It left in a hurry: its door stands open until it is back, which shows from across the plaza that it is out.
      { footY: walker.home.footY, draw: (surface: Surface) => drawOpenDoor(surface, walker.home) },
      ...walkingAgentDrawables(walker),
    ]),
    // Same foot as the desk, and later in the list: it stands on the table.
    { footY: desk.footY, draw: (surface: Surface) => drawStack(surface, scene.stack) },
  ];
}

/** What floats over the whole village: smoke, the mark over the computer and anything being said. Draw it last. */
export function drawDeliveryAir(surface: Surface, scene: DeliveryScene): void {
  drawManagersSmoke(surface, scene.manager);
  for (const walker of scene.walkers) drawSmoke(surface, walker.smoke);
  if (scene.markIsShowing) drawDeskMark(surface, scene.markIsRaised);
  for (const bubble of scene.speech) drawSpeechBubble(surface, bubble);
}
