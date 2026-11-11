import { describe, expect, it } from "vitest";
import { TEAM_HOUSE_PROJECT } from "../../../lib/demo/scripts/team-house";
import { clear, colourAt, createSurface, type Surface } from "../../../lib/village/engine";
import {
  BULBS_IN_A_RUN,
  LETTERS_PER_SIGN_LINE,
  drawSign,
  placeSign,
  signLinesFor,
  signStateAt,
  signStyleNames,
  signStyles,
  villageHouses,
  type PlacedSign,
  type SignState,
  type SignStyle,
} from "../../../lib/village/houses";
import { plazaLayout, type Rect } from "../../../lib/village/plaza";
import {
  SCREENSHOT_MS,
  coloursIn,
  contains,
  findWords,
  grownBy,
  pixelsIn,
  pixelsThatDiffer,
  wholeScreen,
} from "./helpers";

const NIGHT_SKY = "dusk";
const allGlowing: SignState = { isLit: true, letterOut: null, bulbStep: 0, glintStep: 0, topperIsBright: true };
const switchedOff: SignState = { isLit: false, letterOut: null, bulbStep: 0, glintStep: 0, topperIsBright: false };

function signOnTheSky(sign: PlacedSign, state: SignState): Surface {
  const surface = createSurface();
  clear(surface, NIGHT_SKY);
  drawSign(surface, sign, state);
  return surface;
}

const signedHouses = villageHouses.filter((house) => house.sign);
const middleOfTheSky = { x: 192, y: 100 };

describe("how a name is spelled on a sign", () => {
  it("keeps a name of up to thirteen letters on one line", () => {
    expect(LETTERS_PER_SIGN_LINE).toBe(13);
    expect(signLinesFor("approval-desk")).toEqual(["approval-desk"]);
    expect(signLinesFor(TEAM_HOUSE_PROJECT)).toEqual([TEAM_HOUSE_PROJECT]);
  });

  it("breaks a longer name in two after a hyphen or at a space, as evenly as it can", () => {
    expect(signLinesFor("night-shift-bakery")).toEqual(["night-", "shift-bakery"]);
    expect(signLinesFor("the long way round")).toEqual(["the long", "way round"]);
  });

  it("refuses, in plain words, a name that cannot fit", () => {
    expect(() => signLinesFor("averyveryverylongname")).toThrow(/too long for a sign: 13 letters fit on a line/);
    expect(() => signLinesFor("averyveryverylong-name")).toThrow(/too long for a sign/);
    expect(() => signLinesFor("")).toThrow(/needs a name/);
    expect(() => signLinesFor(" padded ")).toThrow(/needs a name/);
    expect(() => signLinesFor("café")).toThrow(/uses "é", which the village's letters do not have/);
  });
});

describe("where a sign's parts go", () => {
  it("centres the board on the door and stands it on the given row", () => {
    for (const name of ["approval-desk", TEAM_HOUSE_PROJECT, "ab", "night-shift-bakery"]) {
      const sign = placeSign(name, "blue arrow", middleOfTheSky.x, middleOfTheSky.y);
      expect(sign.board.x + (sign.board.width - 1) / 2, name).toBe(middleOfTheSky.x);
      expect(sign.board.y + sign.board.height - 1, name).toBe(middleOfTheSky.y);
    }
  });

  it("keeps every line of the name inside the board, off its frame of lights", () => {
    for (const name of ["approval-desk", TEAM_HOUSE_PROJECT, "ab", "night-shift-bakery", "gyp-jq"]) {
      const sign = placeSign(name, "green tick marquee", middleOfTheSky.x, middleOfTheSky.y);
      const surface = signOnTheSky(sign, allGlowing);
      const style: SignStyle = signStyles[sign.style];
      const lettersAt = pixelsIn(wholeScreen).filter(({ x, y }) => colourAt(surface, x, y) === style.letters);
      expect(lettersAt.length, name).toBeGreaterThan(0);
      const clearBoard = grownBy(sign.board, -3);
      for (const pixel of lettersAt.filter((at) => at.y >= sign.board.y)) {
        expect(contains(clearBoard, { ...pixel, width: 1, height: 1 }), `${name} at ${pixel.x},${pixel.y}`).toBe(true);
      }
    }
  });

  it("makes the board wide enough for a topper and a tag, however short the name", () => {
    const sign = placeSign("ab", "pink star", middleOfTheSky.x, middleOfTheSky.y);
    expect(sign.board.width).toBeGreaterThanOrEqual(47);
    expect(sign.topperAt.x).toBeGreaterThanOrEqual(sign.board.x);
    expect(contains(sign.bounds, sign.board)).toBe(true);
    expect(sign.bounds.y).toBe(sign.topperAt.y);
  });
});

describe("the signs of the village", () => {
  it("spell each project's name, letter for letter, in the sign's own neon colour", () => {
    expect(signedHouses.map((house) => house.project)).toEqual(["approval-desk", TEAM_HOUSE_PROJECT]);
    for (const house of signedHouses) {
      const sign = house.sign!;
      expect(sign.lines.join("")).toBe(house.project);
      const surface = signOnTheSky(sign, allGlowing);
      sign.lines.forEach((line, lineNumber) => {
        expect(findWords(surface, line, signStyles[sign.style].letters, sign.board), line).toEqual(
          sign.lineAt[lineNumber],
        );
      });
    }
  });

  it("fit on the screen whole, with room to spare", () => {
    for (const house of signedHouses) {
      expect(contains(grownBy(wholeScreen, -5), house.sign!.bounds), house.name).toBe(true);
    }
  });

  it("stand on the roof ridge: the board covers the top of the roof and never reaches a window", () => {
    for (const house of signedHouses) {
      const board = house.sign!.board;
      const boardBottom = board.y + board.height - 1;
      expect(boardBottom, house.name).toBeGreaterThanOrEqual(house.body.y);
      for (const window of house.windows) expect(boardBottom, house.name).toBeLessThan(window.y - 8);
      expect(boardBottom, house.name).toBeLessThan(house.door.y - 8);
    }
  });

  it("give each project a different style", () => {
    const styles = signedHouses.map((house) => house.sign!.style);
    expect(new Set(styles).size).toBe(styles.length);
    const letters = styles.map((style) => signStyles[style].letters);
    expect(new Set(letters).size).toBe(letters.length);
  });
});

describe("neon", () => {
  it("glows: light hugs the letters and spills past the edge of the board", () => {
    for (const styleName of signStyleNames) {
      const style: SignStyle = signStyles[styleName];
      const sign = placeSign("open late", styleName, middleOfTheSky.x, middleOfTheSky.y);
      const lit = signOnTheSky(sign, allGlowing);
      const insideTheBoard = coloursIn(lit, grownBy(sign.board, -2));
      expect(insideTheBoard, styleName).toContain(style.letters);
      expect(insideTheBoard, styleName).toContain(style.lettersGlow);

      const plainSky = createSurface();
      clear(plainSky, NIGHT_SKY);
      const changed = pixelsThatDiffer(lit, plainSky);
      const spilled = changed.filter(
        ({ x, y }) => !contains(sign.bounds, { x, y, width: 1, height: 1 }),
      );
      expect(spilled.length, styleName).toBeGreaterThan(40);
      for (const { x, y } of spilled) {
        expect([style.haloNear, style.haloFar], styleName).toContain(colourAt(lit, x, y));
        expect(contains(grownBy(sign.board, 5), { x, y, width: 1, height: 1 }), styleName).toBe(true);
      }
    }
  });

  it("goes dark when switched off: no bright tube, no bulb, no light past the board, the name still readable", () => {
    for (const styleName of signStyleNames) {
      const style: SignStyle = signStyles[styleName];
      const sign = placeSign("open late", styleName, middleOfTheSky.x, middleOfTheSky.y);
      const off = signOnTheSky(sign, switchedOff);
      const colours = coloursIn(off, wholeScreen);
      for (const bright of [style.letters, style.frameBright, style.topperBright]) {
        expect(colours, `${styleName}: ${bright}`).not.toContain(bright);
      }
      const plainSky = createSurface();
      clear(plainSky, NIGHT_SKY);
      for (const { x, y } of pixelsThatDiffer(off, plainSky)) {
        expect(contains(sign.bounds, { x, y, width: 1, height: 1 }), styleName).toBe(true);
      }
      expect(findWords(off, "open late", style.lettersGlow, sign.board), styleName).toEqual(sign.lineAt[0]);
    }
  });

  it("is the same picture for the same moment, every time", () => {
    for (const house of signedHouses) {
      const letters = house.project!.length;
      const first = signOnTheSky(house.sign!, signStateAt(SCREENSHOT_MS, house.listOrder, letters));
      const second = signOnTheSky(house.sign!, signStateAt(SCREENSHOT_MS, house.listOrder, letters));
      expect(pixelsThatDiffer(first, second)).toEqual([]);
    }
  });

  it("has every letter glowing and the topper bright in the saved screenshot's frame, on all six lots", () => {
    for (let turn = 0; turn < plazaLayout.houseLots.length; turn += 1) {
      const state = signStateAt(SCREENSHOT_MS, turn, 13);
      expect(state, `house ${turn + 1}`).toMatchObject({ isLit: true, letterOut: null, topperIsBright: true });
    }
  });

  it("blinks its topper: bright most of the time, dim for a moment in every round", () => {
    const moments = Array.from({ length: 300 }, (_, tick) => tick * 10);
    const bright = moments.filter((timeMs) => signStateAt(timeMs, 1, 9).topperIsBright).length;
    expect(bright).toBeGreaterThan(moments.length * 0.6);
    expect(bright).toBeLessThan(moments.length);
  });

  it("sends a glint round a tube frame, which never leaves the frame", () => {
    const sign = villageHouses[1].sign!;
    const style: SignStyle = signStyles[sign.style];
    expect(style.frame).toBe("tube");
    expect(signStateAt(1000, 1, 9).glintStep).toBeGreaterThan(signStateAt(0, 1, 9).glintStep);

    const one = signOnTheSky(sign, { ...allGlowing, glintStep: 4 });
    const next = signOnTheSky(sign, { ...allGlowing, glintStep: 40 });
    const moved = pixelsThatDiffer(one, next);
    expect(moved.length).toBeGreaterThan(0);
    const clearBoard = grownBy(sign.board, -2);
    for (const { x, y } of moved) {
      expect(contains(sign.board, { x, y, width: 1, height: 1 })).toBe(true);
      expect(contains(clearBoard, { x, y, width: 1, height: 1 })).toBe(false);
      expect([style.frameBright, "cream"]).toContain(colourAt(one, x, y));
    }
    const pixelsRoundTheFrame = 2 * (sign.board.width - 2 + sign.board.height - 2) - 4;
    const wrapped = signOnTheSky(sign, { ...allGlowing, glintStep: 4 + pixelsRoundTheFrame });
    expect(pixelsThatDiffer(one, wrapped)).toEqual([]);
  });

  it("runs its bulbs round the frame: they step on a few times a second, and the name stays put", () => {
    const sign = villageHouses[0].sign!;
    const style: SignStyle = signStyles[sign.style];
    expect(style.frame).toBe("bulbs");
    const steps = new Set<number>();
    for (let timeMs = 0; timeMs < 1000; timeMs += 20) steps.add(signStateAt(timeMs, 0, 13).bulbStep);
    expect([...steps].sort()).toEqual(Array.from({ length: BULBS_IN_A_RUN }, (_, step) => step));

    const one = signOnTheSky(sign, { ...allGlowing, bulbStep: 0 });
    const next = signOnTheSky(sign, { ...allGlowing, bulbStep: 1 });
    const moved = pixelsThatDiffer(one, next);
    expect(moved.length).toBeGreaterThan(20);
    const clearBoard = grownBy(sign.board, -2);
    for (const { x, y } of moved) {
      expect(contains(sign.board, { x, y, width: 1, height: 1 })).toBe(true);
      expect(contains(clearBoard, { x, y, width: 1, height: 1 })).toBe(false);
    }
    const bulbs = coloursIn(one, sign.board);
    expect(bulbs).toContain(style.frameBright);
    expect(bulbs).toContain(style.frameDim);
  });

  it("buzzes: now and then one letter drops out for a blink, and only that letter", () => {
    const house = villageHouses[0];
    const sign = house.sign!;
    const letters = house.project!.length;
    const moments = Array.from({ length: 2000 }, (_, tick) => tick * 10);
    const out = moments.filter((timeMs) => signStateAt(timeMs, house.listOrder, letters).letterOut !== null);
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThan(moments.length * 0.05);

    const state = signStateAt(out[0], house.listOrder, letters);
    expect(state.letterOut).toBeGreaterThanOrEqual(0);
    expect(state.letterOut).toBeLessThan(letters);
    const buzzing = signOnTheSky(sign, state);
    const steady = signOnTheSky(sign, { ...state, letterOut: null });
    const letterPitch = 6;
    const lostLetter: Rect = {
      x: sign.lineAt[0].x + state.letterOut! * letterPitch - 1,
      y: sign.lineAt[0].y - 1,
      width: letterPitch + 1,
      height: 11,
    };
    const changed = pixelsThatDiffer(buzzing, steady);
    expect(changed.length).toBeGreaterThan(0);
    for (const { x, y } of changed) {
      expect(contains(lostLetter, { x, y, width: 1, height: 1 }), `${x},${y}`).toBe(true);
    }
  });

  it("staggers the signs, so two houses never buzz on the same beat", () => {
    const moments = Array.from({ length: 3000 }, (_, tick) => tick * 10);
    const buzzOf = (turn: number): number[] =>
      moments.filter((timeMs) => signStateAt(timeMs, turn, 9).letterOut !== null);
    expect(buzzOf(0)).not.toEqual(buzzOf(1));
  });

  it("treats a time before the start as the start", () => {
    expect(signStateAt(-500, 0, 13)).toEqual(signStateAt(0, 0, 13));
  });
});

describe("the sky the signs stand against", () => {
  it("is above the horizon for the houses on the upper street, so the neon shows against the dusk", () => {
    for (const house of signedHouses) {
      expect(house.sign!.board.y, house.name).toBeLessThan(plazaLayout.horizonY);
    }
  });
});
