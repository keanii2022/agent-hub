import {
  GLYPH_HEIGHT,
  GLYPH_INK,
  GLYPH_WIDTH,
  LETTER_GAP,
  LINE_HEIGHT,
  glyphFor,
} from "./font";
import type { ColourName } from "./palette";
import type { Sprite } from "./sprite";
import { setPixel, type Surface } from "./surface";

// Every helper rounds its position to a whole pixel first: moving things keep
// in-between positions, and a pixel screen has nowhere to put half a pixel.

export function clear(surface: Surface, colour: ColourName): void {
  fillRect(surface, 0, 0, surface.width, surface.height, colour);
}

export function fillRect(
  surface: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: ColourName,
): void {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(surface.width, Math.round(x) + Math.round(width));
  const bottom = Math.min(surface.height, Math.round(y) + Math.round(height));
  for (let pixelY = top; pixelY < bottom; pixelY += 1) {
    for (let pixelX = left; pixelX < right; pixelX += 1) {
      setPixel(surface, pixelX, pixelY, colour);
    }
  }
}

export function outlineRect(
  surface: Surface,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: ColourName,
): void {
  fillRect(surface, x, y, width, 1, colour);
  fillRect(surface, x, Math.round(y) + Math.round(height) - 1, width, 1, colour);
  fillRect(surface, x, y, 1, height, colour);
  fillRect(surface, Math.round(x) + Math.round(width) - 1, y, 1, height, colour);
}

export type SpriteOptions = {
  /** Mirror left to right, for example a character walking the other way. */
  flipX?: boolean;
};

export function drawSprite(
  surface: Surface,
  sprite: Sprite,
  x: number,
  y: number,
  options: SpriteOptions = {},
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  for (let row = 0; row < sprite.height; row += 1) {
    for (let column = 0; column < sprite.width; column += 1) {
      const sourceColumn = options.flipX ? sprite.width - 1 - column : column;
      const colour = sprite.pixels[row * sprite.width + sourceColumn];
      if (colour) setPixel(surface, left + column, top + row, colour);
    }
  }
}

/** `x`, `y` is the top left of the first letter. `\n` starts a new line. */
export function drawText(
  surface: Surface,
  text: string,
  x: number,
  y: number,
  colour: ColourName,
): void {
  const left = Math.round(x);
  const top = Math.round(y);
  text.split("\n").forEach((line, lineNumber) => {
    [...line].forEach((character, characterNumber) => {
      const glyph = glyphFor(character);
      const glyphLeft = left + characterNumber * (GLYPH_WIDTH + LETTER_GAP);
      const glyphTop = top + lineNumber * LINE_HEIGHT;
      for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
        for (let column = 0; column < GLYPH_WIDTH; column += 1) {
          if (glyph[row][column] === GLYPH_INK) {
            setPixel(surface, glyphLeft + column, glyphTop + row, colour);
          }
        }
      }
    });
  });
}
