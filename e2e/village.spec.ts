import { expect, test, type Locator, type Page } from "@playwright/test";
import { palette, type ColourName } from "../lib/village/engine";
import { glassOfWindow, plateSizeFor, signStyles, villageHouses, type PlacedHouse } from "../lib/village/houses";
import type { Rect } from "../lib/village/plaza";
import {
  NO_NEWS_NOTE,
  VILLAGE_STATE_ROUTE,
  projectStateOf,
  type ProjectState,
  type VillageState,
} from "../lib/village/state";
import { FROZEN_HUB_MOMENT, expectTheFrozenVillage } from "./frozen-hub";
import { sceneWords } from "./scene-words";

// Paused at a known moment, the village always paints the same frame.
const FIXED_TIME_MS = 4200;

const [approvalDeskHouse, teamHouse] = villageHouses;
const projectHouses = [approvalDeskHouse, teamHouse];

async function openVillage(page: Page): Promise<Locator> {
  await page.goto(`/?time=${FIXED_TIME_MS}&scale=2`);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  return canvas;
}

/** Every colour used in one part of the picture, given in village pixels, as the palette spells them. */
async function coloursIn(canvas: Locator, area: Rect): Promise<Set<string>> {
  const numbers = await canvas.evaluate((element: HTMLCanvasElement, { x, y, width, height }) => {
    const scale = Number(element.dataset.pixelScale);
    const context = element.getContext("2d");
    if (!context) throw new Error("Could not read the canvas");
    return Array.from(context.getImageData(x * scale, y * scale, width * scale, height * scale).data);
  }, area);
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

type WindowLight = "bright" | "soft" | "off";

async function windowLights(canvas: Locator, house: PlacedHouse): Promise<WindowLight[]> {
  const lights: WindowLight[] = [];
  for (const window of house.windows) {
    const colours = await coloursIn(canvas, glassOfWindow(house.build, window));
    lights.push(colours.has(hex("lamp")) ? "bright" : colours.has(hex("sunset")) ? "soft" : "off");
  }
  return lights;
}

/** The lights a house should show for its project's state: one window per agent at home, bright ones first. */
function lightsFor(house: PlacedHouse, project: ProjectState): WindowLight[] {
  return house.windows.map((_, index) =>
    index < project.workingCount ? "bright" : index < project.agents.length ? "soft" : "off",
  );
}

function whereTheNoteHangs(house: PlacedHouse): Rect {
  const plate = plateSizeFor(NO_NEWS_NOTE);
  return { x: house.noteSpot.x - (plate.width - 1) / 2, y: house.noteSpot.y, ...plate };
}

async function hasTheNoNewsNote(canvas: Locator, house: PlacedHouse): Promise<boolean> {
  const colours = await coloursIn(canvas, whereTheNoteHangs(house));
  return colours.has(hex("cloud")) && colours.has(hex("slate"));
}

async function neonIsOn(canvas: Locator, house: PlacedHouse): Promise<boolean> {
  const colours = await coloursIn(canvas, house.sign!.board);
  return colours.has(hex(signStyles[house.sign!.style].letters));
}

async function villageStateFrom(request: Page["request"]): Promise<VillageState> {
  const response = await request.get(VILLAGE_STATE_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

test("the tests' hub is frozen: it answers for one fixed moment, the same every time", async ({ request }) => {
  const first = await villageStateFrom(request);
  const second = await villageStateFrom(request);
  expect(first.asOf).toBe(FROZEN_HUB_MOMENT);
  expect(second).toEqual(first);
});

test("the frozen moment has something to show: agents working, one between jobs, and requests waiting", async ({
  request,
}) => {
  const village = await villageStateFrom(request);
  expect(village.projects.map((project) => project.project)).toEqual(projectHouses.map((house) => house.project));

  const approvalDesk = projectStateOf(village, "approval-desk")!;
  expect(approvalDesk).toMatchObject({ isDark: false, whyDark: null, workingCount: 1 });
  expect(approvalDesk.agents.map((agent) => [agent.name, agent.isWorking, agent.latest.step])).toEqual([
    ["refund-agent", true, "summary"],
  ]);
  expect(approvalDesk.waiting.map((item) => [item.kind, item.isUrgent, item.waitedMs])).toEqual([
    ["decision", false, 305_000],
    ["decision", true, 80_000],
  ]);

  const team = projectStateOf(village, teamHouse.project!)!;
  expect(team).toMatchObject({ isDark: false, whyDark: null, workingCount: 2 });
  expect(team.agents.map((agent) => [agent.name, agent.isWorking])).toEqual([
    ["builder", true],
    ["checker", false],
    ["planner", true],
  ]);
  expect(team.waiting).toHaveLength(1);
});

test("the village shows what the state says: a window per agent at home, bright for the ones working", async ({
  page,
}) => {
  const canvas = await openVillage(page);
  await expectTheFrozenVillage(canvas);
  const village = await villageStateFrom(page.request);

  for (const house of projectHouses) {
    const project = projectStateOf(village, house.project!)!;
    expect(await windowLights(canvas, house), house.name).toEqual(lightsFor(house, project));
    expect(await neonIsOn(canvas, house), house.name).toBe(true);
    expect(await hasTheNoNewsNote(canvas, house), house.name).toBe(false);
  }
  expect(await windowLights(canvas, approvalDeskHouse)).toEqual(["bright", "off"]);
  expect(await windowLights(canvas, teamHouse)).toEqual(["bright", "bright", "soft"]);

  const description = await sceneWords(canvas);
  expect(description).toContain("approval-desk: 1 agent home, 1 working, 2 waiting for your answer.");
  expect(description).toContain(`${teamHouse.project}: 3 agents home, 2 working, 1 waiting for your answer.`);
});

test("H10: every house on demo data is marked demo in the state and shows its DEMO tag", async ({ page }) => {
  const canvas = await openVillage(page);
  await expectTheFrozenVillage(canvas);
  const village = await villageStateFrom(page.request);

  for (const house of projectHouses) {
    expect(projectStateOf(village, house.project!)!.isDemo, house.name).toBe(true);
    const whereTheTagRides: Rect = { x: house.tagSpot.x - 26, y: house.tagSpot.y - 10, width: 27, height: 10 };
    const tag = await coloursIn(canvas, whereTheTagRides);
    expect(tag, `${house.name}: tag plate`).toContain(hex("sand"));
    expect(tag, `${house.name}: tag words`).toContain(hex("ember"));
  }
});

test("H9: a house whose feed fails goes dark with a plain note while the others keep running", async ({ page }) => {
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

  const canvas = await openVillage(page);
  await expectTheFrozenVillage(canvas);

  expect(await windowLights(canvas, teamHouse)).toEqual(["off", "off", "off"]);
  expect(await neonIsOn(canvas, teamHouse)).toBe(false);
  expect(await hasTheNoNewsNote(canvas, teamHouse)).toBe(true);

  expect(await windowLights(canvas, approvalDeskHouse)).toEqual(["bright", "off"]);
  expect(await neonIsOn(canvas, approvalDeskHouse)).toBe(true);
  expect(await hasTheNoNewsNote(canvas, approvalDeskHouse)).toBe(false);

  const description = await sceneWords(canvas);
  expect(description).toContain(`${teamHouse.project}: no news.`);
  expect(description).toContain("approval-desk: 1 agent home, 1 working");
  await expect(page.getByRole("heading", { name: "Agent Hub" })).toBeVisible();
});

test("H9: when the hub gives no answer every house goes dark, and the page itself keeps running", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ status: 500, json: { problem: "broken" } }));

  const canvas = await openVillage(page);
  await expect(canvas).toHaveAccessibleDescription(/There is no news from any house\./);

  for (const house of projectHouses) {
    await expect.poll(() => hasTheNoNewsNote(canvas, house), house.name).toBe(true);
    expect((await windowLights(canvas, house)).every((light) => light === "off"), house.name).toBe(true);
    expect(await neonIsOn(canvas, house), house.name).toBe(false);
  }
  await expect(page.getByRole("heading", { name: "Agent Hub" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("H12: the village's news is told in plain words, with no rule codes or feed words", async ({ page }) => {
  const canvas = await openVillage(page);
  await expectTheFrozenVillage(canvas);
  await expect(canvas).toHaveAccessibleDescription(/agents home/);

  const description = await sceneWords(canvas);
  expect(description).not.toMatch(/\b[HQ]\d{1,2}\b/);
  expect(description).not.toMatch(/needs_human|result_ready|no_news|feed_failed/);
  await expect(page.locator("body")).not.toContainText(/\b[HQ]\d{1,2}\b/);
});

test("the village's state is read-only", async ({ request }) => {
  for (const send of [request.post, request.put, request.patch, request.delete]) {
    const response = await send.call(request, VILLAGE_STATE_ROUTE, { data: {} });
    expect(response.status()).toBe(405);
  }
});
