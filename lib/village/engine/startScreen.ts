import { createClock, type Clock } from "./clock";
import { createDisplay } from "./display";
import { startLoop } from "./loop";
import { wholeScaleThatFits } from "./screen";
import { createSurface, type Surface } from "./surface";

export type ScreenOptions = {
  /** Paints one frame. Called every screen refresh, paused or not. */
  draw(surface: Surface, timeMs: number): void;
  /** Pass a paused clock with `startAtMs` to hold one known frame, for example in a screenshot test. */
  clock?: Clock;
  /** A fixed scale. Left out, the screen grows to the largest whole scale that fits the canvas's parent. */
  pixelScale?: number;
};

export type RunningScreen = {
  readonly clock: Clock;
  readonly surface: Surface;
  stop(): void;
};

export function startScreen(canvas: HTMLCanvasElement, options: ScreenOptions): RunningScreen {
  const clock = options.clock ?? createClock();
  const surface = createSurface();
  const display = createDisplay(canvas, surface.width, surface.height);

  function drawFrame(): void {
    options.draw(surface, clock.timeMs);
    display.present(surface);
  }

  let stopWatchingSize = (): void => {};

  if (options.pixelScale !== undefined) {
    display.setPixelScale(options.pixelScale);
  } else if (canvas.parentElement) {
    // The parent must get its size from the page layout, not from the canvas
    // inside it. Otherwise the canvas decides its own room and can never grow.
    const room = canvas.parentElement;
    const fitRoom = (): void => {
      const scale = wholeScaleThatFits(
        room.clientWidth * window.devicePixelRatio,
        room.clientHeight * window.devicePixelRatio,
        surface.width,
        surface.height,
      );
      if (scale === display.pixelScale) return;
      display.setPixelScale(scale);
      // Resizing wipes the canvas, so repaint now and not a frame later.
      drawFrame();
    };
    const sizeWatcher = new ResizeObserver(fitRoom);
    sizeWatcher.observe(room);
    stopWatchingSize = () => sizeWatcher.disconnect();
    fitRoom();
  }

  drawFrame();

  const stopLoop = startLoop((realElapsedMs) => {
    clock.advance(realElapsedMs);
    drawFrame();
  });

  return {
    clock,
    surface,
    stop() {
      stopLoop();
      stopWatchingSize();
    },
  };
}
