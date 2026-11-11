import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import {
  DEMO_TAG,
  defaultHouseStatus,
  describeHouses,
  glassOfWindow,
  housesToVisit,
  placeHouses,
  signStyles,
  villageHouses,
  type HouseEntry,
} from "../../../lib/village/houses";
import { groundKindAt, plazaLayout, type Rect } from "../../../lib/village/plaza";
import {
  SCREENSHOT_MS,
  canBeWalkedToFromTheDesk,
  coloursIn,
  contains,
  findWords,
  grownBy,
  overlap,
  pixelsThatDiffer,
  villageAt,
  wholeScreen,
} from "./helpers";

// The whole of "adding a house": one more entry in the list. Nothing else in
// this file reaches into how houses are placed or drawn; it only hands the
// longer list to the same two calls the home page makes.
const fifthEntry: HouseEntry = {
  project: "pixel-bakery",
  lot: "far left of the upper street",
  build: "plaster cottage",
  sign: "pink star",
  props: ["cardboard box"],
  data: "demo",
};

const fiveHouses = placeHouses([...houses, fifthEntry]);
const fifth = fiveHouses[4];
const withFour = villageAt(SCREENSHOT_MS, villageHouses);
const withFive = villageAt(SCREENSHOT_MS, fiveHouses);

describe("adding a fifth house by adding one entry to the list", () => {
  it("leaves the first four houses exactly where and as they were", () => {
    expect(fiveHouses).toHaveLength(5);
    expect(fiveHouses.slice(0, 4)).toEqual(villageHouses);
  });

  it("places it: on the lot the entry names, clear of every other house, on the screen", () => {
    expect(fifth.listOrder).toBe(4);
    expect(fifth.project).toBe("pixel-bakery");
    expect(fifth.isForSale).toBe(false);
    expect(fifth.lot).toBe(plazaLayout.houseLots.find((lot) => lot.name === "far left of the upper street"));
    expect(contains(fifth.lot.area, { ...fifth.body, height: 1 })).toBe(true);
    expect(contains(wholeScreen, fifth.clickBounds)).toBe(true);
    expect(contains(wholeScreen, fifth.sign!.bounds)).toBe(true);
    for (const other of fiveHouses.slice(0, 4)) {
      expect(overlap(fifth.clickBounds, other.clickBounds), other.name).toBe(false);
      if (other.sign) expect(overlap(fifth.sign!.bounds, other.sign.bounds), other.name).toBe(false);
    }
  });

  it("draws it: a house appears on its lot, with a lit window, its prop and its DEMO tag", () => {
    const appeared = pixelsThatDiffer(withFive, withFour);
    expect(pixelsThatDiffer(withFive, withFour, fifth.body).length).toBeGreaterThan(
      fifth.body.width * fifth.body.height * 0.8,
    );
    const reaches = [grownBy(fifth.lot.area, 6), grownBy(fifth.sign!.bounds, 6)];
    for (const { x, y } of appeared) {
      expect(
        reaches.some((reach) => contains(reach, { x, y, width: 1, height: 1 })),
        `${x},${y}`,
      ).toBe(true);
    }

    expect(coloursIn(withFive, glassOfWindow(fifth.build, fifth.windows[0]))).toContain("lamp");
    const [box] = fifth.props;
    expect(box.kind).toBe("cardboard box");
    expect(coloursIn(withFive, { x: box.at.x - 9, y: box.at.y - 12, width: 19, height: 13 })).toContain("sand");

    expect(defaultHouseStatus(fifth).tag).toBe(DEMO_TAG);
    const board = fifth.sign!.board;
    const aboveTheSign: Rect = { x: board.x, y: board.y - 14, width: board.width, height: 14 };
    expect(findWords(withFive, DEMO_TAG, "ember", aboveTheSign)).not.toBeNull();
  });

  it("names it: its neon sign spells the project's name, letter for letter", () => {
    const sign = fifth.sign!;
    expect(sign.lines).toEqual(["pixel-bakery"]);
    expect(findWords(withFive, "pixel-bakery", signStyles[sign.style].letters, sign.board)).toEqual(sign.lineAt[0]);
    expect(findWords(withFour, "pixel-bakery", signStyles[sign.style].letters, sign.board)).toBeNull();
    expect(describeHouses(fiveHouses)).toContain("pixel-bakery (demo)");
  });

  it("joins it to the desk: its doorstep is on a path that can be walked from the desk", () => {
    expect(fifth.doorstep).toEqual(fifth.lot.doorstep);
    expect(groundKindAt(fifth.doorstep.x, fifth.doorstep.y)).toBe("path");
    expect(canBeWalkedToFromTheDesk(fifth.doorstep)).toBe(true);
    expect(fifth.step.y + fifth.step.height).toBe(fifth.doorstep.y);
    expect(fifth.door.x + (fifth.door.width - 1) / 2).toBe(fifth.doorstep.x);
  });

  it("puts it last on the round, after the houses that were already there", () => {
    expect(housesToVisit(fiveHouses).map((house) => house.project)).toEqual([
      ...housesToVisit(villageHouses).map((house) => house.project),
      "pixel-bakery",
    ]);
  });

  it("works on any free lot, with any build and sign, and with a name that needs two lines", () => {
    const taken = new Set(houses.map((entry) => entry.lot));
    for (const lot of plazaLayout.houseLots.filter((candidate) => !taken.has(candidate.name))) {
      const placed = placeHouses([
        ...houses,
        { ...fifthEntry, project: "night-shift-bakery", lot: lot.name, build: "timber workshop", sign: "blue arrow" },
      ]);
      const house = placed[4];
      const picture = villageAt(SCREENSHOT_MS, placed);
      expect(house.sign!.lines, lot.name).toEqual(["night-", "shift-bakery"]);
      house.sign!.lines.forEach((line, lineNumber) => {
        expect(findWords(picture, line, "cyan", house.sign!.board), `${lot.name}: ${line}`).toEqual(
          house.sign!.lineAt[lineNumber],
        );
      });
      expect(contains(wholeScreen, house.sign!.bounds), lot.name).toBe(true);
      expect(canBeWalkedToFromTheDesk(house.doorstep), lot.name).toBe(true);
    }
  });

  it("also takes a fifth house that is for sale", () => {
    const placed = placeHouses([...houses, { forSale: true, lot: "far right of the upper street" }]);
    const house = placed[4];
    expect(house.isForSale).toBe(true);
    expect(findWords(villageAt(SCREENSHOT_MS, placed), "SALE", "ember", house.forSaleBoard!)).not.toBeNull();
    expect(housesToVisit(placed)).toEqual(housesToVisit(villageHouses));
  });
});
