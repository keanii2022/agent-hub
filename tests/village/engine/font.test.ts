import { describe, expect, it } from "vitest";
import {
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  glyphFor,
  hasGlyph,
  measureText,
  missingGlyph,
} from "../../../lib/village/engine";

const FIRST_PRINTABLE = 32;
const LAST_PRINTABLE = 126;
const printableCharacters = Array.from({ length: LAST_PRINTABLE - FIRST_PRINTABLE + 1 }, (_, offset) =>
  String.fromCharCode(FIRST_PRINTABLE + offset),
);

describe("pixel font", () => {
  it("has a glyph for every letter, digit and mark on a plain keyboard", () => {
    expect(printableCharacters.filter((character) => !hasGlyph(character))).toEqual([]);
  });

  it("every glyph is the same size", () => {
    for (const character of printableCharacters) {
      const glyph = glyphFor(character);
      expect(glyph, character).toHaveLength(GLYPH_HEIGHT);
      for (const row of glyph) {
        expect(row, character).toMatch(new RegExp(`^[#.]{${GLYPH_WIDTH}}$`));
      }
    }
  });

  it("no two characters look the same", () => {
    const charactersByShape = new Map<string, string[]>();
    for (const character of printableCharacters) {
      const shape = glyphFor(character).join("\n");
      charactersByShape.set(shape, [...(charactersByShape.get(shape) ?? []), character]);
    }
    const lookalikes = [...charactersByShape.values()].filter((group) => group.length > 1);
    expect(lookalikes).toEqual([]);
  });

  it("only the space is empty", () => {
    const empty = printableCharacters.filter((character) => !glyphFor(character).join("").includes("#"));
    expect(empty).toEqual([" "]);
  });

  it("looks up a letter by its rows", () => {
    expect(glyphFor("T")).toEqual([
      "#####",
      "..#..",
      "..#..",
      "..#..",
      "..#..",
      "..#..",
      "..#..",
      ".....",
      ".....",
    ]);
  });

  it("keeps capitals and digits above the line; only tails go below", () => {
    const rowsBelowTheLine = (character: string) => glyphFor(character).slice(7).join("");
    const standsOnTheLine = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"];
    expect(standsOnTheLine.filter((character) => rowsBelowTheLine(character).includes("#"))).toEqual([]);
    for (const tailed of ["g", "j", "p", "q", "y"]) {
      expect(rowsBelowTheLine(tailed), tailed).toContain("#");
    }
  });

  it("gives a hollow box for a character it does not know", () => {
    expect(hasGlyph("é")).toBe(false);
    expect(glyphFor("é")).toBe(missingGlyph);
    expect(glyphFor("")).toBe(missingGlyph);
  });

  it("measures text", () => {
    expect(measureText("")).toEqual({ width: 0, height: 9 });
    expect(measureText("A")).toEqual({ width: 5, height: 9 });
    expect(measureText("Hub")).toEqual({ width: 17, height: 9 });
    expect(measureText("one\nthree")).toEqual({ width: 29, height: 19 });
  });
});
