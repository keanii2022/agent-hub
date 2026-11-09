/** The part of a page address after the `?`, as Next.js hands it to a page. */
export type PageQuery = Record<string, string | string[] | undefined>;

export type FixedFrame = {
  /** Set: the screen starts paused on exactly this moment, so a screenshot is always the same. */
  readonly fixedTimeMs: number | null;
  /** Set: the screen holds this scale instead of growing to fit the window. */
  readonly pixelScale: number | null;
};

function wholeNumberFrom(value: string | string[] | undefined, smallest: number): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= smallest ? number : null;
}

// ?time=4200   starts paused 4200 ms in
// ?scale=2     holds the scale at 2
// Anything that is not a plain whole number is ignored, never guessed at.
export function frameFromQuery(query: PageQuery): FixedFrame {
  return {
    fixedTimeMs: wholeNumberFrom(query.time, 0),
    pixelScale: wholeNumberFrom(query.scale, 1),
  };
}
