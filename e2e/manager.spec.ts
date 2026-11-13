import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  MANAGER_HEIGHT,
  MANAGER_WIDTH,
  describeManagersRound,
  legStartsOf,
  managerPoints,
  managerRoundFor,
  managerStateAt,
  type ManagerState,
} from "../lib/village/characters/manager";
import { palette } from "../lib/village/engine";
import { housesToVisit, villageHouses } from "../lib/village/houses";
import type { Rect } from "../lib/village/plaza";
import { expectTheFrozenVillage } from "./frozen-hub";
import { sceneWords } from "./scene-words";

const round = managerRoundFor(villageHouses);
const legStarts = legStartsOf(round);
const occupied = housesToVisit(villageHouses);

/** A whole millisecond a little way into a leg of the round, for a page address. */
function momentOf(doing: string, msIntoLeg: number = 60): number {
  const legNumber = round.legs.findIndex((leg) => leg.doing === doing);
  if (legNumber < 0) throw new Error(`The round has no leg "${doing}"`);
  return Math.floor(legStarts[legNumber]) + msIntoLeg;
}

async function openVillageAt(page: Page, timeMs: number | null): Promise<Locator> {
  await page.goto(timeMs === null ? "/?scale=2" : `/?time=${timeMs}&scale=2`);
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
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

async function colourAt(canvas: Locator, x: number, y: number): Promise<string> {
  const [red, green, blue] = (await pictureOf(canvas, { x, y, width: 1, height: 1 })).split(",");
  return "#" + [red, green, blue].map((part) => Number(part).toString(16).padStart(2, "0")).join("");
}

async function coloursIn(canvas: Locator, area: Rect): Promise<Set<string>> {
  const numbers = (await pictureOf(canvas, area)).split(",").map(Number);
  const colours = new Set<string>();
  for (let offset = 0; offset < numbers.length; offset += 4) {
    const [red, green, blue] = numbers.slice(offset, offset + 3);
    colours.add("#" + [red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join(""));
  }
  return colours;
}

function boxOf(manager: ManagerState): Rect {
  return {
    x: Math.round(manager.at.x) - managerPoints.feet.x,
    y: Math.round(manager.at.y) - managerPoints.feet.y,
    width: MANAGER_WIDTH,
    height: MANAGER_HEIGHT,
  };
}

test("the manager stands at every door of his round, and at the desk, where his state says", async ({ page }) => {
  const stops = [
    ...occupied.flatMap((house) => [`knocking at ${house.name}`, `waiting at ${house.name}`]),
    "standing at the desk",
  ];
  for (const doing of stops) {
    const timeMs = momentOf(doing);
    const manager = managerStateAt(timeMs, villageHouses);
    expect(manager.doing).toBe(doing);

    const canvas = await openVillageAt(page, timeMs);
    const box = boxOf(manager);
    const hatBand = { x: box.x + managerPoints.hatBand.x, y: box.y + managerPoints.hatBand.y };
    expect(await colourAt(canvas, hatBand.x, hatBand.y), doing).toBe(palette.ember);
    expect(await coloursIn(canvas, box), doing).toContain(palette.mist);
  }
});

test("the manager knocks with his hand on the door, then draws it back", async ({ page }) => {
  const house = occupied[0];
  const knuckles = {
    x: house.doorstep.x - managerPoints.feet.x + managerPoints.knuckles.x,
    y: house.knockSpot.y,
  };
  const onTheDoor = momentOf(`knocking at ${house.name}`, 60);
  const drawnBack = momentOf(`knocking at ${house.name}`, 260);
  expect(managerStateAt(onTheDoor, villageHouses).knucklesOnDoor).toBe(true);
  expect(managerStateAt(drawnBack, villageHouses).knucklesOnDoor).toBe(false);

  let canvas = await openVillageAt(page, onTheDoor);
  expect(await colourAt(canvas, knuckles.x, knuckles.y)).toBe(palette.peach);
  await expect(canvas).toHaveScreenshot("manager-knocking-2x.png", { maxDiffPixels: 0, threshold: 0 });

  canvas = await openVillageAt(page, drawnBack);
  expect(await colourAt(canvas, knuckles.x, knuckles.y)).not.toBe(palette.peach);
});

test("the manager is out on the path while he walks between the desk and a house", async ({ page }) => {
  for (const doing of [`walking to ${occupied[0].name}`, "walking back to the desk"]) {
    const timeMs = momentOf(doing, 2500);
    const manager = managerStateAt(timeMs, villageHouses);
    expect(manager.activity).toBe("walking");
    const canvas = await openVillageAt(page, timeMs);
    const seen = await coloursIn(canvas, boxOf(manager));
    expect(seen, doing).toContain(palette.ember);
    expect(seen, doing).toContain(palette.mist);
  }
});

test("the manager sets off from the desk when the clock runs, and reaches the first door", async ({ page }) => {
  // He is at the first door for a few seconds of every round; a slow start may have to wait for the next round.
  test.setTimeout(round.lastsMs + 30000);
  const canvas = await openVillageAt(page, null);
  const atTheDesk = boxOf(managerStateAt(0, villageHouses));
  const atTheFirstDoor = boxOf(managerStateAt(momentOf(`waiting at ${occupied[0].name}`), villageHouses));
  const hatBandAtTheDoor = {
    x: atTheFirstDoor.x + managerPoints.hatBand.x,
    y: atTheFirstDoor.y + managerPoints.hatBand.y,
  };

  const deskAtFirst = await pictureOf(canvas, atTheDesk);
  await expect.poll(() => pictureOf(canvas, atTheDesk)).not.toBe(deskAtFirst);
  await expect
    .poll(() => colourAt(canvas, hatBandAtTheDoor.x, hatBandAtTheDoor.y), { timeout: round.lastsMs + 15000 })
    .toBe(palette.ember);
});

test("the picture's description tells of the manager's round, house by house", async ({ page }) => {
  const canvas = await openVillageAt(page, 4200);
  const description = await sceneWords(canvas);
  expect(description).toContain(describeManagersRound(villageHouses));
  for (const house of occupied) expect(description).toContain(house.name);
});

test("H12: nothing the manager adds to the page is a rule code", async ({ page }) => {
  const canvas = await openVillageAt(page, momentOf(`waiting at ${occupied[0].name}`));
  const ruleCode = /\b[HQ]\d{1,2}\b/;
  expect(await sceneWords(canvas)).not.toMatch(ruleCode);
  await expect(page.locator("body")).not.toContainText(ruleCode);
});
