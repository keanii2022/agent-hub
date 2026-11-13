import type { Point } from "../plaza/layout";
import { nearestSpotOnALane, shortestWayAlongLanes } from "./network";

// A route is a walk between two points that never leaves the paths and the
// paving. A walker's place on it is worked out from how far he has walked,
// and that from the clock, so the same time always finds him on the same spot.

export type Route = {
  /** Where the walk starts, every corner it turns, and where it ends. Each run between two is level or upright. */
  readonly points: readonly Point[];
  /** In village pixels. */
  readonly length: number;
};

/** Which way a walker looks. "up" is up the screen, away from the viewer; "down" is towards the viewer. */
export type Facing = "left" | "right" | "up" | "down";

export type WalkerPlace = {
  /** The middle of the walker's feet. Keeps in-between positions; drawing rounds them. */
  readonly at: Point;
  readonly facing: Facing;
  /** How far along the route he is, in village pixels. */
  readonly walked: number;
  readonly hasArrived: boolean;
};

function runLength(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function isSamePoint(first: Point, second: Point): boolean {
  return first.x === second.x && first.y === second.y;
}

function isStraightThrough(before: Point, middle: Point, after: Point): boolean {
  const level = before.y === middle.y && middle.y === after.y;
  const upright = before.x === middle.x && middle.x === after.x;
  if (!level && !upright) return false;
  // A walker who doubles back turns a corner, even though all three are in line.
  return Math.sign(middle.x - before.x) === Math.sign(after.x - middle.x) &&
    Math.sign(middle.y - before.y) === Math.sign(after.y - middle.y);
}

function withoutNeedlessPoints(points: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    if (kept.length > 0 && isSamePoint(kept[kept.length - 1], point)) continue;
    while (kept.length >= 2 && isStraightThrough(kept[kept.length - 2], kept[kept.length - 1], point)) kept.pop();
    kept.push(point);
  }
  return kept;
}

function whole(point: Point): Point {
  return { x: Math.round(point.x), y: Math.round(point.y) };
}

/**
 * The shortest walk from one point to another along the paths and the paving,
 * round the desk and never over grass. Both ends must stand on a path or the
 * paving, or straight across walkable ground from one. Throws, in plain words,
 * when no such walk exists.
 */
export function routeBetween(from: Point, to: Point): Route {
  const start = whole(from);
  const end = whole(to);
  if (isSamePoint(start, end)) return { points: [start], length: 0 };

  const [firstStop, lastStop] = [start, end].map((point) => {
    const spot = nearestSpotOnALane(point);
    if (!spot) throw new Error(`No path or paving leads to ${point.x},${point.y}`);
    return spot;
  });
  const way = shortestWayAlongLanes(firstStop, lastStop);
  if (!way) {
    throw new Error(`No way along the paths from ${start.x},${start.y} to ${end.x},${end.y}`);
  }

  const points = withoutNeedlessPoints([start, ...way, end]);
  const length = points.slice(1).reduce((total, point, index) => total + runLength(points[index], point), 0);
  return { points, length };
}

function facingAlong(from: Point, to: Point): Facing {
  if (to.x !== from.x) return to.x > from.x ? "right" : "left";
  return to.y > from.y ? "down" : "up";
}

/**
 * Where a walker is after walking `distance` pixels of a route. Before the
 * start he stands at the start and past the end at the end. At a corner he
 * already faces the way he is about to go. `facingWhenStill` is used only for
 * a route with nowhere to go.
 */
export function placeAlong(route: Route, distance: number, facingWhenStill: Facing = "down"): WalkerPlace {
  const walked = Math.min(Math.max(0, distance), route.length);
  const hasArrived = walked >= route.length;
  const { points } = route;
  if (points.length < 2) return { at: points[0], facing: facingWhenStill, walked, hasArrived };

  let left = walked;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const length = runLength(from, to);
    const isLastRun = index === points.length - 1;
    if (left < length || isLastRun) {
      const part = Math.min(left, length) / length;
      return {
        at: { x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part },
        facing: facingAlong(from, to),
        walked,
        hasArrived,
      };
    }
    left -= length;
  }
  throw new Error("A route needs at least one point");
}

const MS_PER_SECOND = 1000;

/** How long the whole route takes at a pace given in village pixels per second. */
export function msToWalk(route: Route, pixelsPerSecond: number): number {
  if (!(pixelsPerSecond > 0)) throw new RangeError(`A walking pace must be above zero, not ${pixelsPerSecond}`);
  return (route.length / pixelsPerSecond) * MS_PER_SECOND;
}

/** Where a walker is `msIntoWalk` after setting off, at a pace given in village pixels per second. */
export function walkerAt(
  route: Route,
  msIntoWalk: number,
  pixelsPerSecond: number,
  facingWhenStill?: Facing,
): WalkerPlace {
  if (!(pixelsPerSecond > 0)) throw new RangeError(`A walking pace must be above zero, not ${pixelsPerSecond}`);
  return placeAlong(route, (Math.max(0, msIntoWalk) / MS_PER_SECOND) * pixelsPerSecond, facingWhenStill);
}

/** A walk cycle has four parts: a stride, legs passing, the other stride, legs passing. */
export const STRIDE_PARTS = 4;
export type StridePart = 0 | 1 | 2 | 3;

/**
 * Which part of the walk cycle the legs are in, from the distance walked and
 * not from the clock, so feet never slide: the legs only move when he does.
 */
export function stridePartAt(walked: number, pixelsPerPart: number): StridePart {
  return (Math.floor(Math.max(0, walked) / pixelsPerPart) % STRIDE_PARTS) as StridePart;
}
