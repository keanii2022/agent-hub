import type { ColourName } from "./palette";

export const TRANSPARENT_LETTER = ".";

export type Sprite = {
  readonly width: number;
  readonly height: number;
  /** Row by row from the top left. `null` is a see-through pixel. */
  readonly pixels: readonly (ColourName | null)[];
};

export type ColourKey = Readonly<Record<string, ColourName>>;

export function spriteFromRows(rows: readonly string[], colourKey: ColourKey): Sprite {
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error("A sprite needs at least one pixel");

  const pixels: (ColourName | null)[] = [];
  rows.forEach((row, rowNumber) => {
    if (row.length !== width) {
      throw new Error(
        `Sprite row ${rowNumber} is ${row.length} pixels wide; the first row is ${width}`,
      );
    }
    for (const letter of row) {
      if (letter === TRANSPARENT_LETTER) {
        pixels.push(null);
        continue;
      }
      const colour = colourKey[letter];
      if (!colour) {
        throw new Error(`Sprite row ${rowNumber} uses "${letter}", which is not in its colour key`);
      }
      pixels.push(colour);
    }
  });

  return { width, height: rows.length, pixels };
}

export type Animation = {
  readonly frames: readonly Sprite[];
  readonly frameMs: number;
  /** Defaults to true. When false, the last frame stays up. */
  readonly loops?: boolean;
};

export function frameIndexAt(
  timeMs: number,
  frameMs: number,
  frameCount: number,
  loops: boolean = true,
): number {
  if (frameCount < 1 || !(frameMs > 0)) {
    throw new RangeError("An animation needs at least one frame and a frame time above zero");
  }
  const framesPassed = Math.floor(Math.max(0, timeMs) / frameMs);
  return loops ? framesPassed % frameCount : Math.min(framesPassed, frameCount - 1);
}

export function frameAt(animation: Animation, timeMs: number): Sprite {
  const index = frameIndexAt(
    timeMs,
    animation.frameMs,
    animation.frames.length,
    animation.loops ?? true,
  );
  return animation.frames[index];
}
