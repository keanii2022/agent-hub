import { describe, expect, it } from "vitest";
import { colourNameOf, colourNames, palette, rgbOf } from "../../../lib/village/engine";

describe("palette", () => {
  it("writes every colour as # and six hex digits", () => {
    for (const name of colourNames) {
      expect(palette[name], name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("has no colour twice", () => {
    const values = colourNames.map((name) => palette[name]);
    expect(new Set(values).size).toBe(values.length);
  });

  it("gives plain lowercase names that fit under a swatch", () => {
    for (const name of colourNames) {
      expect(name).toMatch(/^[a-z]{3,7}$/);
    }
  });

  it("turns a name into red, green and blue", () => {
    expect(rgbOf("lamp")).toEqual([0xff, 0xd1, 0x66]);
    expect(rgbOf("ink")).toEqual([0x0d, 0x0b, 0x1a]);
  });

  it("finds the name of a colour, and nothing for a colour outside the palette", () => {
    for (const name of colourNames) {
      expect(colourNameOf(...rgbOf(name))).toBe(name);
    }
    expect(colourNameOf(1, 2, 3)).toBeNull();
  });
});
