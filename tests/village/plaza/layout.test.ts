import { describe, expect, it } from "vitest";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../../../lib/village/engine";
import {
  HORIZON_Y,
  desk,
  groundKindAt,
  isInsideRect,
  liesFlat,
  pathJoins,
  plazaLayout,
  type Point,
  type Rect,
} from "../../../lib/village/plaza";

function overlap(first: Rect, second: Rect): boolean {
  return (
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height
  );
}

function isOnScreen(point: Point): boolean {
  return point.x >= 0 && point.y >= 0 && point.x < SCREEN_WIDTH && point.y < SCREEN_HEIGHT;
}

const squareBox: Rect = {
  x: plazaLayout.square.centre.x - plazaLayout.square.radiusX,
  y: plazaLayout.square.centre.y - plazaLayout.square.radiusY,
  width: 2 * plazaLayout.square.radiusX,
  height: 2 * plazaLayout.square.radiusY,
};

/** Every pixel a walker can reach from `start` without stepping on grass. */
function walkableFrom(start: Point): Set<string> {
  const keyOf = (x: number, y: number): string => `${x},${y}`;
  const canWalk = (x: number, y: number): boolean => {
    const kind = groundKindAt(x, y);
    return isOnScreen({ x, y }) && (kind === "path" || kind === "paving");
  };
  const reached = new Set<string>();
  const toVisit: Point[] = canWalk(start.x, start.y) ? [start] : [];
  while (toVisit.length > 0) {
    const { x, y } = toVisit.pop() as Point;
    if (reached.has(keyOf(x, y))) continue;
    reached.add(keyOf(x, y));
    for (const [nextX, nextY] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (canWalk(nextX, nextY) && !reached.has(keyOf(nextX, nextY))) {
        toVisit.push({ x: nextX, y: nextY });
      }
    }
  }
  return reached;
}

const walkableFromVisitorSpot = walkableFrom(desk.visitorSpot);

function canBeWalkedTo(point: Point): boolean {
  return walkableFromVisitorSpot.has(`${point.x},${point.y}`);
}

const everythingStanding: { name: string; at: Point }[] = [
  ...plazaLayout.trees.map((tree) => ({ name: tree.kind, at: tree.at })),
  ...plazaLayout.lampPosts.map((at) => ({ name: "lamp post", at })),
  ...plazaLayout.clutter
    .filter((piece) => !liesFlat(piece.kind))
    .map((piece) => ({ name: piece.kind, at: piece.at })),
];

describe("the ground", () => {
  it("is sky above the horizon and ground below it", () => {
    expect(groundKindAt(10, HORIZON_Y - 1)).toBe("sky");
    expect(groundKindAt(10, HORIZON_Y)).not.toBe("sky");
  });

  it("is paved in the square, a path on every path, and grass elsewhere", () => {
    expect(groundKindAt(plazaLayout.square.centre.x, plazaLayout.square.centre.y)).toBe("paving");
    for (const path of plazaLayout.paths) {
      const middleOfFirstRun = {
        x: Math.round((path.points[0].x + path.points[1].x) / 2),
        y: Math.round((path.points[0].y + path.points[1].y) / 2),
      };
      expect(groundKindAt(middleOfFirstRun.x, middleOfFirstRun.y), path.name).not.toBe("grass");
    }
    expect(groundKindAt(20, 150)).toBe("grass");
  });

  it("has paths made only of level and upright runs", () => {
    for (const path of plazaLayout.paths) {
      expect(path.points.length, path.name).toBeGreaterThanOrEqual(2);
      for (let index = 1; index < path.points.length; index += 1) {
        const from = path.points[index - 1];
        const to = path.points[index];
        expect(from.x === to.x || from.y === to.y, path.name).toBe(true);
      }
    }
  });
});

describe("the desk", () => {
  it("sits in the middle of the screen, in the middle of the square", () => {
    const deskMiddle = {
      x: (desk.chairAt.x + desk.dropOffSpot.x) / 2,
      y: (desk.humanAt.y + desk.footY) / 2,
    };
    expect(Math.abs(deskMiddle.x - SCREEN_WIDTH / 2)).toBeLessThanOrEqual(8);
    expect(Math.abs(deskMiddle.x - plazaLayout.square.centre.x)).toBeLessThanOrEqual(8);
    expect(Math.abs(deskMiddle.y - plazaLayout.square.centre.y)).toBeLessThanOrEqual(8);
  });

  it("stands on the paving, with the spots around it on paving too", () => {
    for (const spot of [desk.visitorSpot, desk.dropOffSpot, { x: desk.tableAt.x, y: desk.footY }]) {
      expect(groundKindAt(spot.x, spot.y)).toBe("paving");
    }
  });

  it("puts a visitor behind the human, within reach of his shoulder", () => {
    expect(desk.visitorSpot.x).toBeLessThan(desk.shoulderSpot.x);
    expect(desk.shoulderSpot.x - desk.visitorSpot.x).toBeLessThanOrEqual(16);
    expect(desk.shoulderSpot.y).toBeLessThan(desk.visitorSpot.y);
  });

  it("keeps the stack, the clipboard and the computer apart on the table top", () => {
    const tableTop: Rect = { x: desk.tableAt.x, y: desk.tableAt.y, width: 41, height: 9 };
    expect(isInsideRect(tableTop, desk.stackSpot.x, desk.stackSpot.y)).toBe(true);
    expect(isInsideRect(tableTop, desk.clipboardSpot.x, desk.clipboardSpot.y)).toBe(true);
    expect(isInsideRect(desk.computerBounds, desk.stackSpot.x, desk.stackSpot.y)).toBe(false);
    expect(desk.stackSpot.x).toBeGreaterThan(desk.computerBounds.x + desk.computerBounds.width);
  });

  it("floats the mark above the computer, on the screen", () => {
    expect(desk.markSpot.y).toBeLessThan(desk.computerAt.y);
    expect(desk.markSpot.x).toBeGreaterThan(desk.computerAt.x);
    expect(desk.markSpot.x).toBeLessThan(desk.computerAt.x + 16);
    expect(isOnScreen({ x: desk.markSpot.x, y: desk.markSpot.y - 12 })).toBe(true);
  });

  it("has the computer's glass inside the area a click reaches", () => {
    const glass = desk.computerGlass;
    expect(isInsideRect(desk.computerBounds, glass.x, glass.y)).toBe(true);
    expect(
      isInsideRect(desk.computerBounds, glass.x + glass.width - 1, glass.y + glass.height - 1),
    ).toBe(true);
  });
});

describe("room for houses", () => {
  it("keeps six lots clear around the edges, each on the screen", () => {
    expect(plazaLayout.houseLots).toHaveLength(6);
    for (const lot of plazaLayout.houseLots) {
      expect(isOnScreen(lot.area), lot.name).toBe(true);
      expect(
        isOnScreen({ x: lot.area.x + lot.area.width - 1, y: lot.area.y + lot.area.height - 1 }),
        lot.name,
      ).toBe(true);
    }
  });

  it("keeps the lots apart from each other and from the square", () => {
    plazaLayout.houseLots.forEach((lot, index) => {
      expect(overlap(lot.area, squareBox), lot.name).toBe(false);
      for (const other of plazaLayout.houseLots.slice(index + 1)) {
        expect(overlap(lot.area, other.area), `${lot.name} and ${other.name}`).toBe(false);
      }
    });
  });

  it("plants nothing tall inside a lot", () => {
    for (const lot of plazaLayout.houseLots) {
      for (const thing of everythingStanding) {
        expect(isInsideRect(lot.area, thing.at.x, thing.at.y), `${thing.name} in ${lot.name}`).toBe(
          false,
        );
      }
    }
  });

  it("lays no path or paving through a lot", () => {
    // A lot on the upper street reaches past the horizon: a house there stands against the sky.
    for (const lot of plazaLayout.houseLots) {
      for (let y = lot.area.y; y < lot.area.y + lot.area.height; y += 1) {
        for (let x = lot.area.x; x < lot.area.x + lot.area.width; x += 1) {
          expect(["grass", "sky"], `${lot.name} at ${x},${y}`).toContain(groundKindAt(x, y));
        }
      }
    }
  });

  it("gives every lot a doorstep on a path, right below the lot", () => {
    for (const lot of plazaLayout.houseLots) {
      expect(groundKindAt(lot.doorstep.x, lot.doorstep.y), lot.name).toBe("path");
      expect(lot.doorstep.y, lot.name).toBe(lot.area.y + lot.area.height);
      expect(lot.doorstep.x, lot.name).toBe(lot.area.x + lot.area.width / 2);
    }
  });
});

describe("walking to the desk", () => {
  it("is possible from every doorstep without stepping on grass", () => {
    for (const lot of plazaLayout.houseLots) {
      expect(canBeWalkedTo(lot.doorstep), lot.name).toBe(true);
    }
  });

  it("is possible from every place a new path may join", () => {
    expect(pathJoins.length).toBeGreaterThanOrEqual(plazaLayout.houseLots.length);
    for (const join of pathJoins) {
      expect(canBeWalkedTo(join), `${join.x},${join.y}`).toBe(true);
    }
  });

  it("reaches the drop-off spot at the far end of the desk too", () => {
    expect(canBeWalkedTo(desk.dropOffSpot)).toBe(true);
  });

  it("is not blocked by a tree, a lamp post or a robot arm standing on a path", () => {
    for (const thing of everythingStanding) {
      expect(groundKindAt(thing.at.x, thing.at.y), thing.name).not.toBe("path");
    }
  });
});

describe("what is planted", () => {
  it("is all on the screen side to side, and on the ground", () => {
    const planted = [
      ...plazaLayout.trees,
      ...plazaLayout.plants,
      ...plazaLayout.clutter,
      ...plazaLayout.lampPosts.map((at) => ({ at })),
    ];
    for (const thing of planted) {
      expect(thing.at.x).toBeGreaterThanOrEqual(0);
      expect(thing.at.x).toBeLessThan(SCREEN_WIDTH);
      expect(thing.at.y).toBeGreaterThan(HORIZON_Y);
    }
  });

  it("includes the clutter the plaza is known for: broken robot arms and cigarette butts", () => {
    const kinds = plazaLayout.clutter.map((piece) => piece.kind);
    expect(kinds.filter((kind) => kind.startsWith("robot arm")).length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter(liesFlat).length).toBeGreaterThanOrEqual(5);
  });

  it("has trees and plants, and keeps trees off the paving", () => {
    expect(plazaLayout.trees.length).toBeGreaterThanOrEqual(4);
    expect(plazaLayout.plants.length).toBeGreaterThanOrEqual(8);
    for (const tree of plazaLayout.trees.filter((candidate) => isOnScreen(candidate.at))) {
      expect(groundKindAt(tree.at.x, tree.at.y), tree.kind).toBe("grass");
    }
  });
});
