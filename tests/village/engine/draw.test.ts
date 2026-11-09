import { describe, expect, it } from "vitest";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  clear,
  colourAt,
  createSurface,
  drawSprite,
  drawText,
  fillRect,
  frameAt,
  frameIndexAt,
  outlineRect,
  spriteFromRows,
  type Surface,
} from "../../../lib/village/engine";

function rowsOf(surface: Surface, letters: Record<string, string>): string[] {
  return Array.from({ length: surface.height }, (_, y) =>
    Array.from({ length: surface.width }, (_, x) => {
      const colour = colourAt(surface, x, y);
      return colour ? (letters[colour] ?? "?") : ".";
    }).join(""),
  );
}

describe("surface", () => {
  it("is the size of the screen unless told otherwise", () => {
    const surface = createSurface();
    expect([surface.width, surface.height]).toEqual([SCREEN_WIDTH, SCREEN_HEIGHT]);
    expect(surface.pixels).toHaveLength(SCREEN_WIDTH * SCREEN_HEIGHT * 4);
  });

  it("starts empty, and has no colour outside its edges", () => {
    const surface = createSurface(4, 4);
    expect(colourAt(surface, 0, 0)).toBeNull();
    clear(surface, "dusk");
    expect(colourAt(surface, 3, 3)).toBe("dusk");
    expect(colourAt(surface, 4, 0)).toBeNull();
    expect(colourAt(surface, 0, -1)).toBeNull();
  });
});

describe("rectangles", () => {
  it("fills exactly the pixels asked for", () => {
    const surface = createSurface(6, 4);
    fillRect(surface, 1, 1, 3, 2, "rose");
    expect(rowsOf(surface, { rose: "r" })).toEqual(["......", ".rrr..", ".rrr..", "......"]);
  });

  it("cuts off what hangs over the edge instead of wrapping round", () => {
    const surface = createSurface(4, 3);
    fillRect(surface, -2, -2, 4, 4, "rose");
    fillRect(surface, 3, 2, 5, 5, "lamp");
    expect(rowsOf(surface, { rose: "r", lamp: "l" })).toEqual(["rr..", "rr..", "...l"]);
  });

  it("snaps an in-between position to a whole pixel", () => {
    const surface = createSurface(5, 1);
    fillRect(surface, 1.6, 0, 2, 1, "rose");
    expect(rowsOf(surface, { rose: "r" })).toEqual(["..rr."]);
  });

  it("outlines without filling the middle", () => {
    const surface = createSurface(5, 4);
    outlineRect(surface, 0, 0, 5, 4, "mist");
    expect(rowsOf(surface, { mist: "m" })).toEqual(["mmmmm", "m...m", "m...m", "mmmmm"]);
  });
});

describe("sprites", () => {
  const arrow = spriteFromRows(["r..", "rl.", "r.."], { r: "rose", l: "lamp" });

  it("are built from rows of letters", () => {
    expect([arrow.width, arrow.height]).toEqual([3, 3]);
    expect(arrow.pixels).toEqual(["rose", null, null, "rose", "lamp", null, "rose", null, null]);
  });

  it("leave what is behind their see-through pixels alone", () => {
    const surface = createSurface(5, 3);
    clear(surface, "dusk");
    drawSprite(surface, arrow, 1, 0);
    expect(rowsOf(surface, { dusk: "d", rose: "r", lamp: "l" })).toEqual(["drddd", "drldd", "drddd"]);
  });

  it("can be mirrored", () => {
    const surface = createSurface(3, 3);
    drawSprite(surface, arrow, 0, 0, { flipX: true });
    expect(rowsOf(surface, { rose: "r", lamp: "l" })).toEqual(["..r", ".lr", "..r"]);
  });

  it("are cut off at the edge, and snap to whole pixels", () => {
    const surface = createSurface(3, 3);
    drawSprite(surface, arrow, 1.4, -1);
    expect(rowsOf(surface, { rose: "r", lamp: "l" })).toEqual([".rl", ".r.", "..."]);
  });

  it("refuse rows of different lengths", () => {
    expect(() => spriteFromRows(["rr", "r"], { r: "rose" })).toThrow(/row 1/);
  });

  it("refuse a letter that is not in the colour key", () => {
    expect(() => spriteFromRows(["rx"], { r: "rose" })).toThrow(/"x"/);
  });

  it("refuse to be empty", () => {
    expect(() => spriteFromRows([], {})).toThrow();
  });
});

describe("animation frames", () => {
  it("change after each frame time and loop round", () => {
    const frameNumbers = [0, 99, 100, 250, 300, 720].map((timeMs) => frameIndexAt(timeMs, 100, 3));
    expect(frameNumbers).toEqual([0, 0, 1, 2, 0, 1]);
  });

  it("hold the last frame when not looping", () => {
    expect(frameIndexAt(250, 100, 3, false)).toBe(2);
    expect(frameIndexAt(9000, 100, 3, false)).toBe(2);
  });

  it("pick the sprite for a moment in time", () => {
    const first = spriteFromRows(["r"], { r: "rose" });
    const second = spriteFromRows(["l"], { l: "lamp" });
    const blink = { frames: [first, second], frameMs: 200 };
    expect(frameAt(blink, 0)).toBe(first);
    expect(frameAt(blink, 200)).toBe(second);
    expect(frameAt(blink, 400)).toBe(first);
    expect(frameAt({ ...blink, loops: false }, 400)).toBe(second);
  });

  it("refuse an animation with no frames or no frame time", () => {
    expect(() => frameIndexAt(0, 100, 0)).toThrow(RangeError);
    expect(() => frameIndexAt(0, 0, 3)).toThrow(RangeError);
  });
});

describe("text", () => {
  it("draws letters from the font, one pixel apart", () => {
    const surface = createSurface(11, 9);
    drawText(surface, "TI", 0, 0, "cream");
    expect(rowsOf(surface, { cream: "#" })).toEqual([
      "#####..###.",
      "..#.....#..",
      "..#.....#..",
      "..#.....#..",
      "..#.....#..",
      "..#.....#..",
      "..#....###.",
      "...........",
      "...........",
    ]);
  });

  it("starts a new line ten pixels down", () => {
    const surface = createSurface(5, 20);
    drawText(surface, "T\nT", 0, 0, "cream");
    expect(colourAt(surface, 0, 0)).toBe("cream");
    expect(colourAt(surface, 0, 9)).toBeNull();
    expect(colourAt(surface, 0, 10)).toBe("cream");
  });

  it("is cut off at the edge", () => {
    const surface = createSurface(3, 2);
    drawText(surface, "T", -1, 0, "cream");
    expect(rowsOf(surface, { cream: "#" })).toEqual(["###", ".#."]);
  });
});
