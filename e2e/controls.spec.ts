import { expect, test, type Locator, type Page } from "@playwright/test";
import { villageHouses } from "../lib/village/houses";
import { openHouseWords } from "../lib/village/interiors";
import { PAUSED_NOTE } from "../lib/village/plaza/controls";
import { FROZEN_HUB_MOMENT, expectTheFrozenVillage } from "./frozen-hub";
import { expectEveryClickableWorkedByKeyboard } from "./keyboard";
import { expectPlainWordsOnScreen } from "./plain-words";
import { sceneWords } from "./scene-words";

const FIXED_PLAZA = "/?time=4200&scale=2";
const [approvalDeskHouse] = villageHouses;
const houseForSale = villageHouses.find((house) => house.isForSale)!;

async function hideTheDevBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

function plazaPicture(page: Page): Locator {
  // The picture's name changes when a house is opened, so the tests hold the canvas itself.
  return page.locator("canvas");
}

async function openPlaza(page: Page, address: string = FIXED_PLAZA): Promise<Locator> {
  await page.goto(address);
  await hideTheDevBadge(page);
  const canvas = plazaPicture(page);
  await expectTheFrozenVillage(canvas);
  return canvas;
}

function pauseButton(page: Page): Locator {
  return page.getByRole("button", { name: /^(Pause|Play)$/ });
}

function speedButton(page: Page): Locator {
  return page.getByRole("button", { name: /^Speed: / });
}

function door(page: Page, house: (typeof villageHouses)[number]): Locator {
  return page.getByRole("button", { name: openHouseWords(house), exact: true });
}

async function villageTimeMs(canvas: Locator): Promise<number> {
  return Number(await canvas.getAttribute("data-village-time-ms"));
}

function wholePicture(canvas: Locator): Promise<string> {
  return canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
}

// ---- Pause and speed, on the page's own clock moved by hand ----

// Six frames at a time: the page's clock hands each frame 16 ms.
const STEP_MS = 96;

async function openPlazaOnAHandClock(page: Page): Promise<Locator> {
  await page.clock.install({ time: new Date(FROZEN_HUB_MOMENT) });
  await page.clock.pauseAt(new Date(FROZEN_HUB_MOMENT));
  await page.goto("/?scale=2");
  await hideTheDevBadge(page);
  const canvas = plazaPicture(page);
  for (let ranMs = 0; ranMs < 60_000; ranMs += STEP_MS) {
    if ((await canvas.getAttribute("data-village-as-of")) === FROZEN_HUB_MOMENT) break;
    await page.clock.runFor(STEP_MS);
  }
  await expectTheFrozenVillage(canvas);
  await page.clock.runFor(STEP_MS);
  return canvas;
}

async function villageTimeAfter(page: Page, canvas: Locator, realMs: number): Promise<number> {
  const before = await villageTimeMs(canvas);
  await page.clock.runFor(realMs);
  return (await villageTimeMs(canvas)) - before;
}

test("the speed button steps through normal, 2 times and 4 times, and the village runs that much faster", async ({
  page,
}) => {
  const canvas = await openPlazaOnAHandClock(page);
  await expect(speedButton(page)).toHaveText("Speed: normal");
  expect(await villageTimeAfter(page, canvas, 960)).toBe(960);

  await speedButton(page).click();
  await expect(speedButton(page)).toHaveText("Speed: 2 times");
  expect(await villageTimeAfter(page, canvas, 960)).toBe(1920);
  await expect(canvas).toHaveAccessibleDescription(/The village runs at 2 times the normal speed\./);

  await speedButton(page).click();
  await expect(speedButton(page)).toHaveText("Speed: 4 times");
  expect(await villageTimeAfter(page, canvas, 960)).toBe(3840);

  await speedButton(page).click();
  await expect(speedButton(page)).toHaveText("Speed: normal");
  expect(await villageTimeAfter(page, canvas, 960)).toBe(960);
});

test("P pauses the whole village, and plays it again with no jump", async ({ page }) => {
  const canvas = await openPlazaOnAHandClock(page);
  await expect(pauseButton(page)).toHaveText("Pause");
  await expect(page.getByText(PAUSED_NOTE, { exact: true })).toHaveCount(0);

  await page.keyboard.press("p");
  await expect(pauseButton(page)).toHaveText("Play");
  await expect(page.getByText(PAUSED_NOTE, { exact: true })).toBeVisible();
  await page.clock.runFor(STEP_MS);
  const picture = await wholePicture(canvas);
  const manager = await canvas.getAttribute("data-delivery");

  // Long enough for the human, the manager on his round and the fireflies all to have moved, were it running.
  expect(await villageTimeAfter(page, canvas, 6000)).toBe(0);
  expect(await wholePicture(canvas)).toBe(picture);
  expect(await canvas.getAttribute("data-delivery")).toBe(manager);
  await expect(canvas).toHaveAccessibleDescription(/The village is paused\. News still comes in/);

  await page.keyboard.press("P");
  await expect(pauseButton(page)).toHaveText("Pause");
  await expect(page.getByText(PAUSED_NOTE, { exact: true })).toHaveCount(0);
  // Picks up where it stopped: one step later it is one step on, not the time it spent paused.
  expect(await villageTimeAfter(page, canvas, STEP_MS)).toBe(STEP_MS);
  await page.clock.runFor(3000);
  expect(await wholePicture(canvas)).not.toBe(picture);
});

test("the pause button does the same as the key, and pausing holds the inside of a house still too", async ({
  page,
}) => {
  const canvas = await openPlazaOnAHandClock(page);
  await door(page, approvalDeskHouse).click();
  await page.clock.runFor(STEP_MS);
  await expect(canvas).toHaveAttribute("data-inside-of", approvalDeskHouse.name);

  await pauseButton(page).click();
  await expect(pauseButton(page)).toHaveText("Play");
  await page.clock.runFor(STEP_MS);
  const room = await wholePicture(canvas);
  expect(await villageTimeAfter(page, canvas, 4000)).toBe(0);
  expect(await wholePicture(canvas)).toBe(room);
  expect(await sceneWords(canvas)).toMatch(/^Inside the .* The village is paused\./);

  await pauseButton(page).click();
  await expect(pauseButton(page)).toHaveText("Pause");
  expect(await villageTimeAfter(page, canvas, STEP_MS)).toBe(STEP_MS);
});

test("the pause key never fires while typing in a field", async ({ page }) => {
  await openPlaza(page, "/?scale=2");
  await page.evaluate(() => {
    const field = document.createElement("input");
    field.setAttribute("aria-label", "A note");
    document.body.append(field);
    field.focus();
  });
  await page.keyboard.type("pause please");
  await expect(page.getByRole("textbox", { name: "A note" })).toHaveValue("pause please");
  await expect(pauseButton(page)).toHaveText("Pause");
});

test("a fixed frame starts paused, and says so", async ({ page }) => {
  await openPlaza(page);
  await expect(pauseButton(page)).toHaveText("Play");
  await expect(page.getByText(PAUSED_NOTE, { exact: true })).toBeVisible();
});

test("the picture's own name is short, and the summary is announced politely, not on every frame", async ({
  page,
}) => {
  const canvas = await openPlaza(page);
  await expect(canvas).toHaveAccessibleName("The plaza at dusk.");
  await expect(canvas).toHaveAccessibleDescription(/The human sits at his desk in the middle/);
  const announcer = page.getByRole("status");
  await expect(announcer).toHaveAttribute("aria-live", "polite");

  await page.keyboard.press("p");
  await expect(announcer).toHaveText(/^The village runs at normal speed\.$/);
  await speedButton(page).click();
  await expect(announcer).toHaveText(/^The village runs at 2 times the normal speed\.$/);
  // The village moving on is in the summary, but not said out loud.
  const said = await announcer.textContent();
  await expect.poll(() => sceneWords(canvas)).not.toBe(await sceneWords(canvas));
  expect(await announcer.textContent()).toBe(said);
});

// ---- Every clickable place, by keyboard alone ----

test("the plaza: every clickable place is reached by Tab and worked by Enter, picture first, then the controls", async ({
  page,
}) => {
  await openPlaza(page);
  const stops = await expectEveryClickableWorkedByKeyboard(page);
  expect(stops.map((stop) => stop.name)).toEqual([
    "The computer on the desk",
    ...villageHouses.map(openHouseWords),
    "The clipboard on the desk",
    "Play",
    "Speed: normal",
    "Open the desk",
  ]);
});

for (const house of [approvalDeskHouse, houseForSale]) {
  test(`inside ${house.name}: every clickable place is reached by Tab and worked by Enter`, async ({ page }) => {
    const canvas = await openPlaza(page);
    await door(page, house).click();
    await expect(canvas).toHaveAttribute("data-inside-of", house.name);
    const stops = await expectEveryClickableWorkedByKeyboard(page);
    expect(stops.map((stop) => stop.name)).toEqual(["Back to the plaza", "Play", "Speed: normal", "Open the desk"]);
  });
}

test("the desk: every clickable place is reached by Tab and worked by Enter", async ({ page }) => {
  await page.goto("/desk");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-desk-as-of", FROZEN_HUB_MOMENT);
  await expect(page.getByRole("main")).toHaveAttribute("data-log-as-of", FROZEN_HUB_MOMENT);
  const stops = await expectEveryClickableWorkedByKeyboard(page);
  expect(stops.length).toBeGreaterThan(3);
});

test("the clipboard: every clickable place is reached by Tab and worked by Enter", async ({ page }) => {
  await page.goto("/clipboard");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-board-from", /./);
  const stops = await expectEveryClickableWorkedByKeyboard(page);
  expect(stops.map((stop) => stop.name)).toContain("Back to the village");
});

test("the lab: every clickable place is reached by Tab and worked by Enter", async ({ page }) => {
  await page.goto("/lab?time=4200&scale=2");
  await hideTheDevBadge(page);
  await expect(page.getByRole("img", { name: /Test picture/ })).toHaveAttribute("data-pixel-scale", "2");
  const stops = await expectEveryClickableWorkedByKeyboard(page);
  expect(stops.length).toBeGreaterThan(0);
});

test("the lab's inside: every clickable place is reached by Tab and worked by Enter", async ({ page }) => {
  await page.goto("/lab/inside?scale=2");
  await hideTheDevBadge(page);
  await expect(page.locator("canvas")).toHaveAttribute("data-pixel-scale", "2");
  await expectEveryClickableWorkedByKeyboard(page);
});

test("a control only a mouse can use fails the keyboard check", async ({ page }) => {
  await openPlaza(page);
  await page.evaluate(() => {
    const mouseOnly = document.createElement("div");
    mouseOnly.textContent = "Mouse only";
    mouseOnly.style.cursor = "pointer";
    mouseOnly.addEventListener("click", () => {});
    document.body.append(mouseOnly);
  });
  await expect(expectEveryClickableWorkedByKeyboard(page)).rejects.toThrow(/never reaches/);

  await openPlaza(page);
  await page.evaluate(() => {
    const deafToKeys = document.createElement("div");
    deafToKeys.textContent = "Reached but deaf to Enter";
    deafToKeys.tabIndex = 0;
    deafToKeys.setAttribute("role", "button");
    deafToKeys.style.outline = "2px solid white";
    document.body.append(deafToKeys);
  });
  await expect(expectEveryClickableWorkedByKeyboard(page)).rejects.toThrow(/Enter does nothing/);
});

// ---- No rule codes or ids, on every screen ----

test("H12: no rule codes or ids on the plaza, paused or running", async ({ page }) => {
  await openPlaza(page);
  await expectPlainWordsOnScreen(page);
  await openPlaza(page, "/?scale=2");
  await expectPlainWordsOnScreen(page);
});

test("H12: no rule codes or ids inside any house", async ({ page }) => {
  const canvas = await openPlaza(page);
  for (const house of villageHouses) {
    await door(page, house).click();
    await expect(canvas).toHaveAttribute("data-inside-of", house.name);
    await expectPlainWordsOnScreen(page);
    await page.keyboard.press("Escape");
    await expect(canvas).not.toHaveAttribute("data-inside-of", /./);
  }
});

test("H12: no rule codes or ids on the desk", async ({ page }) => {
  await page.goto("/desk");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-log-as-of", FROZEN_HUB_MOMENT);
  await expectPlainWordsOnScreen(page);
});

test("H12: no rule codes or ids on the clipboard", async ({ page }) => {
  await page.goto("/clipboard");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-board-from", /./);
  await expectPlainWordsOnScreen(page);
});

test("H12: no rule codes or ids on the lab pages", async ({ page }) => {
  for (const address of ["/lab?time=4200", "/lab/inside"]) {
    await page.goto(address);
    await hideTheDevBadge(page);
    await expect(page.locator("canvas")).toHaveAttribute("data-pixel-scale", /\d/);
    await expectPlainWordsOnScreen(page);
  }
});
