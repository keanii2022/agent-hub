import { expect, test, type Locator, type Page } from "@playwright/test";
import { HUMAN_HEIGHT, HUMAN_WIDTH } from "../lib/village/characters/human";
import { SCREEN_HEIGHT, SCREEN_WIDTH, palette } from "../lib/village/engine";
import { desk, type Rect } from "../lib/village/plaza";
import { expectTheFrozenVillage } from "./frozen-hub";

// Paused at a known moment, the plaza always paints the same frame.
const FIXED_TIME_MS = 4200;
const COMPUTER_NAME = "The computer on the desk";

const humanBox: Rect = { ...desk.humanAt, width: HUMAN_WIDTH, height: HUMAN_HEIGHT };

async function openPlaza(page: Page, query: string, expectedScale: number): Promise<Locator> {
  await page.goto(`/${query}`);
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", String(expectedScale));
  await expectTheFrozenVillage(canvas);
  return canvas;
}

function computerButton(page: Page): Locator {
  return page.getByRole("button", { name: COMPUTER_NAME });
}

/** The colours of one part of the picture, given in village pixels, as one piece of text to compare. */
function pictureOf(canvas: Locator, area: Rect): Promise<string> {
  return canvas.evaluate((element: HTMLCanvasElement, { x, y, width, height }) => {
    const scale = Number(element.dataset.pixelScale);
    const context = element.getContext("2d");
    if (!context) throw new Error("Could not read the canvas");
    return context.getImageData(x * scale, y * scale, width * scale, height * scale).data.join(",");
  }, area);
}

async function colourAt(canvas: Locator, x: number, y: number): Promise<string> {
  const [red, green, blue] = (await pictureOf(canvas, { x, y, width: 1, height: 1 })).split(",");
  return "#" + [red, green, blue].map((part) => Number(part).toString(16).padStart(2, "0")).join("");
}

const focusMarkCorner = { x: desk.computerBounds.x - 2, y: desk.computerBounds.y - 2 };

test("the plaza matches its saved screenshot", async ({ page }) => {
  const canvas = await openPlaza(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  await expect(canvas).toHaveScreenshot("plaza-2x.png", { maxDiffPixels: 0, threshold: 0 });
});

test("a fixed time holds one frame still", async ({ page }) => {
  const canvas = await openPlaza(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  const wholePicture = { x: 0, y: 0, width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
  const first = await pictureOf(canvas, wholePicture);
  await page.waitForTimeout(700);
  expect(await pictureOf(canvas, wholePicture)).toBe(first);
});

test("the human moves and his computer shows what he types", async ({ page }) => {
  const canvas = await openPlaza(page, "?scale=2", 2);

  const humanAtFirst = await pictureOf(canvas, humanBox);
  await expect.poll(() => pictureOf(canvas, humanBox)).not.toBe(humanAtFirst);

  const glassAtFirst = await pictureOf(canvas, desk.computerGlass);
  await expect.poll(() => pictureOf(canvas, desk.computerGlass)).not.toBe(glassAtFirst);
});

test("the computer is reached with the keyboard and shows a focus mark", async ({ page }) => {
  const canvas = await openPlaza(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  expect(await colourAt(canvas, focusMarkCorner.x, focusMarkCorner.y)).not.toBe(palette.lamp);

  await page.keyboard.press("Tab");
  await expect(computerButton(page)).toBeFocused();
  await expect.poll(() => colourAt(canvas, focusMarkCorner.x, focusMarkCorner.y)).toBe(palette.lamp);
  await expect(canvas).toHaveScreenshot("plaza-computer-focused-2x.png", {
    maxDiffPixels: 0,
    threshold: 0,
  });

  await computerButton(page).blur();
  await expect.poll(() => colourAt(canvas, focusMarkCorner.x, focusMarkCorner.y)).not.toBe(palette.lamp);
});

test("the computer is reached with a click on its picture, and does nothing yet", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const canvas = await openPlaza(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  const addressBefore = page.url();

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("The canvas is not on the page");
  const pagePixelsPerVillagePixel = canvasBox.width / SCREEN_WIDTH;
  const middleOfGlass = {
    x: desk.computerGlass.x + desk.computerGlass.width / 2,
    y: desk.computerGlass.y + desk.computerGlass.height / 2,
  };
  await page.mouse.click(
    canvasBox.x + middleOfGlass.x * pagePixelsPerVillagePixel,
    canvasBox.y + middleOfGlass.y * pagePixelsPerVillagePixel,
  );

  await expect(computerButton(page)).toBeFocused();
  await computerButton(page).press("Enter");
  expect(page.url()).toBe(addressBefore);
  expect(pageErrors).toEqual([]);
});

test("the computer's button stays over the computer at every scale", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const canvas = await openPlaza(page, `?time=${FIXED_TIME_MS}`, 3);

  async function expectButtonOverComputer(): Promise<void> {
    await expect
      .poll(async () => {
        const canvasBox = await canvas.boundingBox();
        const buttonBox = await computerButton(page).boundingBox();
        if (!canvasBox || !buttonBox) return null;
        const pagePixelsPerVillagePixel = canvasBox.width / SCREEN_WIDTH;
        return [
          (buttonBox.x - canvasBox.x) / pagePixelsPerVillagePixel,
          (buttonBox.y - canvasBox.y) / pagePixelsPerVillagePixel,
          buttonBox.width / pagePixelsPerVillagePixel,
          buttonBox.height / pagePixelsPerVillagePixel,
        ].map((villagePixels) => Math.round(villagePixels * 10) / 10);
      })
      .toEqual([
        desk.computerBounds.x,
        desk.computerBounds.y,
        desk.computerBounds.width,
        desk.computerBounds.height,
      ]);
  }

  await expectButtonOverComputer();
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expectButtonOverComputer();
});

test("H12: the plaza page shows no rule codes", async ({ page }) => {
  const canvas = await openPlaza(page, `?time=${FIXED_TIME_MS}&scale=2`, 2);
  const ruleCode = /\bH\d{1,2}\b/;
  await expect(page.locator("body")).not.toContainText(ruleCode);
  expect(await canvas.getAttribute("aria-label")).not.toMatch(ruleCode);
  expect(COMPUTER_NAME).not.toMatch(ruleCode);
});
