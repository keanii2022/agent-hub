import { describe, expect, it } from "vitest";
import { HUMAN_HEIGHT, HUMAN_WIDTH } from "../../../lib/village/characters/human";
import { desk, groundKindAt, isInsideRect, plazaLayout, type Point, type Rect } from "../../../lib/village/plaza";
import {
  STRIDE_PARTS,
  canBeWalkedOn,
  deskKeepOut,
  isOnLane,
  lanes,
  msToWalk,
  nearestSpotOnALane,
  pixelsBetween,
  placeAlong,
  routeBetween,
  stridePartAt,
  walkerAt,
  wayRoundTheDesk,
  type Route,
} from "../../../lib/village/routes";

const doorsteps = plazaLayout.houseLots.map((lot) => lot.doorstep);
const topOfTheSquareWalk: Point = { x: plazaLayout.width / 2, y: 94 };
const bottomOfTheSquareWalk: Point = { x: plazaLayout.width / 2, y: 190 };

function everyPixelOf(route: Route): Point[] {
  if (route.points.length === 1) return [...route.points];
  return route.points.slice(1).flatMap((to, index) => pixelsBetween(route.points[index], to));
}

function stepsBetween(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function expectAWalkableRoute(route: Route, from: Point, to: Point, label: string): void {
  expect(route.points[0], label).toEqual(from);
  expect(route.points[route.points.length - 1], label).toEqual(to);
  route.points.slice(1).forEach((point, index) => {
    const before = route.points[index];
    expect(point.x === before.x || point.y === before.y, `${label}: run ${index} is level or upright`).toBe(true);
  });
  for (const { x, y } of everyPixelOf(route)) {
    expect(["path", "paving"], `${label}: ${x},${y}`).toContain(groundKindAt(x, y));
    expect(isInsideRect(deskKeepOut, x, y), `${label}: ${x},${y} is under the desk`).toBe(false);
  }
  expect(route.length, label).toBe(
    route.points.slice(1).reduce((total, point, index) => total + stepsBetween(route.points[index], point), 0),
  );
}

describe("the lanes walkers keep to", () => {
  it("lie on a path or the paving from end to end", () => {
    for (const lane of lanes) {
      for (const { x, y } of pixelsBetween(lane.from, lane.to)) {
        expect(["path", "paving"], `${lane.name}: ${x},${y}`).toContain(groundKindAt(x, y));
      }
    }
  });

  it("run down the middle of every path in the plaza", () => {
    for (const path of plazaLayout.paths) {
      path.points.forEach((point) => {
        expect(lanes.some((lane) => lane.name === path.name && isOnLane(lane, point)), path.name).toBe(true);
      });
    }
  });

  it("go round the desk: past the visitor's spot on one side and the drop-off spot on the other", () => {
    const sides = lanes.filter((lane) => lane.name === "way round the desk");
    expect(sides).toHaveLength(4);
    expect(sides.some((side) => isOnLane(side, desk.visitorSpot))).toBe(true);
    expect(sides.some((side) => isOnLane(side, desk.dropOffSpot))).toBe(true);
    expect(desk.visitorSpot.x).toBe(wayRoundTheDesk.x);
    expect(desk.dropOffSpot.x).toBe(wayRoundTheDesk.x + wayRoundTheDesk.width - 1);
  });

  it("keep everyone off the desk: the human, his chair, the table and the computer are all inside the way round", () => {
    const humanBox: Rect = { ...desk.humanAt, width: HUMAN_WIDTH, height: HUMAN_HEIGHT };
    const corners = [
      desk.chairAt,
      desk.tableAt,
      desk.stackSpot,
      desk.clipboardSpot,
      { x: desk.chairAt.x, y: desk.footY },
      ...[humanBox, desk.computerBounds].flatMap((box) => [
        { x: box.x, y: box.y },
        { x: box.x + box.width - 1, y: box.y + box.height - 1 },
      ]),
    ];
    for (const corner of corners) {
      expect(isInsideRect(deskKeepOut, corner.x, corner.y), `${corner.x},${corner.y}`).toBe(true);
      expect(canBeWalkedOn(corner.x, corner.y), `${corner.x},${corner.y}`).toBe(false);
    }
  });

  it("say grass, sky and anywhere off the screen cannot be walked on", () => {
    expect(canBeWalkedOn(20, 140)).toBe(false);
    expect(canBeWalkedOn(100, 10)).toBe(false);
    expect(canBeWalkedOn(-1, 94)).toBe(false);
    expect(canBeWalkedOn(plazaLayout.width, 94)).toBe(false);
    expect(canBeWalkedOn(100, 94)).toBe(true);
  });
});

describe("a route between two points", () => {
  it("leads from the desk to the doorstep of every lot, on paths and paving all the way", () => {
    for (const lot of plazaLayout.houseLots) {
      for (const deskSpot of [desk.visitorSpot, desk.dropOffSpot]) {
        expectAWalkableRoute(routeBetween(deskSpot, lot.doorstep), deskSpot, lot.doorstep, lot.name);
      }
    }
  });

  it("leads from any doorstep to any other, and is as long one way as the other", () => {
    for (const from of plazaLayout.houseLots) {
      for (const to of plazaLayout.houseLots) {
        const label = `${from.name} to ${to.name}`;
        const route = routeBetween(from.doorstep, to.doorstep);
        expectAWalkableRoute(route, from.doorstep, to.doorstep, label);
        expect(routeBetween(to.doorstep, from.doorstep).length, label).toBe(route.length);
      }
    }
  });

  it("takes the shortest way: along one street it is the street and the two steps to the doors", () => {
    const [farLeft, left, right, farRight] = doorsteps;
    const street = plazaLayout.paths.find((path) => path.name === "upper street")!.points[0].y;
    for (const [from, to] of [
      [left, right],
      [farLeft, farRight],
      [right, farLeft],
    ]) {
      expect(routeBetween(from, to).length).toBe(Math.abs(to.x - from.x) + 2 * (street - from.y));
    }
  });

  it("goes round the desk, never under it", () => {
    const route = routeBetween(topOfTheSquareWalk, bottomOfTheSquareWalk);
    expectAWalkableRoute(route, topOfTheSquareWalk, bottomOfTheSquareWalk, "through the square");
    expect(route.length).toBeGreaterThan(stepsBetween(topOfTheSquareWalk, bottomOfTheSquareWalk));
    expect(route.points.some((point) => point.x !== topOfTheSquareWalk.x)).toBe(true);
  });

  it("turns as few corners as it can: no point sits in the middle of a straight run", () => {
    const route = routeBetween(desk.visitorSpot, doorsteps[1]);
    for (let index = 1; index < route.points.length - 1; index += 1) {
      const [before, corner, after] = [route.points[index - 1], route.points[index], route.points[index + 1]];
      expect(before.x === corner.x && corner.x === after.x, `${corner.x},${corner.y}`).toBe(false);
      expect(before.y === corner.y && corner.y === after.y, `${corner.x},${corner.y}`).toBe(false);
    }
  });

  it("is the same route for the same two points, every time", () => {
    expect(routeBetween(desk.visitorSpot, doorsteps[5])).toEqual(routeBetween(desk.visitorSpot, doorsteps[5]));
  });

  it("is one point and no distance when it starts where it ends", () => {
    expect(routeBetween(desk.visitorSpot, desk.visitorSpot)).toEqual({ points: [desk.visitorSpot], length: 0 });
  });

  it("says so in plain words when a point cannot be walked to", () => {
    expect(nearestSpotOnALane({ x: 20, y: 140 })).toBeNull();
    expect(() => routeBetween(desk.visitorSpot, { x: 20, y: 140 })).toThrow("No path or paving leads to 20,140");
    expect(() => routeBetween(desk.humanAt, doorsteps[0])).toThrow(/No path or paving leads to/);
  });
});

describe("a walker's place along a route", () => {
  const route = routeBetween(desk.visitorSpot, doorsteps[1]);

  it("starts at the start and ends at the end", () => {
    expect(placeAlong(route, 0)).toMatchObject({ at: desk.visitorSpot, walked: 0, hasArrived: false });
    expect(placeAlong(route, route.length)).toMatchObject({ at: doorsteps[1], walked: route.length, hasArrived: true });
  });

  it("stands at the start before setting off and at the end after arriving", () => {
    expect(placeAlong(route, -30)).toEqual(placeAlong(route, 0));
    expect(placeAlong(route, route.length + 500)).toEqual(placeAlong(route, route.length));
  });

  it("moves exactly as far as he has walked, always on a path or the paving", () => {
    const STEP = 0.5;
    let before = placeAlong(route, 0);
    for (let walked = STEP; walked <= route.length; walked += STEP) {
      const now = placeAlong(route, walked);
      expect(stepsBetween(before.at, now.at), `after ${walked}`).toBeCloseTo(STEP, 6);
      expect(canBeWalkedOn(Math.round(now.at.x), Math.round(now.at.y)), `after ${walked}`).toBe(true);
      before = now;
    }
  });

  it("faces the way he is going, and at a corner the way he is about to go", () => {
    let walked = 0;
    route.points.slice(1).forEach((to, index) => {
      const from = route.points[index];
      const expected =
        to.x > from.x ? "right" : to.x < from.x ? "left" : to.y > from.y ? "down" : "up";
      const length = stepsBetween(from, to);
      expect(placeAlong(route, walked).facing, `corner ${index}`).toBe(expected);
      expect(placeAlong(route, walked + length / 2).facing, `run ${index}`).toBe(expected);
      walked += length;
    });
    expect(placeAlong(route, route.length).facing).toBe("up");
  });

  it("on a route with nowhere to go, stands still facing the way he is told", () => {
    const nowhere = routeBetween(desk.visitorSpot, desk.visitorSpot);
    expect(placeAlong(nowhere, 10, "right")).toEqual({
      at: desk.visitorSpot,
      facing: "right",
      walked: 0,
      hasArrived: true,
    });
  });

  it("is found from the time alone, at a steady pace", () => {
    const PACE = 20;
    expect(msToWalk(route, PACE)).toBe((route.length / PACE) * 1000);
    expect(walkerAt(route, 0, PACE)).toEqual(placeAlong(route, 0));
    expect(walkerAt(route, 1500, PACE)).toEqual(placeAlong(route, 30));
    expect(walkerAt(route, 1500, 2 * PACE)).toEqual(placeAlong(route, 60));
    expect(walkerAt(route, msToWalk(route, PACE), PACE).hasArrived).toBe(true);
    expect(walkerAt(route, -400, PACE)).toEqual(placeAlong(route, 0));
  });

  it("refuses a pace of nothing", () => {
    expect(() => msToWalk(route, 0)).toThrow(RangeError);
    expect(() => walkerAt(route, 100, -3)).toThrow(RangeError);
  });
});

describe("a walker's stride", () => {
  it("goes through its four parts in order as he walks, then starts again", () => {
    const parts = Array.from({ length: 2 * STRIDE_PARTS }, (_, part) => stridePartAt(part * 5, 5));
    expect(parts).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it("only moves when he does", () => {
    expect(stridePartAt(12, 5)).toBe(stridePartAt(12, 5));
    expect(stridePartAt(10, 5)).toBe(stridePartAt(14.9, 5));
    expect(stridePartAt(-8, 5)).toBe(0);
  });
});
