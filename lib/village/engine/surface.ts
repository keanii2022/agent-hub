import { colourNameOf, rgbOf, type ColourName } from "./palette";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./screen";

const BYTES_PER_PIXEL = 4;

// The picture lives in plain memory (red, green, blue, opacity per pixel), not
// in a canvas. Drawing is then ordinary arithmetic: nothing can smooth it, and
// tests can read it back without a browser.
export type Surface = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
};

export function createSurface(
  width: number = SCREEN_WIDTH,
  height: number = SCREEN_HEIGHT,
): Surface {
  return { width, height, pixels: new Uint8ClampedArray(width * height * BYTES_PER_PIXEL) };
}

function isInside(surface: Surface, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < surface.width && y < surface.height;
}

export function setPixel(surface: Surface, x: number, y: number, colour: ColourName): void {
  if (!isInside(surface, x, y)) return;
  const [red, green, blue] = rgbOf(colour);
  const offset = (y * surface.width + x) * BYTES_PER_PIXEL;
  surface.pixels[offset] = red;
  surface.pixels[offset + 1] = green;
  surface.pixels[offset + 2] = blue;
  surface.pixels[offset + 3] = 255;
}

export function colourAt(surface: Surface, x: number, y: number): ColourName | null {
  if (!isInside(surface, x, y)) return null;
  const offset = (y * surface.width + x) * BYTES_PER_PIXEL;
  if (surface.pixels[offset + 3] !== 255) return null;
  return colourNameOf(
    surface.pixels[offset],
    surface.pixels[offset + 1],
    surface.pixels[offset + 2],
  );
}
