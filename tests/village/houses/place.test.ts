import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import { TEAM_HOUSE_PROJECT } from "../../../lib/demo/scripts/team-house";
import {
  PROPS_AT_MOST,
  housesToVisit,
  placeHouses,
  propSprites,
  villageHouses,
  type HouseEntry,
  type ProjectHouse,
} from "../../../lib/village/houses";
import { desk, groundKindAt, plazaLayout, type Rect } from "../../../lib/village/plaza";
import { canBeWalkedToFromTheDesk, contains, isInside, overlap, pixelsIn, wholeScreen } from "./helpers";

// About as tall as a character standing up: the seated human is 24.
const STANDING_CHARACTER_HEIGHT = 26;

const aProject: ProjectHouse = {
  project: "pixel-bakery",
  lot: "far left of the upper street",
  build: "plaster cottage",
  sign: "pink star",
  props: [],
  data: "demo",
};

describe("where the houses stand", () => {
  it("puts each house on the lot its entry names, in list order", () => {
    villageHouses.forEach((house, index) => {
      expect(house.listOrder).toBe(index);
      expect(house.lot.name).toBe(houses[index].lot);
    });
  });

  it("knows which houses have a project and which are for sale", () => {
    expect(villageHouses.map((house) => house.project)).toEqual(["approval-desk", TEAM_HOUSE_PROJECT, null, null]);
    expect(villageHouses.map((house) => house.isForSale)).toEqual([false, false, true, true]);
    expect(villageHouses.map((house) => house.data)).toEqual(["demo", "demo", null, null]);
    expect(villageHouses.map((house) => house.name)).toEqual([
      "approval-desk",
      TEAM_HOUSE_PROJECT,
      "House for sale",
      "House for sale",
    ]);
  });

  it("stands every house inside its lot from side to side, with its foot on the lot's last row", () => {
    for (const house of villageHouses) {
      expect(house.body.x, house.name).toBeGreaterThanOrEqual(house.lot.area.x);
      expect(house.body.x + house.body.width, house.name).toBeLessThanOrEqual(
        house.lot.area.x + house.lot.area.width,
      );
      expect(house.body.y, house.name).toBeGreaterThanOrEqual(house.lot.area.y);
      expect(house.footY, house.name).toBe(house.lot.area.y + house.lot.area.height - 1);
    }
  });

  it("builds on grass only: no wall, step or prop covers a path or the square", () => {
    for (const house of villageHouses) {
      const yard: Rect = {
        x: house.lot.area.x,
        y: house.body.y + house.body.height,
        width: house.lot.area.width,
        height: house.footY - (house.body.y + house.body.height) + 1,
      };
      for (const { x, y } of [...pixelsIn(house.body), ...pixelsIn(yard), ...pixelsIn(house.step)]) {
        expect(["grass", "sky"], `${house.name} at ${x},${y}`).toContain(groundKindAt(x, y));
      }
    }
  });

  it("keeps every house, sign and for-sale board on the screen and clear of the others", () => {
    const footprints = villageHouses.map((house) => {
      const parts = [house.body, house.sign?.bounds, house.forSaleBoard].filter(
        (part): part is Rect => Boolean(part),
      );
      for (const part of parts) expect(contains(wholeScreen, part), house.name).toBe(true);
      return { house, parts };
    });
    footprints.forEach(({ house, parts }, index) => {
      for (const other of footprints.slice(index + 1)) {
        for (const part of parts) {
          for (const otherPart of other.parts) {
            expect(overlap(part, otherPart), `${house.name} and ${other.house.name}`).toBe(false);
          }
        }
      }
      for (const part of parts) expect(overlap(part, desk.computerBounds), house.name).toBe(false);
    });
  });
});

describe("the door and the way to it", () => {
  it("opens every door right above its doorstep, tall enough to walk through", () => {
    for (const house of villageHouses) {
      expect(house.doorstep).toEqual(house.lot.doorstep);
      const doorMiddle = house.door.x + (house.door.width - 1) / 2;
      expect(doorMiddle, house.name).toBe(house.doorstep.x);
      expect(house.door.height, house.name).toBeGreaterThanOrEqual(STANDING_CHARACTER_HEIGHT);
      expect(house.door.y + house.door.height, house.name).toBe(house.body.y + house.body.height);
      expect(contains(house.body, house.door), house.name).toBe(true);
    }
  });

  it("runs a path from the desk to every house: the doorstep is on a path and can be walked to", () => {
    for (const house of villageHouses) {
      expect(groundKindAt(house.doorstep.x, house.doorstep.y), house.name).toBe("path");
      expect(canBeWalkedToFromTheDesk(house.doorstep), house.name).toBe(true);
    }
  });

  it("lays a step from the door down to the street, so the door and the path meet", () => {
    for (const house of villageHouses) {
      expect(house.step.y, house.name).toBe(house.door.y + house.door.height);
      expect(house.step.y + house.step.height, house.name).toBe(house.doorstep.y);
      expect(house.step.x, house.name).toBeLessThanOrEqual(house.door.x);
      expect(house.step.x + house.step.width, house.name).toBeGreaterThanOrEqual(house.door.x + house.door.width);
    }
  });

  it("puts the knock spot on the door, where a standing visitor's hand reaches", () => {
    for (const house of villageHouses) {
      expect(isInside(house.door, house.knockSpot), house.name).toBe(true);
      const aboveTheStreet = house.doorstep.y - house.knockSpot.y;
      expect(aboveTheStreet, house.name).toBeGreaterThan(STANDING_CHARACTER_HEIGHT / 2);
      expect(aboveTheStreet, house.name).toBeLessThan(STANDING_CHARACTER_HEIGHT);
    }
  });

  it("visits the houses with a project in list order and skips the ones for sale", () => {
    expect(housesToVisit(villageHouses).map((house) => house.project)).toEqual([
      "approval-desk",
      TEAM_HOUSE_PROJECT,
    ]);
    const forSaleFirst = placeHouses([houses[2], houses[1], houses[3], houses[0]]);
    expect(housesToVisit(forSaleFirst).map((house) => house.project)).toEqual([
      TEAM_HOUSE_PROJECT,
      "approval-desk",
    ]);
  });
});

describe("the spots later steps use", () => {
  it("gives every house windows in its wall, beside the door, never across it", () => {
    for (const house of villageHouses) {
      expect(house.windows.length, house.name).toBeGreaterThanOrEqual(2);
      house.windows.forEach((window, index) => {
        expect(contains(house.body, window), house.name).toBe(true);
        expect(overlap(window, house.door), house.name).toBe(false);
        for (const other of house.windows.slice(index + 1)) {
          expect(overlap(window, other), house.name).toBe(false);
        }
      });
    }
  });

  it("makes the area a click reaches cover the house and its sign, on the screen", () => {
    villageHouses.forEach((house, index) => {
      expect(contains(wholeScreen, house.clickBounds), house.name).toBe(true);
      expect(contains(house.clickBounds, house.body), house.name).toBe(true);
      if (house.sign) expect(contains(house.clickBounds, house.sign.board), house.name).toBe(true);
      for (const other of villageHouses.slice(index + 1)) {
        expect(overlap(house.clickBounds, other.clickBounds), `${house.name} and ${other.name}`).toBe(false);
      }
      expect(overlap(house.clickBounds, desk.computerBounds), house.name).toBe(false);
    });
  });

  it("keeps the tag and the note on the screen, the tag above the sign and the note below it", () => {
    for (const house of villageHouses.filter((candidate) => candidate.sign)) {
      const board = house.sign!.board;
      expect(isInside(wholeScreen, house.tagSpot), house.name).toBe(true);
      expect(isInside(wholeScreen, house.noteSpot), house.name).toBe(true);
      expect(house.tagSpot.y, house.name).toBeLessThanOrEqual(board.y);
      expect(house.noteSpot.y, house.name).toBeGreaterThanOrEqual(board.y + board.height);
      expect(house.noteSpot.x, house.name).toBe(house.doorstep.x);
    }
  });

  it("sets the props out in the yard, in list order, clear of the door", () => {
    for (const house of villageHouses) {
      const entry = houses[house.listOrder];
      expect(house.props.map((prop) => prop.kind)).toEqual("props" in entry ? entry.props : []);
      for (const prop of house.props) {
        const sprite = propSprites[prop.kind];
        const box: Rect = {
          x: prop.at.x - Math.floor(sprite.width / 2),
          y: prop.at.y - sprite.height + 1,
          width: sprite.width,
          height: sprite.height,
        };
        expect(prop.at.y, prop.kind).toBe(house.footY);
        expect(overlap(box, house.door), prop.kind).toBe(false);
        expect(box.x, prop.kind).toBeGreaterThanOrEqual(house.lot.area.x);
        expect(box.x + box.width, prop.kind).toBeLessThanOrEqual(house.lot.area.x + house.lot.area.width + 1);
      }
    }
  });

  it("gives a house for sale a board in its yard and no neon sign", () => {
    for (const house of villageHouses.filter((candidate) => candidate.isForSale)) {
      expect(house.sign).toBeNull();
      expect(house.props).toEqual([]);
      expect(house.forSaleBoard).not.toBeNull();
      expect(overlap(house.forSaleBoard!, house.door), house.name).toBe(false);
      expect(house.forSaleBoard!.x, house.name).toBeGreaterThanOrEqual(house.lot.area.x);
      expect(house.forSaleBoard!.x + house.forSaleBoard!.width, house.name).toBeLessThanOrEqual(
        house.lot.area.x + house.lot.area.width,
      );
    }
    for (const house of villageHouses.filter((candidate) => !candidate.isForSale)) {
      expect(house.forSaleBoard).toBeNull();
      expect(house.sign).not.toBeNull();
    }
  });
});

describe("a list that cannot be built", () => {
  const withEntry = (entry: HouseEntry): HouseEntry[] => [...houses, entry];

  it("is refused in plain words when a lot is not in the plaza, and the lots are named", () => {
    expect(() => placeHouses(withEntry({ ...aProject, lot: "on the moon" }))).toThrow(
      /"pixel-bakery" asks for the lot "on the moon", which is not in the plaza\. The lots are: .*"far left of the upper street"/,
    );
  });

  it("is refused when two houses ask for one lot", () => {
    expect(() => placeHouses(withEntry({ ...aProject, lot: houses[0].lot }))).toThrow(/already has a house on it/);
    expect(() => placeHouses(withEntry({ forSale: true, lot: houses[2].lot }))).toThrow(
      /The house for sale at place 5 .* already has a house on it/,
    );
  });

  it("is refused when a project is listed twice", () => {
    expect(() => placeHouses(withEntry({ ...aProject, project: "approval-desk" }))).toThrow(
      /"approval-desk" is in the house list twice/,
    );
  });

  it("is refused when a name is too long for a sign", () => {
    expect(() => placeHouses(withEntry({ ...aProject, project: "averyveryverylongprojectname" }))).toThrow(
      /too long for a sign/,
    );
  });

  it("is refused when it asks for a build, sign or prop the village has no picture for", () => {
    const unknown = "made up" as never;
    expect(() => placeHouses(withEntry({ ...aProject, build: unknown }))).toThrow(/The builds are: /);
    expect(() => placeHouses(withEntry({ ...aProject, sign: unknown }))).toThrow(/The signs are: /);
    expect(() => placeHouses(withEntry({ ...aProject, props: [unknown] }))).toThrow(/The props are: /);
  });

  it("is refused when more props are left outside than the yard has room for", () => {
    const tooMany = Array.from({ length: PROPS_AT_MOST + 1 }, () => "rubber stamp" as const);
    expect(() => placeHouses(withEntry({ ...aProject, props: tooMany }))).toThrow(/there is room for 4/);
  });

  it("is refused when a project does not say whether its data is demo or real", () => {
    expect(() => placeHouses(withEntry({ ...aProject, data: "maybe" as never }))).toThrow(/"demo" or "real"/);
  });

  it("never names a rule code in what it says", () => {
    const refusals = [
      () => placeHouses(withEntry({ ...aProject, lot: "on the moon" })),
      () => placeHouses(withEntry({ ...aProject, project: "approval-desk" })),
      () => placeHouses(withEntry({ ...aProject, project: "averyveryverylongprojectname" })),
    ];
    for (const refusal of refusals) {
      let said: string | null = null;
      try {
        refusal();
      } catch (error) {
        said = (error as Error).message;
      }
      expect(said).not.toBeNull();
      expect(said).not.toMatch(/\bH\d{1,2}\b/);
    }
  });
});

describe("the plaza's lots", () => {
  it("still has free lots for more houses", () => {
    const taken = new Set(villageHouses.map((house) => house.lot.name));
    expect(plazaLayout.houseLots.filter((lot) => !taken.has(lot.name)).length).toBeGreaterThanOrEqual(1);
  });
});
