import { expect, test, type Locator, type Page } from "@playwright/test";
import { palette, type ColourName } from "../lib/village/engine";
import { glassOfWindow, signStyles, villageHouses } from "../lib/village/houses";
import type { Rect } from "../lib/village/plaza";
import { expectTheFrozenVillage } from "./frozen-hub";

// Paused at a known moment, the village always paints the same frame.
const FIXED_TIME_MS = 4200;

const projectHouses = villageHouses.filter((house) => !house.isForSale);
const housesForSale = villageHouses.filter((house) => house.isForSale);

async function openVillage(page: Page, query: string): Promise<Locator> {
  await page.goto(`/${query}`);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expectTheFrozenVillage(canvas);
  return canvas;
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

/** Every colour used in one part of the picture, as the palette spells them. */
async function coloursIn(canvas: Locator, area: Rect): Promise<Set<string>> {
  const numbers = (await pictureOf(canvas, area)).split(",").map(Number);
  const colours = new Set<string>();
  for (let offset = 0; offset < numbers.length; offset += 4) {
    const [red, green, blue] = numbers.slice(offset, offset + 3);
    colours.add("#" + [red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join(""));
  }
  return colours;
}

function hex(colour: ColourName): string {
  return palette[colour];
}

test("the home page shows the approval-desk house, the team house and two houses for sale", async ({ page }) => {
  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  expect(projectHouses.map((house) => house.project)).toContain("approval-desk");
  expect(projectHouses).toHaveLength(2);
  expect(housesForSale).toHaveLength(2);

  for (const house of projectHouses) {
    const style = signStyles[house.sign!.style];
    const sign = await coloursIn(canvas, house.sign!.board);
    expect(sign, `${house.name}: neon letters`).toContain(hex(style.letters));
    expect(sign, `${house.name}: glow round the letters`).toContain(hex(style.lettersGlow));
    const firstWindow = await coloursIn(canvas, glassOfWindow(house.build, house.windows[0]));
    expect(firstWindow, `${house.name}: a lit window`).toContain(hex("lamp"));
  }
  for (const house of housesForSale) {
    const board = await coloursIn(canvas, house.forSaleBoard!);
    expect(board, "for-sale board").toContain(hex("cream"));
    expect(board, "for-sale words").toContain(hex("ember"));
    const lot = await coloursIn(canvas, house.lot.area);
    for (const light of ["lamp", "lime", "cyan", "pink"] as const) {
      expect(lot, `a house for sale is dark: ${light}`).not.toContain(hex(light));
    }
  }
});

test("each neon sign is alive: its lights move while the page runs", async ({ page }) => {
  const canvas = await openVillage(page, "?scale=2");
  for (const house of projectHouses) {
    const atFirst = await pictureOf(canvas, house.sign!.bounds);
    await expect.poll(() => pictureOf(canvas, house.sign!.bounds), house.name).not.toBe(atFirst);
  }
});

test("a fixed time holds the neon still", async ({ page }) => {
  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  for (const house of projectHouses) {
    const atFirst = await pictureOf(canvas, house.sign!.bounds);
    await page.waitForTimeout(400);
    expect(await pictureOf(canvas, house.sign!.bounds), house.name).toBe(atFirst);
  }
});

test("the picture's description names every house, for whoever cannot see it", async ({ page }) => {
  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  const description = (await canvas.getAttribute("aria-label")) ?? "";
  for (const house of projectHouses) expect(description).toContain(house.project!);
  expect(description).toContain("2 houses for sale");
});

test("H10: a house on demo data is marked DEMO, on its sign and in the picture's description", async ({ page }) => {
  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  const description = (await canvas.getAttribute("aria-label")) ?? "";
  for (const house of projectHouses) {
    expect(house.data).toBe("demo");
    expect(description).toContain(`${house.project} (demo)`);
    const whereTheTagRides: Rect = { x: house.tagSpot.x - 26, y: house.tagSpot.y - 10, width: 27, height: 10 };
    const tag = await coloursIn(canvas, whereTheTagRides);
    expect(tag, `${house.name}: tag plate`).toContain(hex("sand"));
    expect(tag, `${house.name}: tag words`).toContain(hex("ember"));
  }
});

test("H12: nothing the houses add to the page is a rule code", async ({ page }) => {
  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  const ruleCode = /\b[HQ]\d{1,2}\b/;
  expect(await canvas.getAttribute("aria-label")).not.toMatch(ruleCode);
  await expect(page.locator("body")).not.toContainText(ruleCode);
});
