import { expect, test, type Locator, type Page } from "@playwright/test";
import { INVENTED_AWAY_AGENT, INVENTED_HOUSE_NAME, inventedInside } from "../app/lab/inside/inventedInside";
import { SCREEN_WIDTH, palette, type ColourName } from "../lib/village/engine";
import { villageHouses, type PlacedHouse } from "../lib/village/houses";
import {
  BACK_TO_PLAZA_WORDS,
  backButtonBounds,
  demoTagBounds,
  describeInside,
  openHouseWords,
  stepInPlainWords,
} from "../lib/village/interiors";
import type { Rect } from "../lib/village/plaza";
import { VILLAGE_STATE_ROUTE, projectStateOf, type VillageState } from "../lib/village/state";
import { expectTheFrozenVillage } from "./frozen-hub";
import { sceneWords, startingWith } from "./scene-words";

// Paused at a known moment, the village and every room in it always paint the same frame.
const FIXED_TIME_MS = 4200;
const COMPUTER_NAME = "The computer on the desk";
const RULE_CODE = /\b[HQ]\d{1,2}\b/;

const [approvalDeskHouse, teamHouse, houseForSale, otherHouseForSale] = villageHouses;
const projectHouses = [approvalDeskHouse, teamHouse];

async function openPlaza(page: Page): Promise<Locator> {
  await page.goto(`/?time=${FIXED_TIME_MS}&scale=2`);
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  // The picture's words change when a house is opened, so the tests hold the canvas itself.
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expect(canvas).toHaveAttribute("aria-label", /plaza at dusk/i);
  await expectTheFrozenVillage(canvas);
  return canvas;
}

function door(page: Page, house: PlacedHouse): Locator {
  return page.getByRole("button", { name: openHouseWords(house), exact: true });
}

function backButton(page: Page): Locator {
  return page.getByRole("button", { name: BACK_TO_PLAZA_WORDS, exact: true });
}

/** Waits until the picture itself, not only its words, shows the inside of `house`. */
async function expectInside(canvas: Locator, house: PlacedHouse): Promise<void> {
  const opening = house.isForSale ? "Inside a house for sale." : `Inside the ${house.name} house`;
  await expect(canvas).toHaveAttribute("aria-label", new RegExp(`^${opening}`));
  await expect(canvas).toHaveAttribute("data-inside-of", house.name);
}

async function expectThePlaza(canvas: Locator): Promise<void> {
  await expect(canvas).toHaveAttribute("aria-label", /^The plaza at dusk\./);
  await expect(canvas).not.toHaveAttribute("data-inside-of");
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

async function coloursIn(canvas: Locator, area: Rect): Promise<Set<string>> {
  const numbers = (await pictureOf(canvas, area)).split(",").map(Number);
  const colours = new Set<string>();
  for (let offset = 0; offset < numbers.length; offset += 4) {
    const [red, green, blue] = numbers.slice(offset, offset + 3);
    colours.add("#" + [red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join(""));
  }
  return colours;
}

async function colourAt(canvas: Locator, x: number, y: number): Promise<string> {
  return [...(await coloursIn(canvas, { x, y, width: 1, height: 1 }))][0];
}

function hex(colour: ColourName): string {
  return palette[colour];
}

/** The top left corner of the focus mark painted round an area. */
function focusMarkCornerOf(area: Rect): { x: number; y: number } {
  return { x: area.x - 2, y: area.y - 2 };
}

async function hasFocusMark(canvas: Locator, area: Rect): Promise<boolean> {
  const corner = focusMarkCornerOf(area);
  return (await colourAt(canvas, corner.x, corner.y)) === hex("lamp");
}

async function villageStateFrom(request: Page["request"]): Promise<VillageState> {
  const response = await request.get(VILLAGE_STATE_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

test("clicking the approval-desk house opens its inside: one agent at its station", async ({ page }) => {
  const canvas = await openPlaza(page);
  await door(page, approvalDeskHouse).click();

  await expectInside(canvas, approvalDeskHouse);
  await expect(canvas).toHaveAccessibleDescription(/One agent lives here, with a bed of its own\./);
  await expect(backButton(page)).toBeVisible();
  await expect(canvas).toHaveScreenshot("inside-1-agent-2x.png", { maxDiffPixels: 0, threshold: 0 });
});

test("the inside works by keyboard: Tab to a house, Enter opens it, Esc returns to that house", async ({ page }) => {
  const canvas = await openPlaza(page);
  expect(await hasFocusMark(canvas, teamHouse.clickBounds)).toBe(false);

  // The computer comes first, then the houses in list order.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: COMPUTER_NAME })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(door(page, approvalDeskHouse)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(door(page, teamHouse)).toBeFocused();
  await expect.poll(() => hasFocusMark(canvas, teamHouse.clickBounds)).toBe(true);
  expect(await hasFocusMark(canvas, approvalDeskHouse.clickBounds)).toBe(false);

  await page.keyboard.press("Enter");
  await expectInside(canvas, teamHouse);
  await expect(canvas).toHaveAccessibleDescription(/3 agents share the room and its bunk beds/);
  await expect(backButton(page)).toBeFocused();
  await expect.poll(() => hasFocusMark(canvas, backButtonBounds)).toBe(true);
  await expect(canvas).toHaveScreenshot("inside-3-agents-2x.png", { maxDiffPixels: 0, threshold: 0 });

  await page.keyboard.press("Escape");
  await expectThePlaza(canvas);
  await expect(door(page, teamHouse)).toBeFocused();
  await expect.poll(() => hasFocusMark(canvas, teamHouse.clickBounds)).toBe(true);
  await expect(backButton(page)).toHaveCount(0);
});

test("Space opens a house too, and the back button returns with Enter", async ({ page }) => {
  const canvas = await openPlaza(page);
  await door(page, approvalDeskHouse).focus();
  await page.keyboard.press("Space");
  await expectInside(canvas, approvalDeskHouse);
  await expect(backButton(page)).toBeFocused();

  await page.keyboard.press("Enter");
  await expectThePlaza(canvas);
  await expect(door(page, approvalDeskHouse)).toBeFocused();
});

test("the back button returns to the plaza with a click, and the plaza is as it was", async ({ page }) => {
  const canvas = await openPlaza(page);
  const wholePicture: Rect = { x: 0, y: 0, width: SCREEN_WIDTH, height: 216 };
  const plazaBefore = await pictureOf(canvas, wholePicture);

  await door(page, teamHouse).click();
  await expectInside(canvas, teamHouse);
  await expect.poll(() => pictureOf(canvas, wholePicture)).not.toBe(plazaBefore);

  await backButton(page).click();
  await expectThePlaza(canvas);
  await door(page, teamHouse).blur();
  await expect.poll(() => pictureOf(canvas, wholePicture)).toBe(plazaBefore);
});

test("the back button lies exactly over its painted plate", async ({ page }) => {
  const canvas = await openPlaza(page);
  await door(page, approvalDeskHouse).click();
  await expectInside(canvas, approvalDeskHouse);

  const canvasBox = await canvas.boundingBox();
  const buttonBox = await backButton(page).boundingBox();
  if (!canvasBox || !buttonBox) throw new Error("The canvas or the back button is not on the page");
  const pagePixelsPerVillagePixel = canvasBox.width / SCREEN_WIDTH;
  expect(
    [
      (buttonBox.x - canvasBox.x) / pagePixelsPerVillagePixel,
      (buttonBox.y - canvasBox.y) / pagePixelsPerVillagePixel,
      buttonBox.width / pagePixelsPerVillagePixel,
      buttonBox.height / pagePixelsPerVillagePixel,
    ].map((villagePixels) => Math.round(villagePixels * 10) / 10),
  ).toEqual([backButtonBounds.x, backButtonBounds.y, backButtonBounds.width, backButtonBounds.height]);
});

test("every house's door lies over its house, and each has its own plain name", async ({ page }) => {
  const canvas = await openPlaza(page);
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("The canvas is not on the page");
  const pagePixelsPerVillagePixel = canvasBox.width / SCREEN_WIDTH;

  for (const house of villageHouses) {
    await expect(door(page, house)).toHaveCount(1);
    const box = await door(page, house).boundingBox();
    if (!box) throw new Error(`${house.name} has no door on the page`);
    expect(
      [
        (box.x - canvasBox.x) / pagePixelsPerVillagePixel,
        (box.y - canvasBox.y) / pagePixelsPerVillagePixel,
        box.width / pagePixelsPerVillagePixel,
        box.height / pagePixelsPerVillagePixel,
      ].map((villagePixels) => Math.round(villagePixels * 10) / 10),
      house.name,
    ).toEqual([house.clickBounds.x, house.clickBounds.y, house.clickBounds.width, house.clickBounds.height]);
  }
});

test("while a house is open the plaza's own controls are out of reach, and Esc on the plaza does nothing", async ({ page }) => {
  const canvas = await openPlaza(page);
  await page.keyboard.press("Escape");
  await expectThePlaza(canvas);

  await door(page, approvalDeskHouse).click();
  await expectInside(canvas, approvalDeskHouse);
  // The way back, and pause and speed, which work inside a house too.
  await expect(page.getByRole("button")).toHaveCount(3);
  await expect(backButton(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Speed: normal", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: COMPUTER_NAME })).toHaveCount(0);
  for (const house of villageHouses) await expect(door(page, house)).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expectThePlaza(canvas);
  await expect(page.getByRole("button", { name: COMPUTER_NAME })).toHaveCount(1);
});

test("each agent's current step comes from the feed", async ({ page }) => {
  const canvas = await openPlaza(page);
  const village = await villageStateFrom(page.request);

  for (const house of projectHouses) {
    const project = projectStateOf(village, house.project!)!;
    expect(project.agents.length, house.name).toBeGreaterThan(0);
    await door(page, house).click();
    await expectInside(canvas, house);
    const words = await sceneWords(canvas);
    for (const agent of project.agents) {
      expect(words, agent.name).toContain(
        `${agent.name} is ${agent.isWorking ? "working at its station" : "at its station, not working right now"}.`,
      );
      expect(words, agent.name).toContain(
        `${agent.isWorking ? "Step" : "Last step"}: ${stepInPlainWords(agent.latest.step)}.`,
      );
      expect(words, agent.name).toContain(agent.latest.what);
    }
    await page.keyboard.press("Escape");
    await expectThePlaza(canvas);
  }
});

test("when the feed moves an agent to a new step, the open room shows the new step", async ({ page }) => {
  const frozen = await villageStateFrom(page.request);
  let village = frozen;
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: village }));

  const canvas = await openPlaza(page);
  await door(page, approvalDeskHouse).click();
  await expectInside(canvas, approvalDeskHouse);
  await expect(canvas).toHaveAccessibleDescription(/refund-agent is working at its station\. Step: summary\./);
  const roomBefore = await pictureOf(canvas, { x: 0, y: 15, width: SCREEN_WIDTH, height: 201 });

  village = {
    ...frozen,
    projects: frozen.projects.map((project) =>
      project.project !== "approval-desk"
        ? project
        : {
            ...project,
            agents: project.agents.map((agent) => ({
              ...agent,
              latest: { ...agent.latest, step: "payout", what: "Paying back the morning's refunds" },
            })),
          },
    ),
  };
  await expect(canvas).toHaveAccessibleDescription(/Step: payout\. Paying back the morning's refunds\./, {
    timeout: 10_000,
  });
  await expect.poll(() => pictureOf(canvas, { x: 0, y: 15, width: SCREEN_WIDTH, height: 201 })).not.toBe(roomBefore);
});

test("a house for sale is empty inside", async ({ page }) => {
  const canvas = await openPlaza(page);
  await door(page, houseForSale).click();

  await expectInside(canvas, houseForSale);
  await expect(canvas).toHaveAccessibleDescription(startingWith("Inside a house for sale. The room is empty. Nobody lives here yet."));
  await expect(canvas).toHaveScreenshot("inside-for-sale-2x.png", { maxDiffPixels: 0, threshold: 0 });

  await page.keyboard.press("Escape");
  await expectThePlaza(canvas);
  await door(page, otherHouseForSale).click();
  await expectInside(canvas, otherHouseForSale);
  await expect(canvas).toHaveAccessibleDescription(startingWith("Inside a house for sale. The room is empty. Nobody lives here yet."));
});

test("ten agents lay out in one room", async ({ page }) => {
  const tenAgents = inventedInside(10);
  expect(tenAgents.agents).toHaveLength(10);
  expect(tenAgents.agents[INVENTED_AWAY_AGENT].isAway).toBe(true);

  await page.goto(`/lab/inside?agents=10&time=${FIXED_TIME_MS}&scale=2`);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const canvas = page.getByRole("img", { name: new RegExp(`^Inside the ${INVENTED_HOUSE_NAME} house`) });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expect(canvas).toHaveAttribute("aria-label", describeInside(tenAgents));
  await expect(canvas).toHaveScreenshot("inside-10-agents-2x.png", { maxDiffPixels: 0, threshold: 0 });
});

test("H9: a house whose feed fails is dark inside with a plain note, and the others are as they were", async ({ page }) => {
  const healthy = await villageStateFrom(page.request);
  const teamFeedFailed: VillageState = {
    ...healthy,
    projects: healthy.projects.map((project) =>
      project.project === teamHouse.project
        ? { ...project, isDark: true, whyDark: "feed_failed", lastNewsAt: null, agents: [], workingCount: 0, waiting: [], ready: [] }
        : project,
    ),
  };
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: teamFeedFailed }));

  const canvas = await openPlaza(page);
  await door(page, teamHouse).click();
  await expectInside(canvas, teamHouse);
  await expect(canvas).toHaveAccessibleDescription(
    startingWith(`Inside the ${teamHouse.name} house (demo). The room is dark: no news. This house's news could not be read.`),
  );
  const room = await coloursIn(canvas, { x: 0, y: 15, width: SCREEN_WIDTH, height: 201 });
  expect(room, "no lamp is lit").not.toContain(hex("lamp"));
  await expect(canvas).toHaveScreenshot("inside-no-news-2x.png", { maxDiffPixels: 0, threshold: 0 });

  await page.keyboard.press("Escape");
  await expectThePlaza(canvas);
  await door(page, approvalDeskHouse).click();
  await expectInside(canvas, approvalDeskHouse);
  await expect(canvas).toHaveAccessibleDescription(/refund-agent is working at its station\./);
  expect(await coloursIn(canvas, { x: 0, y: 15, width: SCREEN_WIDTH, height: 201 }), "its lamps are lit").toContain(
    hex("lamp"),
  );
});

test("H10: the DEMO tag stays in sight inside every house on demo data", async ({ page }) => {
  const canvas = await openPlaza(page);
  for (const house of projectHouses) {
    await door(page, house).click();
    await expectInside(canvas, house);
    await expect(canvas).toHaveAttribute("aria-label", new RegExp(`^Inside the ${house.name} house \\(demo\\)\\.`));
    const tag = await coloursIn(canvas, demoTagBounds());
    expect(tag, `${house.name}: tag plate`).toContain(hex("sand"));
    expect(tag, `${house.name}: tag words`).toContain(hex("ember"));
    await page.keyboard.press("Escape");
    await expectThePlaza(canvas);
  }

  await door(page, houseForSale).click();
  await expectInside(canvas, houseForSale);
  expect(await coloursIn(canvas, demoTagBounds()), "a house for sale has no data to mark").not.toContain(hex("ember"));
});

test("H12: inside a house everything is told in plain words, with no rule codes or feed words", async ({ page }) => {
  const canvas = await openPlaza(page);
  for (const house of villageHouses) {
    expect(openHouseWords(house)).not.toMatch(RULE_CODE);
    await door(page, house).click();
    await expectInside(canvas, house);
    const words = await sceneWords(canvas);
    expect(words).not.toMatch(RULE_CODE);
    expect(words).not.toMatch(/needs_human|result_ready|no_news|feed_failed/);
    await expect(page.locator("body")).not.toContainText(RULE_CODE);
    await page.keyboard.press("Escape");
    await expectThePlaza(canvas);
  }
  expect(BACK_TO_PLAZA_WORDS).not.toMatch(RULE_CODE);
});
