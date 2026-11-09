import { describe, expect, it } from "vitest";
import { SCREEN_HEIGHT, SCREEN_WIDTH, wholeScaleThatFits } from "../../../lib/village/engine";

describe("screen scaling", () => {
  it("has a fixed size", () => {
    expect([SCREEN_WIDTH, SCREEN_HEIGHT]).toEqual([384, 216]);
  });

  it("fills common wide screens exactly", () => {
    expect(wholeScaleThatFits(1920, 1080)).toBe(5);
    expect(wholeScaleThatFits(3840, 2160)).toBe(10);
  });

  it("picks the largest whole scale that fits", () => {
    expect(wholeScaleThatFits(SCREEN_WIDTH * 2, SCREEN_HEIGHT * 2)).toBe(2);
    expect(wholeScaleThatFits(SCREEN_WIDTH * 3, SCREEN_HEIGHT * 3)).toBe(3);
    expect(wholeScaleThatFits(1280, 672)).toBe(3);
  });

  it("never picks a part scale: one pixel short drops to the scale below", () => {
    expect(wholeScaleThatFits(SCREEN_WIDTH * 3 - 1, SCREEN_HEIGHT * 3)).toBe(2);
    expect(wholeScaleThatFits(SCREEN_WIDTH * 3, SCREEN_HEIGHT * 3 - 1)).toBe(2);
  });

  it("is held back by whichever side is tighter", () => {
    expect(wholeScaleThatFits(4000, SCREEN_HEIGHT * 2)).toBe(2);
    expect(wholeScaleThatFits(SCREEN_WIDTH * 2, 4000)).toBe(2);
  });

  it("never goes below 1, even with no room", () => {
    expect(wholeScaleThatFits(100, 100)).toBe(1);
    expect(wholeScaleThatFits(0, 0)).toBe(1);
    expect(wholeScaleThatFits(Number.NaN, 500)).toBe(1);
  });

  it("works for other screen sizes", () => {
    expect(wholeScaleThatFits(100, 100, 16, 16)).toBe(6);
  });
});
