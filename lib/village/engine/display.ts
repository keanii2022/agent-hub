import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./screen";
import type { Surface } from "./surface";

export type Display = {
  /** How many real screen pixels wide and tall one village pixel is shown. */
  readonly pixelScale: number;
  setPixelScale(scale: number): void;
  present(surface: Surface): void;
};

function context2dOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw on a canvas");
  return context;
}

export function createDisplay(
  canvas: HTMLCanvasElement,
  width: number = SCREEN_WIDTH,
  height: number = SCREEN_HEIGHT,
): Display {
  const context = context2dOf(canvas);
  const unscaledCanvas = document.createElement("canvas");
  unscaledCanvas.width = width;
  unscaledCanvas.height = height;
  const unscaledContext = context2dOf(unscaledCanvas);
  let pixelScale = 0;

  // The scale counts real screen pixels, not CSS pixels. On a sharp display one
  // CSS pixel is several real ones, and a whole number of CSS pixels could
  // still land village pixels between real ones.
  function setPixelScale(scale: number): void {
    if (!Number.isInteger(scale) || scale < 1) {
      throw new RangeError(`The pixel scale must be a whole number from 1 up, not ${scale}`);
    }
    pixelScale = scale;
    canvas.width = width * scale;
    canvas.height = height * scale;
    canvas.style.width = `${canvas.width / window.devicePixelRatio}px`;
    canvas.style.height = `${canvas.height / window.devicePixelRatio}px`;
    canvas.style.imageRendering = "pixelated";
    canvas.dataset.pixelScale = String(scale);
    // Changing a canvas's size resets its context, which turns smoothing back
    // on. It has to be turned off again after every resize or the picture blurs.
    context.imageSmoothingEnabled = false;
  }

  function present(surface: Surface): void {
    unscaledContext.putImageData(new ImageData(surface.pixels, surface.width, surface.height), 0, 0);
    context.drawImage(unscaledCanvas, 0, 0, canvas.width, canvas.height);
  }

  setPixelScale(1);

  return {
    get pixelScale() {
      return pixelScale;
    },
    setPixelScale,
    present,
  };
}
