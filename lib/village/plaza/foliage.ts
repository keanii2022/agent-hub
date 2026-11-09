import type { ColourName, Sprite } from "../engine";

// Leaves are worked out, not typed in by hand: a treetop is a handful of round
// clumps, each lit from above, so every tree gets the same lighting.

export type FoliageTones = {
  /** The very top edge, catching the last of the sun. */
  readonly rim: ColourName;
  readonly light: ColourName;
  readonly mid: ColourName;
  readonly dark: ColourName;
  readonly outline: ColourName;
};

/** Later clumps sit in front of earlier ones. */
export type Clump = { readonly x: number; readonly y: number; readonly radius: number };

type Pixels = (ColourName | null)[];

function outlined(width: number, height: number, pixels: Pixels, outline: ColourName): Pixels {
  const isFilled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && pixels[y * width + x] !== null;
  return pixels.map((colour, index) => {
    if (colour === null) return null;
    const x = index % width;
    const y = Math.floor(index / width);
    const onEdge =
      !isFilled(x - 1, y) || !isFilled(x + 1, y) || !isFilled(x, y - 1) || !isFilled(x, y + 1);
    return onEdge ? outline : colour;
  });
}

function isOnChequer(x: number, y: number): boolean {
  return (x + y) % 2 === 0;
}

export function clumpedFoliage(
  width: number,
  height: number,
  clumps: readonly Clump[],
  tones: FoliageTones,
): Sprite {
  const frontClumpAt = (x: number, y: number): Clump | null => {
    for (let index = clumps.length - 1; index >= 0; index -= 1) {
      const clump = clumps[index];
      if (Math.hypot(x - clump.x, y - clump.y) <= clump.radius + 0.4) return clump;
    }
    return null;
  };

  const pixels: Pixels = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const clump = frontClumpAt(x, y);
      if (!clump) {
        pixels.push(null);
        continue;
      }
      // Low numbers face the sky, high numbers face the ground.
      const facing = ((y - clump.y) * 0.9 + (x - clump.x) * 0.25) / clump.radius;
      if (facing < -0.5 || (facing < -0.3 && isOnChequer(x, y))) pixels.push(tones.light);
      else if (facing > 0.35 || (facing > 0.15 && isOnChequer(x, y))) pixels.push(tones.dark);
      else pixels.push(tones.mid);
    }
  }

  const withOutline = outlined(width, height, pixels, tones.outline);
  const rimmed = withOutline.map((colour, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const justUnderTheTopEdge =
      colour === tones.light && y >= 2 && pixels[(y - 2) * width + x] === null && x % 3 !== 0;
    return justUnderTheTopEdge ? tones.rim : colour;
  });
  return { width, height, pixels: rimmed };
}

/** One skirt of a fir tree: a triangle from `top` down to `bottom`, `halfWidth` wide at its foot. */
export type Skirt = { readonly top: number; readonly bottom: number; readonly halfWidth: number };

export function skirtedFoliage(
  width: number,
  height: number,
  skirts: readonly Skirt[],
  tones: FoliageTones,
): Sprite {
  const middle = Math.floor(width / 2);

  const pixels: Pixels = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const fromMiddle = x - middle;
      // Upper skirts hang over lower ones, so the first one that covers the pixel wins.
      const skirt = skirts.find((candidate) => {
        if (y < candidate.top || y > candidate.bottom) return false;
        const partDown = (y - candidate.top) / (candidate.bottom - candidate.top);
        const halfWidthHere = Math.round(partDown * candidate.halfWidth);
        const hangsLower = y === candidate.bottom && Math.abs(fromMiddle) % 3 === 1;
        return Math.abs(fromMiddle) <= halfWidthHere - (hangsLower ? 1 : 0);
      });
      if (!skirt) {
        pixels.push(null);
        continue;
      }
      const partDown = (y - skirt.top) / (skirt.bottom - skirt.top);
      const halfWidthHere = Math.max(1, Math.round(partDown * skirt.halfWidth));
      const partAcross = fromMiddle / halfWidthHere;
      if (y >= skirt.bottom - 1 || partAcross > 0.45) pixels.push(tones.dark);
      else if (partAcross < -0.35 || (partDown < 0.4 && isOnChequer(x, y))) pixels.push(tones.light);
      else pixels.push(tones.mid);
    }
  }

  const withOutline = outlined(width, height, pixels, tones.outline);
  return { width, height, pixels: withOutline };
}

/** Sets single pixels of a sprite, for example flowers dotted over a bush. Pixels outside the sprite's shape are left alone. */
export function dotted(
  sprite: Sprite,
  dots: readonly { x: number; y: number; colour: ColourName }[],
): Sprite {
  const pixels = [...sprite.pixels];
  for (const dot of dots) {
    const index = dot.y * sprite.width + dot.x;
    if (pixels[index] !== null && pixels[index] !== undefined) pixels[index] = dot.colour;
  }
  return { width: sprite.width, height: sprite.height, pixels };
}
