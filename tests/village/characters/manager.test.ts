import { describe, expect, it } from "vitest";
import { houses as houseList } from "../../../config/houses";
import { HUMAN_HEIGHT } from "../../../lib/village/characters/human";
import {
  KNOCKS_AT_A_DOOR,
  KNOCK_EVERY_MS,
  MANAGER_HEIGHT,
  MANAGER_PACE,
  MANAGER_WIDTH,
  REST_AT_THE_DESK_MS,
  WAIT_AT_A_DOOR_MS,
  describeManagersRound,
  drawManager,
  legStartsOf,
  managerDrawable,
  managerHome,
  managerPictures,
  managerPoints,
  managerRoundFor,
  managerStateAt,
  type ManagerState,
  type RoundLeg,
} from "../../../lib/village/characters/manager";
import { colourAt, createSurface, type ColourName, type Sprite, type Surface } from "../../../lib/village/engine";
import { drawVillage, housesToVisit, placeHouses, villageHouses } from "../../../lib/village/houses";
import { desk, plazaStateAt, type Point } from "../../../lib/village/plaza";
import { canBeWalkedOn } from "../../../lib/village/routes";
import { coloursIn, pixelsThatDiffer, villageAt, wholeScreen } from "../houses/helpers";

const STEP_MS = 20;

const round = managerRoundFor(villageHouses);
const legStarts = legStartsOf(round);
const occupied = housesToVisit(villageHouses);
const forSale = villageHouses.filter((house) => house.isForSale);

function everyMoment(fromMs: number, toMs: number): number[] {
  const moments: number[] = [];
  for (let timeMs = fromMs; timeMs < toMs; timeMs += STEP_MS) moments.push(timeMs);
  return moments;
}

const oneRound = everyMoment(0, round.lastsMs).map((timeMs) => managerStateAt(timeMs, villageHouses));

function startOf(doing: string): number {
  const legNumber = round.legs.findIndex((leg) => leg.doing === doing);
  if (legNumber < 0) throw new Error(`The round has no leg "${doing}"`);
  return legStarts[legNumber];
}

function legCalled(doing: string): RoundLeg {
  const leg = round.legs.find((candidate) => candidate.doing === doing);
  if (!leg) throw new Error(`The round has no leg "${doing}"`);
  return leg;
}

/** Every moment of a leg, a millisecond clear of both its ends. */
function momentsOf(doing: string): number[] {
  const start = startOf(doing);
  return everyMoment(start + 1, start + legCalled(doing).lastsMs - 1);
}

function stepsBetween(from: Point, to: Point): number {
  return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

/** What he does over a stretch of time, in order, each thing named once. */
function storyOf(states: readonly ManagerState[]): string[] {
  const story: string[] = [];
  for (const state of states) {
    if (story[story.length - 1] !== state.doing) story.push(state.doing);
  }
  return story;
}

function villageWithManagerAt(timeMs: number): Surface {
  const surface = createSurface();
  drawVillage(surface, plazaStateAt(timeMs), villageHouses, undefined, [
    managerDrawable(managerStateAt(timeMs, villageHouses)),
  ]);
  return surface;
}

describe("the manager's round", () => {
  it("is a walk, a knock and a wait for every house with a project in it, in list order, then the walk back", () => {
    expect(occupied.length).toBeGreaterThan(1);
    expect(round.legs.map((leg) => leg.doing)).toEqual([
      ...occupied.flatMap((house) => [
        `walking to ${house.name}`,
        `knocking at ${house.name}`,
        `waiting at ${house.name}`,
      ]),
      "walking back to the desk",
      "standing at the desk",
    ]);
  });

  it("is played in that order by the clock, and nothing else happens in between", () => {
    expect(storyOf(oneRound)).toEqual(round.legs.map((leg) => leg.doing));
  });

  it("visits the houses in the order of the house list", () => {
    const knockedAt = storyOf(oneRound.filter((state) => state.activity === "knocking")).map((doing) =>
      doing.replace("knocking at ", ""),
    );
    expect(knockedAt).toEqual(houseList.flatMap((entry) => ("project" in entry ? [entry.project] : [])));
  });

  it("skips the houses for sale: he never stands at their doors and never heads for them", () => {
    expect(forSale.length).toBeGreaterThan(0);
    for (const state of oneRound) {
      expect(state.atHouse?.isForSale ?? false).toBe(false);
      expect(state.headingFor?.isForSale ?? false).toBe(false);
      for (const house of forSale) {
        expect(state.at, state.doing).not.toEqual(house.doorstep);
        expect(state.doing).not.toContain(house.name);
      }
    }
  });

  it("starts at the desk and comes back to it: behind the human's chair, facing him", () => {
    expect(managerHome.at).toEqual(desk.visitorSpot);
    expect(managerStateAt(0, villageHouses).at).toEqual(desk.visitorSpot);
    const resting = managerStateAt(startOf("standing at the desk") + 1, villageHouses);
    expect(resting).toMatchObject({
      activity: "at the desk",
      at: desk.visitorSpot,
      facing: "right",
      atHouse: null,
      headingFor: null,
      stride: null,
    });
    expect(legCalled("standing at the desk").lastsMs).toBe(REST_AT_THE_DESK_MS);
  });

  it("gives the same state for the same time, every time", () => {
    for (const timeMs of [0, 1, 4200, 9000, 15000, 99999]) {
      expect(managerStateAt(timeMs, villageHouses)).toEqual(managerStateAt(timeMs, villageHouses));
    }
  });

  it("repeats: every round is the same as the first, and he counts the rounds", () => {
    for (const timeMs of [100, 4200, 7000, 12000, 20000, round.lastsMs - 500]) {
      const first = managerStateAt(timeMs, villageHouses);
      const later = managerStateAt(timeMs + 3 * round.lastsMs, villageHouses);
      expect(first.roundsDone).toBe(0);
      expect(later.roundsDone).toBe(3);
      expect(later.doing).toBe(first.doing);
      expect(later.legNumber).toBe(first.legNumber);
      expect(later.facing).toBe(first.facing);
      expect(stepsBetween(later.at, first.at)).toBeLessThan(0.001);
    }
  });

  it("treats a time before the start as the start", () => {
    expect(managerStateAt(-500, villageHouses)).toEqual(managerStateAt(0, villageHouses));
  });

  it("depends on nothing but the time and the houses: a list placed again gives the same round", () => {
    const placedAgain = placeHouses(houseList);
    for (const timeMs of [0, 4200, 9000, 21000]) {
      expect(managerStateAt(timeMs, placedAgain)).toEqual(managerStateAt(timeMs, villageHouses));
    }
  });

  it("with no house to call on, he stays at the desk", () => {
    const nobodyHome = placeHouses(houseList.filter((entry) => "forSale" in entry));
    for (const timeMs of [0, 3000, 50000]) {
      expect(managerStateAt(timeMs, nobodyHome)).toMatchObject({
        activity: "at the desk",
        doing: "standing at the desk",
        at: desk.visitorSpot,
      });
    }
  });
});

describe("the manager walking", () => {
  it("keeps to the paths and the paving for the whole round, and never walks through the desk", () => {
    for (const state of oneRound) {
      expect(canBeWalkedOn(Math.round(state.at.x), Math.round(state.at.y)), `${state.doing} at ${state.at.x},${state.at.y}`).toBe(true);
    }
  });

  it("never jumps: he moves at his own pace or stands still, round after round", () => {
    const furthestInOneStep = (MANAGER_PACE * STEP_MS) / 1000 + 0.001;
    const twoRounds = everyMoment(0, 2 * round.lastsMs).map((timeMs) => managerStateAt(timeMs, villageHouses));
    twoRounds.slice(1).forEach((state, index) => {
      const moved = stepsBetween(twoRounds[index].at, state.at);
      expect(moved, state.doing).toBeLessThanOrEqual(furthestInOneStep);
      if (state.activity !== "walking" && twoRounds[index].activity !== "walking") expect(moved).toBe(0);
    });
  });

  it("walks at one steady pace", () => {
    const start = startOf("walking to approval-desk");
    const first = managerStateAt(start + 1000, villageHouses);
    const second = managerStateAt(start + 2000, villageHouses);
    expect(stepsBetween(first.at, second.at)).toBeCloseTo(MANAGER_PACE, 6);
  });

  it("says which house he is heading for, and that he is at none", () => {
    for (const state of oneRound.filter((candidate) => candidate.activity === "walking")) {
      expect(state.atHouse).toBeNull();
      expect(state.stride).not.toBeNull();
      if (state.doing === "walking back to the desk") expect(state.headingFor).toBeNull();
      else expect(state.doing).toBe(`walking to ${state.headingFor!.name}`);
    }
  });

  it("faces the way he walks", () => {
    const walking = oneRound.filter((state) => state.activity === "walking");
    walking.slice(1).forEach((state, index) => {
      const before = walking[index];
      if (before.legNumber !== state.legNumber || before.facing !== state.facing) return;
      const across = state.at.x - before.at.x;
      const down = state.at.y - before.at.y;
      if (state.facing === "left") expect(across).toBeLessThan(0);
      if (state.facing === "right") expect(across).toBeGreaterThan(0);
      if (state.facing === "up") expect(down).toBeLessThan(0);
      if (state.facing === "down") expect(down).toBeGreaterThan(0);
    });
    expect(new Set(walking.map((state) => state.facing))).toEqual(new Set(["left", "right", "up", "down"]));
  });

  it("moves his legs only as he moves: every part of the stride shows on a walk", () => {
    const walking = oneRound.filter((state) => state.doing === "walking to approval-desk");
    expect(new Set(walking.map((state) => state.stride))).toEqual(new Set([0, 1, 2, 3]));
    for (const state of oneRound.filter((candidate) => candidate.activity !== "walking")) {
      expect(state.stride).toBeNull();
    }
  });
});

describe("the manager at a door", () => {
  it("stands on the doorstep facing the door, and says whose door it is", () => {
    for (const house of occupied) {
      for (const doing of [`knocking at ${house.name}`, `waiting at ${house.name}`]) {
        for (const timeMs of momentsOf(doing)) {
          const state = managerStateAt(timeMs, villageHouses);
          expect(state.doing).toBe(doing);
          expect(state.at).toEqual(house.doorstep);
          expect(state.facing).toBe("up");
          expect(state.atHouse).toBe(house);
          expect(state.headingFor).toBeNull();
        }
      }
    }
  });

  it("knocks three times, his knuckles landing at the height of the door's knock spot", () => {
    expect(KNOCKS_AT_A_DOOR).toBe(3);
    for (const house of occupied) {
      expect(legCalled(`knocking at ${house.name}`).lastsMs).toBe(KNOCKS_AT_A_DOOR * KNOCK_EVERY_MS);
      const knocking = momentsOf(`knocking at ${house.name}`).map((timeMs) => managerStateAt(timeMs, villageHouses));
      const landings = knocking.filter((state, index) => state.knucklesOnDoor && !knocking[index - 1]?.knucklesOnDoor);
      expect(landings, house.name).toHaveLength(KNOCKS_AT_A_DOOR);
      expect(knocking.some((state) => !state.knucklesOnDoor), house.name).toBe(true);
      expect(house.doorstep.y - managerPoints.feet.y + managerPoints.knuckles.y, house.name).toBe(house.knockSpot.y);
    }
  });

  it("knocks first, then waits, and keeps his hand down while he waits", () => {
    for (const house of occupied) {
      const knock = legCalled(`knocking at ${house.name}`);
      expect(startOf(`waiting at ${house.name}`)).toBe(startOf(`knocking at ${house.name}`) + knock.lastsMs);
      expect(legCalled(`waiting at ${house.name}`).lastsMs).toBe(WAIT_AT_A_DOOR_MS);
      for (const timeMs of momentsOf(`waiting at ${house.name}`)) {
        const state = managerStateAt(timeMs, villageHouses);
        expect(state.activity).toBe("waiting");
        expect(state.knucklesOnDoor).toBe(false);
      }
    }
  });

  it("moves on after the wait: to the next house, or back to the desk after the last", () => {
    const story = storyOf(oneRound);
    occupied.forEach((house, index) => {
      const next = occupied[index + 1];
      expect(story[story.indexOf(`waiting at ${house.name}`) + 1]).toBe(
        next ? `walking to ${next.name}` : "walking back to the desk",
      );
    });
  });
});

describe("the round in plain words", () => {
  it("names the houses he calls at, in order, and none that are for sale", () => {
    const words = describeManagersRound(villageHouses);
    const [first, ...rest] = occupied.map((house) => house.name);
    const last = rest.pop();
    expect(words).toBe(
      `The manager walks his round from the desk: he knocks at ${[first, ...rest].join(", then ")} and then ${last}, waits at each door, and walks back.`,
    );
    expect(words).not.toMatch(/for sale/i);
  });

  it("copes with one house and with none", () => {
    expect(describeManagersRound(occupied.slice(0, 1))).toBe(
      `The manager walks his round from the desk: he knocks at ${occupied[0].name}, waits at each door, and walks back.`,
    );
    expect(describeManagersRound(forSale)).toBe("The manager waits at the desk: no house has anyone to call on.");
  });

  it("H12: nothing he is said to be doing is a rule code", () => {
    const everythingSaid = [...round.legs.map((leg) => leg.doing), describeManagersRound(villageHouses)];
    for (const words of everythingSaid) expect(words).not.toMatch(/\b[HQ]\d{1,2}\b/);
  });
});

function paintedPixels(sprite: Sprite): Point[] {
  const painted: Point[] = [];
  sprite.pixels.forEach((colour, index) => {
    if (colour) painted.push({ x: index % sprite.width, y: Math.floor(index / sprite.width) });
  });
  return painted;
}

function coloursOf(sprite: Sprite): Set<ColourName> {
  return new Set(sprite.pixels.filter((colour): colour is ColourName => colour !== null));
}

const everyPicture: readonly (readonly [string, Sprite])[] = [
  ...Object.entries(managerPictures.standing).map(([view, sprite]) => [`standing, ${view}`, sprite] as const),
  ...Object.entries(managerPictures.walking).flatMap(([view, parts]) =>
    Object.entries(parts).map(([part, sprite]) => [`walking, ${view}, part ${part}`, sprite] as const),
  ),
  ...Object.entries(managerPictures.knocking).map(([hand, sprite]) => [`knocking, ${hand}`, sprite] as const),
];

function standingStill(overrides: Partial<ManagerState>): ManagerState {
  return {
    activity: "at the desk",
    doing: "standing at the desk",
    at: { x: 20, y: 30 },
    facing: "right",
    atHouse: null,
    headingFor: null,
    stride: null,
    knucklesOnDoor: false,
    legNumber: 0,
    roundsDone: 0,
    ...overrides,
  };
}

function pictureOfManager(state: ManagerState): Surface {
  const surface = createSurface(40, 40);
  drawManager(surface, state);
  return surface;
}

describe("the picture of the manager", () => {
  it("fills his box from his hat to the ground in every pose", () => {
    for (const [name, sprite] of everyPicture) {
      expect([sprite.width, sprite.height], name).toEqual([MANAGER_WIDTH, MANAGER_HEIGHT]);
      const rows = paintedPixels(sprite).map((pixel) => pixel.y);
      expect(Math.min(...rows), name).toBeLessThanOrEqual(1);
      expect(Math.max(...rows), name).toBe(MANAGER_HEIGHT - 1);
    }
  });

  it("stands a little taller than the seated human", () => {
    expect(MANAGER_HEIGHT).toBeGreaterThan(HUMAN_HEIGHT);
  });

  it("looks nothing like the human: a hat with a red band, a grey suit, and none of the human's teal", () => {
    for (const [name, sprite] of everyPicture) {
      const colours = coloursOf(sprite);
      expect(colours, name).toContain("ember");
      expect(colours, name).toContain("mist");
      expect(colours, name).toContain("night");
      expect(colours.has("teal"), name).toBe(false);
    }
    for (const [name, sprite] of Object.entries(managerPictures.standing)) {
      const band = sprite.pixels[managerPoints.hatBand.y * sprite.width + managerPoints.hatBand.x];
      expect(band, name).toBe("ember");
    }
  });

  it("shows a different picture for every view, and for every part of a stride in turn", () => {
    const { standing, walking, knocking } = managerPictures;
    expect(standing.side.pixels).not.toEqual(standing.down.pixels);
    expect(standing.down.pixels).not.toEqual(standing.up.pixels);
    expect(knocking.knucklesOnDoor.pixels).not.toEqual(knocking.handDrawnBack.pixels);
    expect(knocking.handDrawnBack.pixels).not.toEqual(standing.up.pixels);
    for (const [view, parts] of Object.entries(walking)) {
      for (const part of [0, 1, 2, 3] as const) {
        expect(parts[part].pixels, `${view}, part ${part}`).not.toEqual(parts[((part + 1) % 4) as 0 | 1 | 2 | 3].pixels);
      }
    }
  });

  it("is drawn with the middle of his feet on the spot he stands at, rounded to whole pixels", () => {
    const surface = pictureOfManager(standingStill({ at: { x: 20.4, y: 29.6 } }));
    const painted: Point[] = [];
    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) if (colourAt(surface, x, y) !== null) painted.push({ x, y });
    }
    expect(Math.max(...painted.map((pixel) => pixel.y))).toBe(30);
    expect(Math.min(...painted.map((pixel) => pixel.y))).toBe(30 - MANAGER_HEIGHT + 1);
    const shoes = painted.filter((pixel) => pixel.y === 30).map((pixel) => pixel.x);
    expect(Math.min(...shoes)).toBeLessThanOrEqual(20);
    expect(Math.max(...shoes)).toBeGreaterThanOrEqual(20);
  });

  it("is mirrored when he faces left", () => {
    const right = pictureOfManager(standingStill({ facing: "right" }));
    const left = pictureOfManager(standingStill({ facing: "left" }));
    const boxLeft = 20 - managerPoints.feet.x;
    for (let y = 0; y < right.height; y += 1) {
      for (let column = 0; column < MANAGER_WIDTH; column += 1) {
        expect(colourAt(left, boxLeft + MANAGER_WIDTH - 1 - column, y), `${column},${y}`).toBe(
          colourAt(right, boxLeft + column, y),
        );
      }
    }
  });

  it("raises his hand to the door when knocking, with knuckles where the state says", () => {
    const onDoor = pictureOfManager(standingStill({ activity: "knocking", facing: "up", knucklesOnDoor: true }));
    const drawnBack = pictureOfManager(standingStill({ activity: "knocking", facing: "up", knucklesOnDoor: false }));
    const knuckles = {
      x: 20 - managerPoints.feet.x + managerPoints.knuckles.x,
      y: 30 - managerPoints.feet.y + managerPoints.knuckles.y,
    };
    expect(colourAt(onDoor, knuckles.x, knuckles.y)).toBe("peach");
    expect(colourAt(drawnBack, knuckles.x, knuckles.y)).not.toBe("peach");
    expect(colourAt(drawnBack, knuckles.x, knuckles.y + 1)).toBe("peach");
  });
});

describe("the manager in the village", () => {
  const withoutHim = (timeMs: number): Surface => villageAt(timeMs, villageHouses);

  it("appears where his state says, and changes nothing anywhere else", () => {
    const moments = [
      4200,
      startOf("knocking at approval-desk") + 10,
      startOf(`waiting at ${occupied[1].name}`) + 100,
      startOf("standing at the desk") + 100,
    ];
    for (const timeMs of moments) {
      const state = managerStateAt(timeMs, villageHouses);
      const feet = { x: Math.round(state.at.x), y: Math.round(state.at.y) };
      const box = {
        x: feet.x - managerPoints.feet.x,
        y: feet.y - managerPoints.feet.y,
        width: MANAGER_WIDTH,
        height: MANAGER_HEIGHT,
      };
      const changed = pixelsThatDiffer(villageWithManagerAt(timeMs), withoutHim(timeMs));
      expect(changed.length, state.doing).toBeGreaterThan(100);
      for (const { x, y } of changed) {
        expect(
          x >= box.x && y >= box.y && x < box.x + box.width && y < box.y + box.height,
          `${state.doing}: ${x},${y}`,
        ).toBe(true);
      }
    }
  });

  it("stands in front of the house whose door he knocks at: the house covers none of him", () => {
    for (const house of occupied) {
      const timeMs = startOf(`waiting at ${house.name}`) + 100;
      const state = managerStateAt(timeMs, villageHouses);
      expect(managerDrawable(state).footY, house.name).toBeGreaterThan(house.footY);

      const alone = createSurface();
      drawManager(alone, state);
      const village = villageWithManagerAt(timeMs);
      // A street lamp may stand nearer than he does and shine across his shoes, so his shins are left out.
      const hatToKnees = { ...wholeScreen, height: house.doorstep.y - 6 };
      const ofHim = pixelsThatDiffer(alone, createSurface(), hatToKnees);
      expect(ofHim.length, house.name).toBeGreaterThan(150);
      for (const { x, y } of ofHim) {
        expect(colourAt(village, x, y), `${house.name}: ${x},${y}`).toBe(colourAt(alone, x, y));
      }
    }
  });

  it("stands behind the desk when he is at it: the desk is never drawn over by him", () => {
    const timeMs = startOf("standing at the desk") + 100;
    const village = villageWithManagerAt(timeMs);
    const bare = withoutHim(timeMs);
    expect(managerDrawable(managerStateAt(timeMs, villageHouses)).footY).toBeLessThan(desk.footY);
    expect(coloursIn(village, { x: desk.visitorSpot.x - 4, y: desk.visitorSpot.y - 24, width: 9, height: 6 })).toContain(
      "ember",
    );
    const chairAndHuman = { x: desk.chairAt.x, y: desk.humanAt.y, width: 20, height: 26 };
    expect(pixelsThatDiffer(village, bare, chairAndHuman)).toEqual([]);
  });

  it("moves across the picture as the clock runs", () => {
    const first = villageWithManagerAt(4200);
    const later = villageWithManagerAt(5200);
    const whereHeWas = managerStateAt(4200, villageHouses).at;
    const around = { x: Math.round(whereHeWas.x) - 30, y: Math.round(whereHeWas.y) - 26, width: 60, height: 28 };
    expect(pixelsThatDiffer(first, later, around).length).toBeGreaterThan(50);
  });
});
