import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import { colourAt, createSurface, type ColourName, type Surface } from "../../../lib/village/engine";
import {
  DEMO_TAG,
  FOR_SALE_WORDS,
  defaultHouseStatus,
  describeHouses,
  glassOfWindow,
  houseStateAt,
  placeHouses,
  signStyles,
  villageHouses,
  type BuildName,
  type HouseStatus,
  type PlacedHouse,
} from "../../../lib/village/houses";
import { drawPlaza, groundKindAt, plazaStateAt, type Rect } from "../../../lib/village/plaza";
import {
  SCREENSHOT_MS,
  coloursIn,
  contains,
  findWords,
  grownBy,
  pixelsIn,
  pixelsThatDiffer,
  villageAt,
  wholeScreen,
} from "./helpers";

const NEON: ColourName[] = ["lime", "cyan", "pink", "violet"];
const WINDOW_LIGHT: ColourName = "lamp";

const [approvalDesk, teamHouse, ...forSale] = villageHouses;
const projectHouses = [approvalDesk, teamHouse];

const village = villageAt(SCREENSHOT_MS, villageHouses);

function plazaAlone(): Surface {
  const surface = createSurface();
  drawPlaza(surface, plazaStateAt(SCREENSHOT_MS));
  return surface;
}

function withStatus(house: PlacedHouse, change: Partial<HouseStatus>): Surface {
  return villageAt(SCREENSHOT_MS, villageHouses, (candidate) =>
    candidate === house ? { ...defaultHouseStatus(candidate), ...change } : defaultHouseStatus(candidate),
  );
}

/** Everything a house may paint on: its lot, its sign and the light the sign throws. */
function reachOf(house: PlacedHouse): Rect[] {
  const lot = grownBy(house.lot.area, 6);
  return house.sign ? [lot, grownBy(house.sign.bounds, 6)] : [lot];
}

function aboveTheSign(house: PlacedHouse): Rect {
  const board = house.sign!.board;
  return { x: board.x, y: board.y - 14, width: board.width, height: 14 };
}

const looks: Record<BuildName, { roof: ColourName; wall: ColourName; door: ColourName }> = {
  "brick office": { roof: "plum", wall: "stone", door: "teal" },
  "timber workshop": { roof: "stone", wall: "clay", door: "wood" },
  "plaster cottage": { roof: "clay", wall: "sand", door: "plum" },
};

describe("the picture of the village", () => {
  it("paints every pixel of the screen in a palette colour", () => {
    for (const { x, y } of pixelsIn(wholeScreen)) expect(colourAt(village, x, y), `${x},${y}`).not.toBeNull();
  });

  it("is the same picture for the same time, every time", () => {
    expect(pixelsThatDiffer(village, villageAt(SCREENSHOT_MS, villageHouses))).toEqual([]);
  });

  it("draws every house on its lot", () => {
    const plaza = plazaAlone();
    for (const house of villageHouses) {
      const changed = pixelsThatDiffer(village, plaza, house.body).length;
      expect(changed, house.name).toBeGreaterThan(house.body.width * house.body.height * 0.8);
    }
  });

  it("changes nothing else: every path, the square and the desk are as the plaza drew them", () => {
    const changed = pixelsThatDiffer(village, plazaAlone());
    const reaches = villageHouses.flatMap(reachOf);
    for (const { x, y } of changed) {
      expect(["grass", "sky"], `${x},${y}`).toContain(groundKindAt(x, y));
      expect(
        reaches.some((reach) => contains(reach, { x, y, width: 1, height: 1 })),
        `${x},${y}`,
      ).toBe(true);
    }
  });

  it("moves: the neon is not the same picture a moment later", () => {
    const later = villageAt(SCREENSHOT_MS + 300, villageHouses);
    for (const house of projectHouses) {
      expect(pixelsThatDiffer(village, later, house.sign!.bounds).length, house.name).toBeGreaterThan(0);
    }
  });
});

describe("a house with a project in it", () => {
  it("reads as a house: a roof over a wall, a door with a knob, windows either side", () => {
    for (const house of projectHouses) {
      const look = looks[house.build];
      const roof: Rect = { x: house.body.x, y: house.body.y + 6, width: house.body.width, height: 14 };
      const wall: Rect = { x: house.body.x, y: house.door.y, width: house.body.width, height: house.door.height };
      expect(coloursIn(village, roof), house.name).toContain(look.roof);
      expect(coloursIn(village, wall), house.name).toContain(look.wall);
      expect(coloursIn(village, house.door), house.name).toContain(look.door);
      expect(coloursIn(village, house.door), house.name).toContain("lamp");
      expect(house.windows.some((window) => window.x < house.door.x), house.name).toBe(true);
      expect(house.windows.some((window) => window.x > house.door.x + house.door.width), house.name).toBe(true);
    }
  });

  it("does not look like the other one: different walls, roof and door", () => {
    expect(looks[approvalDesk.build]).not.toEqual(looks[teamHouse.build]);
    for (const part of ["roof", "wall", "door"] as const) {
      expect(looks[approvalDesk.build][part], part).not.toBe(looks[teamHouse.build][part]);
    }
  });

  it("shows its name in neon on its sign, in the village picture itself", () => {
    for (const house of projectHouses) {
      const sign = house.sign!;
      sign.lines.forEach((line, lineNumber) => {
        expect(findWords(village, line, signStyles[sign.style].letters, sign.board), line).toEqual(
          sign.lineAt[lineNumber],
        );
      });
    }
  });

  it("starts with one window lit and its neon on", () => {
    for (const house of projectHouses) {
      expect(defaultHouseStatus(house)).toMatchObject({ litWindows: 1, isDark: false, note: null });
      const litWindows = house.windows.filter((window) =>
        coloursIn(village, glassOfWindow(house.build, window)).has(WINDOW_LIGHT),
      );
      expect(litWindows, house.name).toEqual([house.windows[0]]);
      expect(coloursIn(village, house.sign!.board), house.name).toContain(signStyles[house.sign!.style].letters);
    }
  });

  it("lights exactly as many windows as its status says, in window order", () => {
    for (const house of projectHouses) {
      for (let lit = 0; lit <= house.windows.length; lit += 1) {
        const picture = withStatus(house, { litWindows: lit });
        house.windows.forEach((window, index) => {
          const glows = coloursIn(picture, glassOfWindow(house.build, window)).has(WINDOW_LIGHT);
          expect(glows, `${house.name}: ${lit} lit, window ${index}`).toBe(index < lit);
        });
      }
    }
  });

  it("lights every window, and no more, when told of more workers than it has windows", () => {
    for (const house of projectHouses) {
      expect(houseStateAt(house, SCREENSHOT_MS, { ...defaultHouseStatus(house), litWindows: 10 }).litWindows).toBe(
        house.windows.length,
      );
      const everyWindowLit = withStatus(house, { litWindows: house.windows.length });
      expect(pixelsThatDiffer(withStatus(house, { litWindows: 10 }), everyWindowLit)).toEqual([]);
    }
  });

  it("goes dark when its status says so: no window light, no neon, and its note in plain words", () => {
    for (const house of projectHouses) {
      const picture = withStatus(house, { isDark: true, note: "no news", litWindows: 3 });
      for (const window of house.windows) {
        expect(coloursIn(picture, glassOfWindow(house.build, window)), house.name).not.toContain(WINDOW_LIGHT);
      }
      const signColours = coloursIn(picture, house.sign!.bounds);
      for (const neon of NEON) expect(signColours, `${house.name}: ${neon}`).not.toContain(neon);
      expect(coloursIn(picture, house.door), house.name).not.toContain("lamp");

      const underTheSign: Rect = { ...house.body, height: house.door.y - house.body.y };
      const note = findWords(picture, "no news", "slate", underTheSign);
      expect(note, house.name).not.toBeNull();
      expect(note!.y, house.name).toBeGreaterThan(house.noteSpot.y);
    }
  });

  it("keeps its name readable on the dark sign, so a dark house can still be told apart", () => {
    for (const house of projectHouses) {
      const picture = withStatus(house, { isDark: true });
      const sign = house.sign!;
      expect(findWords(picture, sign.lines[0], signStyles[sign.style].lettersGlow, sign.board)).toEqual(
        sign.lineAt[0],
      );
    }
  });

  it("goes dark alone: the other houses keep their lights", () => {
    for (const house of projectHouses) {
      const picture = withStatus(house, { isDark: true, note: "no news" });
      const reaches = reachOf(house);
      for (const { x, y } of pixelsThatDiffer(picture, village)) {
        expect(
          reaches.some((reach) => contains(reach, { x, y, width: 1, height: 1 })),
          `${house.name} at ${x},${y}`,
        ).toBe(true);
      }
    }
  });

  it("shows no note until its status has one", () => {
    for (const house of projectHouses) {
      const underTheSign: Rect = { ...house.body, height: house.door.y - house.body.y };
      expect(findWords(village, "no news", "slate", underTheSign)).toBeNull();
    }
  });
});

describe("the DEMO tag", () => {
  it("H10: a house on demo data wears a DEMO tag from the start, riding on its sign", () => {
    for (const house of projectHouses) {
      expect(house.data).toBe("demo");
      expect(defaultHouseStatus(house).tag).toBe(DEMO_TAG);
      const tag = findWords(village, DEMO_TAG, "ember", aboveTheSign(house));
      expect(tag, house.name).not.toBeNull();
      expect(tag!.x, house.name).toBeGreaterThan(house.doorstep.x);
      expect(tag!.x + 23, house.name).toBeLessThanOrEqual(house.tagSpot.x);
    }
  });

  it("H10: the tag stays on when the house goes dark", () => {
    for (const house of projectHouses) {
      const picture = withStatus(house, { isDark: true, note: "no news" });
      expect(findWords(picture, DEMO_TAG, "ember", aboveTheSign(house)), house.name).not.toBeNull();
    }
  });

  it("H10: a house on real data wears no tag, so the tag always means scripted", () => {
    const real = placeHouses(houses.map((entry) => ("project" in entry ? { ...entry, data: "real" as const } : entry)));
    const picture = villageAt(SCREENSHOT_MS, real);
    for (const house of real.filter((candidate) => candidate.sign)) {
      expect(defaultHouseStatus(house).tag).toBeNull();
      expect(findWords(picture, DEMO_TAG, "ember", aboveTheSign(house)), house.name).toBeNull();
    }
  });

  it("does not hide the sign's topper or its name", () => {
    for (const house of projectHouses) {
      const sign = house.sign!;
      const topper: Rect = { ...sign.topperAt, width: 13, height: 10 };
      expect(coloursIn(village, topper), house.name).toContain(signStyles[sign.style].topperBright);
      expect(coloursIn(village, topper), house.name).not.toContain("ember");
    }
  });
});

describe("a house for sale", () => {
  it("is dark and empty: no lit window, no neon, no props", () => {
    expect(forSale).toHaveLength(2);
    for (const house of forSale) {
      expect(defaultHouseStatus(house)).toEqual({
        litWindows: 0,
        softWindows: 0,
        isDark: true,
        note: null,
        tag: null,
      });
      for (const window of house.windows.filter((candidate) => !contains(house.forSaleBoard!, candidate))) {
        expect(coloursIn(village, glassOfWindow(house.build, window)), house.name).not.toContain(WINDOW_LIGHT);
      }
      const colours = coloursIn(village, house.lot.area);
      for (const light of [...NEON, WINDOW_LIGHT]) expect(colours, `${house.name}: ${light}`).not.toContain(light);
    }
  });

  it("stays dark whatever its status asks for", () => {
    for (const house of forSale) {
      const picture = withStatus(house, { litWindows: 2 });
      expect(pixelsThatDiffer(picture, village)).toEqual([]);
    }
  });

  it("says FOR SALE on a board in its yard, in plain capitals", () => {
    expect(FOR_SALE_WORDS.join(" ")).toBe("FOR SALE");
    for (const house of forSale) {
      const board = house.forSaleBoard!;
      const found = FOR_SALE_WORDS.map((word) => findWords(village, word, "ember", board));
      expect(found[0], house.name).not.toBeNull();
      expect(found[1], house.name).not.toBeNull();
      expect(found[1]!.y, house.name).toBeGreaterThan(found[0]!.y);
      expect(coloursIn(village, board), house.name).toContain("cream");
    }
  });

  it("still looks like a house, only darker: the build's own wall colour is gone from it", () => {
    const plaza = plazaAlone();
    for (const house of forSale) {
      expect(pixelsThatDiffer(village, plaza, house.body).length, house.name).toBeGreaterThan(
        house.body.width * house.body.height * 0.8,
      );
      const livedIn = placeHouses([
        { project: "lit-cottage", lot: house.lot.name, build: house.build, sign: "pink star", props: [], data: "real" },
      ]);
      const wallPixels = pixelsIn(house.body).filter(
        (pixel) => !contains(grownBy(house.forSaleBoard!, 2), { ...pixel, width: 1, height: 1 }),
      );
      const coloursOfWall = (picture: Surface): Set<ColourName | null> =>
        new Set(wallPixels.map(({ x, y }) => colourAt(picture, x, y)));
      expect(coloursOfWall(villageAt(SCREENSHOT_MS, livedIn)), house.name).toContain(looks[house.build].wall);
      expect(coloursOfWall(village), house.name).not.toContain(looks[house.build].wall);
    }
  });
});

describe("what is left outside", () => {
  it("leaves a cardboard box and a yellow-handled box cutter outside the team house", () => {
    expect(teamHouse.props.map((prop) => prop.kind)).toEqual(["cardboard box", "box cutter"]);
    const [box, cutter] = teamHouse.props;
    const boxColours = coloursIn(village, { x: box.at.x - 9, y: box.at.y - 12, width: 12, height: 13 });
    for (const needed of ["sand", "clay", "bark"] as const) expect(boxColours, needed).toContain(needed);
    const cutterColours = coloursIn(village, { x: cutter.at.x - 9, y: cutter.at.y - 4, width: 19, height: 5 });
    for (const needed of ["lamp", "cloud", "mist"] as const) expect(cutterColours, needed).toContain(needed);
  });

  it("leaves a rubber stamp and ticked paperwork outside approval-desk", () => {
    expect(approvalDesk.props.map((prop) => prop.kind)).toEqual(["rubber stamp", "stamped papers"]);
    const [stamp, papers] = approvalDesk.props;
    const stampColours = coloursIn(village, { x: stamp.at.x - 5, y: stamp.at.y - 12, width: 11, height: 13 });
    for (const needed of ["clay", "ember"] as const) expect(stampColours, needed).toContain(needed);
    const paperColours = coloursIn(village, { x: papers.at.x - 8, y: papers.at.y - 11, width: 17, height: 12 });
    for (const needed of ["cream", "leaf"] as const) expect(paperColours, needed).toContain(needed);
  });

  it("draws the props in front of the wall, not behind it", () => {
    const bare = villageAt(
      SCREENSHOT_MS,
      placeHouses(houses.map((entry) => ("props" in entry ? { ...entry, props: [] } : entry))),
    );
    for (const house of projectHouses) {
      for (const prop of house.props) {
        const around: Rect = { x: prop.at.x - 10, y: prop.at.y - 13, width: 21, height: 14 };
        expect(pixelsThatDiffer(village, bare, around).length, prop.kind).toBeGreaterThan(30);
      }
    }
  });
});

describe("the words the houses put on the screen", () => {
  it("H12: are plain words, with no rule codes", () => {
    const words = [
      ...villageHouses.map((house) => house.name),
      ...villageHouses.flatMap((house) => house.sign?.lines ?? []),
      ...FOR_SALE_WORDS,
      DEMO_TAG,
      describeHouses(),
    ];
    for (const word of words) expect(word).not.toMatch(/\bH\d{1,2}\b/);
  });

  it("describe the houses in one sentence for whoever cannot see them, demo houses marked", () => {
    expect(describeHouses()).toBe(
      `Around the plaza stand the houses of approval-desk (demo) and ${teamHouse.project} (demo), and 2 houses for sale.`,
    );
    expect(describeHouses([])).toBe("No houses stand around the plaza yet.");
    expect(describeHouses([forSale[0]])).toBe("Around the plaza stands one house for sale.");
  });
});
