import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import {
  describeManagersRound,
  managerRoundFor,
  managerStateAt,
  type ManagerState,
} from "../../../lib/village/characters/manager";
import { isForSale, placeHouses, villageHouses, type HouseEntry, type PlacedHouse } from "../../../lib/village/houses";
import { desk, plazaLayout } from "../../../lib/village/plaza";
import { canBeWalkedOn } from "../../../lib/village/routes";

// The whole of "adding a house": one more entry in the list. Nothing in this
// file reaches into how the round is built; it hands the longer list to the
// same two calls the home page makes, `placeHouses` and `managerStateAt`.
const newEntry: HouseEntry = {
  project: "pixel-bakery",
  lot: "far left of the upper street",
  build: "plaster cottage",
  sign: "pink star",
  props: ["cardboard box"],
  data: "demo",
};

const STEP_MS = 20;

function oneRoundOf(placed: readonly PlacedHouse[]): ManagerState[] {
  const states: ManagerState[] = [];
  for (let timeMs = 0; timeMs < managerRoundFor(placed).lastsMs; timeMs += STEP_MS) {
    states.push(managerStateAt(timeMs, placed));
  }
  return states;
}

function storyOf(states: readonly ManagerState[]): string[] {
  const story: string[] = [];
  for (const state of states) {
    if (story[story.length - 1] !== state.doing) story.push(state.doing);
  }
  return story;
}

function doorsKnockedAt(states: readonly ManagerState[]): string[] {
  return storyOf(states.filter((state) => state.activity === "knocking")).map((doing) =>
    doing.replace("knocking at ", ""),
  );
}

function expectAWholeRound(states: readonly ManagerState[], label: string): void {
  for (const state of states) {
    expect(
      canBeWalkedOn(Math.round(state.at.x), Math.round(state.at.y)),
      `${label}: ${state.doing} at ${state.at.x},${state.at.y}`,
    ).toBe(true);
  }
  expect(states[0].at, label).toEqual(desk.visitorSpot);
  expect(states[states.length - 1], label).toMatchObject({ activity: "at the desk", at: desk.visitorSpot });
}

const before = oneRoundOf(villageHouses);
const withNewHouse = placeHouses([...houses, newEntry]);
const newHouse = withNewHouse[withNewHouse.length - 1];
const after = oneRoundOf(withNewHouse);

describe("a new house joins the manager's round by adding one entry to the list", () => {
  it("is called at last, after the houses that were already on the round", () => {
    expect(doorsKnockedAt(after)).toEqual([...doorsKnockedAt(before), "pixel-bakery"]);
  });

  it("gets the whole call: the walk to it, the knock, the wait, and then the walk back to the desk", () => {
    const oldStory = storyOf(before);
    expect(storyOf(after)).toEqual([
      ...oldStory.slice(0, oldStory.indexOf("walking back to the desk")),
      "walking to pixel-bakery",
      "knocking at pixel-bakery",
      "waiting at pixel-bakery",
      "walking back to the desk",
      "standing at the desk",
    ]);
  });

  it("is really reached: he stands on its doorstep, facing its door, and says it is this house", () => {
    const atItsDoor = after.filter((state) => state.atHouse === newHouse);
    expect(atItsDoor.length).toBeGreaterThan(0);
    for (const state of atItsDoor) {
      expect(state.at).toEqual(newHouse.doorstep);
      expect(state.facing).toBe("up");
      expect(["knocking", "waiting"]).toContain(state.activity);
    }
    expect(after.some((state) => state.headingFor === newHouse)).toBe(true);
    expect(before.some((state) => state.at.x === newHouse.doorstep.x && state.at.y === newHouse.doorstep.y)).toBe(false);
  });

  it("is walked to on paths and paving alone, and he still comes home to the desk", () => {
    expectAWholeRound(after, "with pixel-bakery");
  });

  it("leaves the round up to it exactly as it was, and makes the whole round longer", () => {
    const untilTheOldLastDoor = before.findIndex((state) => state.doing === "walking back to the desk");
    expect(after.slice(0, untilTheOldLastDoor)).toEqual(before.slice(0, untilTheOldLastDoor));
    expect(managerRoundFor(withNewHouse).lastsMs).toBeGreaterThan(managerRoundFor(villageHouses).lastsMs);
  });

  it("is named in the round's plain words", () => {
    expect(describeManagersRound(villageHouses)).not.toContain("pixel-bakery");
    expect(describeManagersRound(withNewHouse)).toContain("and then pixel-bakery");
  });

  it("joins wherever it is put in the list: the round follows the list's order", () => {
    const placed = placeHouses([houses[0], newEntry, ...houses.slice(1)]);
    const [first, ...others] = doorsKnockedAt(before);
    expect(doorsKnockedAt(oneRoundOf(placed))).toEqual([first, "pixel-bakery", ...others]);
  });

  it("joins on any free lot, the lower street's too, where the way leads round the desk", () => {
    const taken = new Set(houses.map((entry) => entry.lot));
    const freeLots = plazaLayout.houseLots.filter((lot) => !taken.has(lot.name));
    const lotsForSale = houses.filter(isForSale).map((entry) => entry.lot);
    expect(freeLots.length).toBeGreaterThan(0);
    expect(lotsForSale.some((lot) => lot.includes("lower street"))).toBe(true);

    for (const lot of freeLots.map((free) => free.name)) {
      const placed = placeHouses([...houses, { ...newEntry, lot }]);
      const states = oneRoundOf(placed);
      expect(doorsKnockedAt(states), lot).toEqual([...doorsKnockedAt(before), "pixel-bakery"]);
      expectAWholeRound(states, lot);
    }
    // A project moving into a house that stood for sale is one changed entry, and is called at in its place in the list.
    for (const lot of lotsForSale) {
      const placed = placeHouses(houses.map((entry) => (entry.lot === lot ? { ...newEntry, lot } : entry)));
      const states = oneRoundOf(placed);
      expect(doorsKnockedAt(states), lot).toEqual(placed.flatMap((house) => (house.isForSale ? [] : [house.name])));
      expect(doorsKnockedAt(states), lot).toContain("pixel-bakery");
      expectAWholeRound(states, lot);
    }
  });

  it("is not called at when the new house is for sale: the round stays exactly as it was", () => {
    const placed = placeHouses([...houses, { forSale: true, lot: "far right of the upper street" }]);
    expect(oneRoundOf(placed)).toEqual(before);
  });
});
