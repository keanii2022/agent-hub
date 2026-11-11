import {
  GLYPH_HEIGHT,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  colourAt,
  createSurface,
  drawText,
  measureText,
  type ColourName,
  type Surface,
} from "../../../lib/village/engine";
import { drawVillage, type PlacedHouse, type StatusOf } from "../../../lib/village/houses";
import { desk, groundKindAt, plazaStateAt, type Point, type Rect } from "../../../lib/village/plaza";

/** The moment the saved screenshot is taken at. */
export const SCREENSHOT_MS = 4200;

export const wholeScreen: Rect = { x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

export function villageAt(timeMs: number, houses: readonly PlacedHouse[], statusOf?: StatusOf): Surface {
  const surface = createSurface();
  drawVillage(surface, plazaStateAt(timeMs), houses, statusOf);
  return surface;
}

export function pixelsIn(area: Rect): Point[] {
  const pixels: Point[] = [];
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) pixels.push({ x, y });
  }
  return pixels;
}

export function pixelsThatDiffer(first: Surface, second: Surface, within: Rect = wholeScreen): Point[] {
  return pixelsIn(within).filter(({ x, y }) => colourAt(first, x, y) !== colourAt(second, x, y));
}

export function coloursIn(surface: Surface, area: Rect): Set<ColourName | null> {
  return new Set(pixelsIn(area).map(({ x, y }) => colourAt(surface, x, y)));
}

export function isInside(area: Rect, point: Point): boolean {
  return (
    point.x >= area.x &&
    point.y >= area.y &&
    point.x < area.x + area.width &&
    point.y < area.y + area.height
  );
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    isInside(outer, inner) &&
    isInside(outer, { x: inner.x + inner.width - 1, y: inner.y + inner.height - 1 })
  );
}

export function overlap(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

export function grownBy(area: Rect, margin: number): Rect {
  return {
    x: area.x - margin,
    y: area.y - margin,
    width: area.width + 2 * margin,
    height: area.height + 2 * margin,
  };
}

/**
 * Where `words` are written in `colour` inside `area`, or null. The match is
 * exact: every pixel of every letter is that colour and no pixel between the
 * strokes is, so a clipped, smudged or misspelled word is not found.
 */
export function findWords(surface: Surface, words: string, colour: ColourName, area: Rect): Point | null {
  const { width } = measureText(words);
  const stencil = createSurface(width, GLYPH_HEIGHT);
  drawText(stencil, words, 0, 0, colour);
  const cells = pixelsIn({ x: 0, y: 0, width, height: GLYPH_HEIGHT });

  for (let top = area.y; top + GLYPH_HEIGHT <= area.y + area.height + 2; top += 1) {
    for (let left = area.x; left + width <= area.x + area.width; left += 1) {
      const matches = cells.every(({ x, y }) => {
        const isStroke = colourAt(stencil, x, y) !== null;
        return (colourAt(surface, left + x, top + y) === colour) === isStroke;
      });
      if (matches) return { x: left, y: top };
    }
  }
  return null;
}

function everyPlaceWalkableFrom(start: Point): Set<string> {
  const canWalk = (x: number, y: number): boolean => {
    const kind = groundKindAt(x, y);
    return isInside(wholeScreen, { x, y }) && (kind === "path" || kind === "paving");
  };
  const reached = new Set<string>();
  const toVisit: Point[] = canWalk(start.x, start.y) ? [start] : [];
  while (toVisit.length > 0) {
    const { x, y } = toVisit.pop() as Point;
    if (reached.has(`${x},${y}`)) continue;
    reached.add(`${x},${y}`);
    for (const [nextX, nextY] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (canWalk(nextX, nextY) && !reached.has(`${nextX},${nextY}`)) toVisit.push({ x: nextX, y: nextY });
    }
  }
  return reached;
}

const walkableFromTheDesk = everyPlaceWalkableFrom(desk.visitorSpot);

/** True when a walker can get from the desk to `point` on paths and paving alone, never over grass. */
export function canBeWalkedToFromTheDesk(point: Point): boolean {
  return walkableFromTheDesk.has(`${point.x},${point.y}`);
}
