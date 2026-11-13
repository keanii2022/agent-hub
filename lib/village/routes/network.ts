import { groundKindAt, isInsideRect, plazaLayout, type Point, type Rect } from "../plaza/layout";

// The lines walkers keep to: the middle of every path, and a way round the
// desk on the paving. Everything here is worked out from the plaza's layout,
// so a path or a lot added there is walked without a change here.

/** A straight line a walker keeps to, level or upright. */
export type Lane = { readonly name: string; readonly from: Point; readonly to: Point };

const { desk } = plazaLayout;

// A walker passing behind the desk is clear of the computer's top; one passing
// in front covers no more of it than the table's legs.
const ROWS_KEPT_BEHIND_THE_DESK = 4;
const ROWS_KEPT_IN_FRONT_OF_THE_DESK = 15;

/**
 * The way round the desk, on the paving. Its left side passes the spot where a
 * visitor reaches the human, and its right side the spot where things are put
 * on the desk.
 */
export const wayRoundTheDesk: Rect = {
  x: desk.visitorSpot.x,
  y: desk.humanAt.y - ROWS_KEPT_BEHIND_THE_DESK,
  width: desk.dropOffSpot.x - desk.visitorSpot.x + 1,
  height: desk.footY + ROWS_KEPT_IN_FRONT_OF_THE_DESK - (desk.humanAt.y - ROWS_KEPT_BEHIND_THE_DESK) + 1,
};

/** The desk and the ground right around it. Nobody walks through here. */
export const deskKeepOut: Rect = {
  x: wayRoundTheDesk.x + 1,
  y: wayRoundTheDesk.y + 1,
  width: wayRoundTheDesk.width - 2,
  height: wayRoundTheDesk.height - 2,
};

function sidesOf(rect: Rect, name: string): Lane[] {
  const right = rect.x + rect.width - 1;
  const bottom = rect.y + rect.height - 1;
  return [
    { name, from: { x: rect.x, y: rect.y }, to: { x: right, y: rect.y } },
    { name, from: { x: right, y: rect.y }, to: { x: right, y: bottom } },
    { name, from: { x: rect.x, y: bottom }, to: { x: right, y: bottom } },
    { name, from: { x: rect.x, y: rect.y }, to: { x: rect.x, y: bottom } },
  ];
}

export const lanes: readonly Lane[] = [
  ...plazaLayout.paths.flatMap((path) =>
    path.points.slice(1).map((to, index) => ({ name: path.name, from: path.points[index], to })),
  ),
  ...sidesOf(wayRoundTheDesk, "way round the desk"),
];

/** True where feet may be: on a path or the paving, and not where the desk stands. */
export function canBeWalkedOn(x: number, y: number): boolean {
  const kind = groundKindAt(x, y);
  return (
    x >= 0 &&
    x < plazaLayout.width &&
    y < plazaLayout.height &&
    (kind === "path" || kind === "paving") &&
    !isInsideRect(deskKeepOut, x, y)
  );
}

export function isOnLane(lane: Lane, point: Point): boolean {
  return (
    point.x >= Math.min(lane.from.x, lane.to.x) &&
    point.x <= Math.max(lane.from.x, lane.to.x) &&
    point.y >= Math.min(lane.from.y, lane.to.y) &&
    point.y <= Math.max(lane.from.y, lane.to.y)
  );
}

/** Every whole pixel on the straight line between two points that are level with or right above each other, ends included. */
export function pixelsBetween(from: Point, to: Point): Point[] {
  if (from.x !== to.x && from.y !== to.y) {
    throw new Error(`${from.x},${from.y} and ${to.x},${to.y} are neither level nor one above the other`);
  }
  const steps = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  return Array.from({ length: steps + 1 }, (_, step) => ({
    x: from.x + step * stepX,
    y: from.y + step * stepY,
  }));
}

function isClearBetween(from: Point, to: Point): boolean {
  return pixelsBetween(from, to).every(({ x, y }) => canBeWalkedOn(x, y));
}

/** The point on the lane straight across from `point`, or null when the lane does not reach that far. */
function straightAcrossOn(lane: Lane, point: Point): Point | null {
  const isLevel = lane.from.y === lane.to.y;
  const across = isLevel ? { x: point.x, y: lane.from.y } : { x: lane.from.x, y: point.y };
  return isOnLane(lane, across) ? across : null;
}

function distanceBetween(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/**
 * Where someone standing at `point` steps onto the lanes: the nearest spot on
 * a lane that is straight across walkable ground. Null when there is none.
 */
export function nearestSpotOnALane(point: Point): Point | null {
  let nearest: Point | null = null;
  for (const lane of lanes) {
    const across = straightAcrossOn(lane, point);
    if (!across || !isClearBetween(point, across)) continue;
    if (!nearest || distanceBetween(point, across) < distanceBetween(point, nearest)) nearest = across;
  }
  return nearest;
}

function crossingOf(first: Lane, second: Lane): Point | null {
  const firstIsLevel = first.from.y === first.to.y;
  const secondIsLevel = second.from.y === second.to.y;
  if (firstIsLevel === secondIsLevel) return null;
  const level = firstIsLevel ? first : second;
  const upright = firstIsLevel ? second : first;
  const crossing = { x: upright.from.x, y: level.from.y };
  return isOnLane(level, crossing) && isOnLane(upright, crossing) ? crossing : null;
}

const keyOf = (point: Point): string => `${point.x},${point.y}`;

const laneEndsAndCrossings: readonly Point[] = [
  ...lanes.flatMap((lane) => [lane.from, lane.to]),
  ...lanes.flatMap((first, index) =>
    lanes.slice(index + 1).flatMap((second) => crossingOf(first, second) ?? []),
  ),
];

type Stop = { readonly at: Point; readonly next: Map<string, number> };

/** The lanes as stops joined by clear runs, with `extraStops` added wherever they lie on a lane. */
function stopsWith(extraStops: readonly Point[]): Map<string, Stop> {
  const stops = new Map<string, Stop>();
  for (const at of [...laneEndsAndCrossings, ...extraStops]) {
    if (!stops.has(keyOf(at))) stops.set(keyOf(at), { at, next: new Map() });
  }
  for (const lane of lanes) {
    const alongLane = [...stops.values()]
      .filter((stop) => isOnLane(lane, stop.at))
      .sort((first, second) => distanceBetween(lane.from, first.at) - distanceBetween(lane.from, second.at));
    for (let index = 1; index < alongLane.length; index += 1) {
      const from = alongLane[index - 1];
      const to = alongLane[index];
      // The walk through the square runs under the desk: that stretch is not a way through.
      if (!isClearBetween(from.at, to.at)) continue;
      const length = distanceBetween(from.at, to.at);
      from.next.set(keyOf(to.at), length);
      to.next.set(keyOf(from.at), length);
    }
  }
  return stops;
}

/** The shortest way along the lanes from one spot on them to another, as the stops passed. Null when there is none. */
export function shortestWayAlongLanes(from: Point, to: Point): Point[] | null {
  const stops = stopsWith([from, to]);
  const walked = new Map<string, number>([[keyOf(from), 0]]);
  const cameFrom = new Map<string, string>();
  const settled = new Set<string>();

  for (;;) {
    let nearest: string | null = null;
    for (const [key, length] of walked) {
      if (!settled.has(key) && (nearest === null || length < (walked.get(nearest) as number))) nearest = key;
    }
    if (nearest === null) return null;
    if (nearest === keyOf(to)) break;
    settled.add(nearest);
    for (const [next, length] of (stops.get(nearest) as Stop).next) {
      const soFar = (walked.get(nearest) as number) + length;
      if (soFar < (walked.get(next) ?? Infinity)) {
        walked.set(next, soFar);
        cameFrom.set(next, nearest);
      }
    }
  }

  const way: Point[] = [];
  for (let key: string | undefined = keyOf(to); key !== undefined; key = cameFrom.get(key)) {
    way.unshift((stops.get(key) as Stop).at);
  }
  return way;
}
