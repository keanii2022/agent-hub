import { expect, test, type Locator, type Page } from "@playwright/test";
import { SCREEN_HEIGHT, SCREEN_WIDTH, colourNames, palette } from "../lib/village/engine";

// Paused at a known moment, the lab always paints the same frame.
const FIXED_TIME_MS = 4200;

async function openLab(page: Page, query: string, expectedScale: number): Promise<Locator> {
  await page.goto(`/lab${query}`);
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const canvas = page.getByRole("img", { name: /Test picture/ });
  await expect(canvas).toHaveAttribute("data-pixel-scale", String(expectedScale));
  return canvas;
}

type ScreenshotReading = {
  width: number;
  height: number;
  /** Blocks of scale x scale screen pixels that are not one flat colour. */
  blurredBlocks: number;
  colours: string[];
};

// Reads the picture as it really reached the screen (a screenshot), not the
// canvas's own memory, so blur added anywhere on the way would be caught.
async function readScreenshot(page: Page, canvas: Locator, scale: number): Promise<ScreenshotReading> {
  const screenshot = await canvas.screenshot();
  return page.evaluate(
    async ({ pngBase64, scale }) => {
      const bytes = Uint8Array.from(atob(pngBase64), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }), {
        colorSpaceConversion: "none",
      });
      const reader = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d");
      if (!reader) throw new Error("Could not read the screenshot");
      reader.drawImage(bitmap, 0, 0);
      const { data, width, height } = reader.getImageData(0, 0, bitmap.width, bitmap.height);

      const hexAt = (x: number, y: number): string => {
        const offset = (y * width + x) * 4;
        return (
          "#" +
          [data[offset], data[offset + 1], data[offset + 2]]
            .map((part) => part.toString(16).padStart(2, "0"))
            .join("")
        );
      };

      const colours = new Set<string>();
      let blurredBlocks = 0;
      for (let blockY = 0; blockY < height; blockY += scale) {
        for (let blockX = 0; blockX < width; blockX += scale) {
          const blockColour = hexAt(blockX, blockY);
          colours.add(blockColour);
          let flat = true;
          for (let y = blockY; y < blockY + scale && y < height; y += 1) {
            for (let x = blockX; x < blockX + scale && x < width; x += 1) {
              if (hexAt(x, y) !== blockColour) flat = false;
            }
          }
          if (!flat) blurredBlocks += 1;
        }
      }
      return { width, height, blurredBlocks, colours: [...colours] };
    },
    { pngBase64: screenshot.toString("base64"), scale },
  );
}

for (const scale of [2, 3]) {
  test(`the lab stays sharp at ${scale}x: every pixel is a flat square in a palette colour`, async ({
    page,
  }) => {
    const canvas = await openLab(page, `?time=${FIXED_TIME_MS}&scale=${scale}`, scale);
    const reading = await readScreenshot(page, canvas, scale);

    expect([reading.width, reading.height]).toEqual([SCREEN_WIDTH * scale, SCREEN_HEIGHT * scale]);
    expect(reading.blurredBlocks).toBe(0);
    const paletteColours: string[] = colourNames.map((name) => palette[name]);
    expect(reading.colours.filter((colour) => !paletteColours.includes(colour))).toEqual([]);
  });

  test(`the lab picture at ${scale}x matches its saved screenshot`, async ({ page }) => {
    const canvas = await openLab(page, `?time=${FIXED_TIME_MS}&scale=${scale}`, scale);
    await expect(canvas).toHaveScreenshot(`lab-${scale}x.png`, { maxDiffPixels: 0, threshold: 0 });
  });
}

test("the lab shows every palette colour", async ({ page }) => {
  const canvas = await openLab(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  const reading = await readScreenshot(page, canvas, 2);
  const missing = colourNames.filter((name) => !reading.colours.includes(palette[name]));
  expect(missing).toEqual([]);
});

test("the lab fits the window with a whole scale when none is asked for", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const canvas = await openLab(page, `?time=${FIXED_TIME_MS}`, 3);
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  const reading = await readScreenshot(page, canvas, 2);
  expect([reading.width, reading.height]).toEqual([SCREEN_WIDTH * 2, SCREEN_HEIGHT * 2]);
  expect(reading.blurredBlocks).toBe(0);
});

test("pause stops the animation and play starts it again", async ({ page }) => {
  const canvas = await openLab(page, "?scale=2", 2);
  const picture = () => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  const twoFramesPass = () =>
    page.evaluate(
      () =>
        new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
    );

  const running = await picture();
  await expect.poll(picture).not.toBe(running);

  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  // The frame after the click paints the word "paused"; the picture must hold from then on.
  await twoFramesPass();
  const paused = await picture();
  await page.waitForTimeout(700);
  expect(await picture()).toBe(paused);

  await page.getByRole("button", { name: "Play" }).click();
  await expect.poll(picture).not.toBe(paused);
});

test("H12: the lab page shows no rule codes", async ({ page }) => {
  await openLab(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  await expect(page.locator("body")).not.toContainText(/\bH\d{1,2}\b/);
});
