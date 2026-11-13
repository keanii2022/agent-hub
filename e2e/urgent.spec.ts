import { expect, test, type Locator, type Page } from "@playwright/test";
import type { FeedLine } from "../lib/feed";
import { HANDOVER_WORDS, SHOULDER_TAP_WORDS, URGENT_TAP_WORDS, deskMark } from "../lib/village/delivery";
import { palette } from "../lib/village/engine";
import { glassOfWindow, villageHouses, type PlacedHouse } from "../lib/village/houses";
import { BACK_TO_PLAZA_WORDS, openHouseWords } from "../lib/village/interiors";
import { desk, type Rect } from "../lib/village/plaza";
import { VILLAGE_STATE_ROUTE, type VillageState, type WaitingItem } from "../lib/village/state";
import { FROZEN_HUB_MOMENT, expectTheFrozenVillage } from "./frozen-hub";

const FIXED_TIME_MS = 4200;
const RULE_CODE = /\b[HQ]\d{1,2}\b/;

const [approvalDeskHouse, teamHouse] = villageHouses;
const APPROVAL_DESK = approvalDeskHouse.project as string;
const TEAM_PROJECT = teamHouse.project as string;

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

const markArea: Rect = {
  x: desk.markSpot.x - Math.floor(deskMark.width / 2),
  y: desk.markSpot.y - deskMark.height,
  width: deskMark.width,
  height: deskMark.height + 1,
};
const footOfTheStack: Rect = { x: desk.stackSpot.x - 2, y: desk.stackSpot.y - 3, width: 5, height: 3 };
/** The red tab an urgent paper wears, on the lowest paper of the stack. */
const tabOfTheLowestPaper: Rect = { x: desk.stackSpot.x + 2, y: desk.stackSpot.y - 1, width: 1, height: 1 };

async function markIsPainted(canvas: Locator): Promise<boolean> {
  return (await coloursIn(canvas, markArea)).has(palette.lamp);
}

/** How many of a house's windows have a lamp on behind them, bright or turned low. */
async function windowsLit(canvas: Locator, house: PlacedHouse): Promise<number> {
  let lit = 0;
  for (const window of house.windows) {
    const colours = await coloursIn(canvas, glassOfWindow(house.build, window));
    if (colours.has(palette.lamp) || colours.has(palette.sunset)) lit += 1;
  }
  return lit;
}

/** The top of the doorway, clear of anyone standing on the doorstep: lamp light when the door stands open. */
async function doorStandsOpen(canvas: Locator, house: PlacedHouse): Promise<boolean> {
  const topOfTheDoorway: Rect = { x: house.door.x + 2, y: house.door.y + 1, width: house.door.width - 4, height: 2 };
  return (await coloursIn(canvas, topOfTheDoorway)).has(palette.lamp);
}

async function frozenVillage(page: Page): Promise<VillageState> {
  const response = await page.request.get(VILLAGE_STATE_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

function withNothingWaiting(village: VillageState): VillageState {
  return {
    ...village,
    projects: village.projects.map((project) => ({ ...project, waiting: [], ready: [] })),
    waitingCount: 0,
  };
}

function scriptedLine(project: string, agent: string, id: string, status: "needs_human" | "result_ready"): FeedLine {
  const line = {
    project,
    agent,
    request: `REQUEST-${id}`,
    step: status === "needs_human" ? "gate" : "report",
    what: status === "needs_human" ? "Needs the owner's answer today" : "The report is ready to read",
    when: "2026-10-05T14:07:00Z",
    id,
    demo: true,
  };
  return status === "needs_human"
    ? { ...line, status, urgent: true, choices: [{ id: "approve", label: "Approve" }, { id: "reject", label: "Reject" }] }
    : { ...line, status };
}

/** The scripted hub of these tests: an urgent request at approval-desk from its own agent, and an ordinary result at the team house. */
function withAnUrgentRequestAndAnOrdinaryResult(village: VillageState): { village: VillageState; agent: string } {
  const [agent] = village.projects.find((project) => project.project === APPROVAL_DESK)!.agents.map((found) => found.name);
  const urgent: WaitingItem = {
    kind: "decision",
    line: scriptedLine(APPROVAL_DESK, agent, "scripted-urgent", "needs_human"),
    waitedMs: 5000,
    isUrgent: true,
  };
  const ordinary: WaitingItem = {
    kind: "result",
    line: scriptedLine(TEAM_PROJECT, "builder", "scripted-report", "result_ready"),
    waitedMs: 4000,
    isUrgent: false,
  };
  return {
    agent,
    village: {
      ...village,
      projects: village.projects.map((project) =>
        project.project === APPROVAL_DESK
          ? { ...project, waiting: [urgent] }
          : project.project === TEAM_PROJECT
            ? { ...project, ready: [ordinary] }
            : project,
      ),
      waitingCount: 2,
    },
  };
}

function walkOf(agent: string, house: string): string[] {
  return [
    `stepping out of ${house} with urgent paperwork`,
    `walking urgent paperwork from ${house} to the desk`,
    "tapping the owner on the shoulder",
    "walking round the desk with the paperwork",
    "putting the paperwork on the desk",
    "standing back from the desk",
    `walking back to ${house}`,
    `going back into ${house}`,
  ].map((doing) => `${agent} is ${doing}.`);
}

// The page's own time, moved on by hand in steps of six frames. Nothing in the
// village reads any other clock, so the same number of steps always paints the
// same frame: the walk can be stopped anywhere and compared to a saved picture.
const CLOCK_STEP_MS = 96;
const LONGEST_WAIT_MS = 120_000;

async function runTheClockUntil(page: Page, what: string, isThere: () => Promise<boolean>): Promise<void> {
  for (let ranMs = 0; ranMs <= LONGEST_WAIT_MS; ranMs += CLOCK_STEP_MS) {
    if (await isThere()) return;
    await page.clock.runFor(CLOCK_STEP_MS);
  }
  throw new Error(`The village never got to: ${what}`);
}

async function runTheClockFor(page: Page, steps: number): Promise<void> {
  for (let step = 0; step < steps; step += 1) await page.clock.runFor(CLOCK_STEP_MS);
}

test("a scripted urgent event sends its own agent to the desk, while an ordinary one still waits for the manager", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));

  const nothingWaiting = withNothingWaiting(await frozenVillage(page));
  const { village: bothWaiting, agent } = withAnUrgentRequestAndAnOrdinaryResult(nothingWaiting);

  // This test's hub is scripted, and can be made to hold its answer back: the
  // news then reaches the page at a moment of the test's choosing, so the walk
  // starts on the same frame every time.
  let hubAnswers = nothingWaiting;
  let answersAreHeld: Promise<void> | null = null;
  let letAnswersGo = (): void => {};
  await page.route(`**${VILLAGE_STATE_ROUTE}`, async (route) => {
    if (answersAreHeld) await answersAreHeld;
    await route.fulfill({ json: hubAnswers });
  });

  await page.clock.install({ time: new Date(FROZEN_HUB_MOMENT) });
  await page.clock.pauseAt(new Date(FROZEN_HUB_MOMENT));
  await page.goto("/?scale=2");
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");

  const has = (attribute: string, value: string | RegExp) => async (): Promise<boolean> => {
    const found = (await canvas.getAttribute(attribute)) ?? "";
    return typeof value === "string" ? found === value : value.test(found);
  };
  const agentIs = (doing: string): (() => Promise<boolean>) => has("data-agents-out", `${agent} is ${doing}.`);
  const managerIs = (doing: string): (() => Promise<boolean>) =>
    has("data-delivery", new RegExp(`^The manager is ${doing}`));

  await runTheClockUntil(page, "the hub's first answer", has("data-village-as-of", FROZEN_HUB_MOMENT));
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  await expect(canvas).toHaveAttribute("data-agents-out", "");
  expect(await windowsLit(canvas, approvalDeskHouse)).toBe(1);
  expect(await doorStandsOpen(canvas, approvalDeskHouse)).toBe(false);

  // Everything the page says its agents out of their houses do from here on, in order.
  await canvas.evaluate((element) => {
    const told: string[] = [];
    (window as unknown as { urgentStory: string[] }).urgentStory = told;
    const note = (): void => {
      const words = (element as HTMLElement).dataset.agentsOut ?? "";
      if (told[told.length - 1] !== words) told.push(words);
    };
    new MutationObserver(note).observe(element, { attributes: true, attributeFilter: ["data-agents-out"] });
    note();
  });
  const story = (): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { urgentStory: string[] }).urgentStory);

  // The hub now has both things waiting, but holds its answer until the manager
  // is resting at the desk: nobody is at a door, and he will be gone from
  // behind the chair before the agent gets there.
  answersAreHeld = new Promise((resolve) => {
    letAnswersGo = resolve;
  });
  hubAnswers = bothWaiting;
  await runTheClockUntil(page, "the manager resting at the desk", managerIs("standing at the desk"));
  await expect(canvas).toHaveAttribute("data-agents-out", "");
  answersAreHeld = null;
  letAnswersGo();
  // The page has heard: its words for a screen reader, which follow the news and not the clock, say so.
  await expect(canvas).toHaveAccessibleDescription(new RegExp(`${APPROVAL_DESK}: [^.]*1 waiting for your answer`));

  // On the very next frame the agent is out of its door: it did not wait for the manager.
  await runTheClockFor(page, 1);
  await expect(canvas).toHaveAttribute("data-agents-out", walkOf(agent, APPROVAL_DESK)[0]);
  await expect(canvas).toHaveAttribute("data-delivery", /^The manager is standing at the desk\./);
  await expect(canvas).toHaveAttribute(
    "data-delivery",
    new RegExp(`1 paper waits at ${TEAM_PROJECT} for his next call\\.`),
  );
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  await runTheClockFor(page, 5);
  await expect(canvas).toHaveScreenshot("urgent-stepping-out-2x.png", { maxDiffPixels: 0, threshold: 0 });

  // The house shows that its agent is away: its one lit window is dark and its door stands open.
  await runTheClockUntil(page, "the walk to the desk", agentIs(`walking urgent paperwork from ${APPROVAL_DESK} to the desk`));
  await runTheClockFor(page, 20);
  expect(await windowsLit(canvas, approvalDeskHouse)).toBe(0);
  expect(await doorStandsOpen(canvas, approvalDeskHouse)).toBe(true);
  expect(await windowsLit(canvas, teamHouse)).toBe(3);
  expect(await doorStandsOpen(canvas, teamHouse)).toBe(false);
  await expect(canvas).toHaveScreenshot("urgent-walking-smoking-2x.png", { maxDiffPixels: 0, threshold: 0 });

  // And inside the house its station stands empty for as long as it is out.
  await page.getByRole("button", { name: openHouseWords(approvalDeskHouse), exact: true }).click();
  await runTheClockFor(page, 1);
  await expect(canvas).toHaveAttribute("data-inside-of", approvalDeskHouse.name);
  await expect(canvas).toHaveAccessibleDescription(new RegExp(`${agent} is away from its station\\.`));
  await expect(canvas).toHaveScreenshot("urgent-away-inside-2x.png", { maxDiffPixels: 0, threshold: 0 });
  await page.getByRole("button", { name: BACK_TO_PLAZA_WORDS, exact: true }).click();
  await runTheClockFor(page, 1);
  await expect(canvas).not.toHaveAttribute("data-inside-of");

  await runTheClockUntil(page, "the tap on the shoulder", agentIs("tapping the owner on the shoulder"));
  await runTheClockFor(page, 9);
  await expect(canvas).toHaveScreenshot("urgent-shoulder-tap-2x.png", { maxDiffPixels: 0, threshold: 0 });
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  expect(await markIsPainted(canvas)).toBe(false);

  // The stack and the mark appear with the drop, as they do for the manager, and the paper wears its urgent tab.
  await runTheClockUntil(page, "the drop", agentIs("standing back from the desk"));
  await expect(canvas).toHaveAttribute("data-desk-papers", "1");
  await expect(canvas).toHaveAttribute("data-desk-mark", "showing");
  expect(await markIsPainted(canvas)).toBe(true);
  expect((await coloursIn(canvas, footOfTheStack)).has(palette.cream)).toBe(true);
  expect((await coloursIn(canvas, tabOfTheLowestPaper)).has(palette.ember)).toBe(true);
  await expect(canvas).toHaveScreenshot("urgent-dropped-2x.png", { maxDiffPixels: 0, threshold: 0 });

  // It walks home, goes in, and the house is as it was.
  await runTheClockUntil(page, "the agent being home again", has("data-agents-out", ""));
  expect(await story()).toEqual(["", ...walkOf(agent, APPROVAL_DESK), ""]);
  expect(await windowsLit(canvas, approvalDeskHouse)).toBe(1);
  expect(await doorStandsOpen(canvas, approvalDeskHouse)).toBe(false);
  for (const told of await story()) expect(told).not.toMatch(RULE_CODE);

  // The ordinary result has waited at its house all this time, and goes through the manager on his round.
  await expect(canvas).toHaveAttribute("data-desk-papers", "1");
  await expect(canvas).toHaveAttribute(
    "data-delivery",
    new RegExp(`1 paper waits at ${TEAM_PROJECT} for his next call\\.`),
  );
  await runTheClockUntil(page, "the manager's handover", managerIs(`being handed paperwork at ${TEAM_PROJECT}`));
  await expect(canvas).toHaveAttribute("data-desk-papers", "1");
  await runTheClockUntil(page, "the manager's drop", has("data-desk-papers", "2"));
  await expect(canvas).toHaveAttribute("data-delivery", /^The manager is standing back from the desk\./);
  expect(await story()).toEqual(["", ...walkOf(agent, APPROVAL_DESK), ""]);
  expect(pageErrors).toEqual([]);
});

test("the urgent walk also plays by itself, on the page's own running clock", async ({ page }) => {
  test.setTimeout(90_000);
  const nothingWaiting = withNothingWaiting(await frozenVillage(page));
  const { village: bothWaiting, agent } = withAnUrgentRequestAndAnOrdinaryResult(nothingWaiting);
  let hubAnswers = nothingWaiting;
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: hubAnswers }));

  await page.goto("/?scale=2");
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expectTheFrozenVillage(canvas);
  await expect(canvas).toHaveAttribute("data-agents-out", "");

  hubAnswers = bothWaiting;
  // The agent walks by itself; if the manager happens to be standing at its door that very moment, he takes it instead.
  await expect(canvas).toHaveAttribute(
    "data-delivery",
    new RegExp(`(${agent} is (stepping out of|walking urgent paperwork from) ${APPROVAL_DESK}|The manager is being handed paperwork at ${APPROVAL_DESK})`),
    { timeout: 15_000 },
  );
  await expect(canvas).toHaveAttribute("data-desk-papers", /^[12]$/, { timeout: 40_000 });
  await expect(canvas).toHaveAttribute("data-desk-mark", "showing");
});

test("what is already waiting when the page opens is on the desk, urgent or not: nobody walks it over", async ({
  page,
}) => {
  const village = await frozenVillage(page);
  const urgentAlready = village.projects.flatMap((project) => project.waiting).filter((item) => item.isUrgent);
  expect(urgentAlready.length).toBeGreaterThan(0);

  await page.goto(`/?time=${FIXED_TIME_MS}&scale=2`);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expectTheFrozenVillage(canvas);
  await expect(canvas).toHaveAttribute("data-desk-papers", String(village.waitingCount));
  await expect(canvas).toHaveAttribute("data-agents-out", "");
  expect(await windowsLit(canvas, approvalDeskHouse)).toBe(1);
  expect(await doorStandsOpen(canvas, approvalDeskHouse)).toBe(false);
});

test("H12: the urgent walk's words on the page are plain: no rule codes, and the owner's two lines are still his own", async ({
  page,
}) => {
  await page.goto(`/?time=${FIXED_TIME_MS}&scale=2`);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expectTheFrozenVillage(canvas);
  expect(await canvas.getAttribute("data-agents-out")).not.toMatch(RULE_CODE);
  expect(await canvas.getAttribute("data-delivery")).not.toMatch(RULE_CODE);
  await expect(page.locator("body")).not.toContainText(RULE_CODE);
  expect(URGENT_TAP_WORDS).not.toMatch(RULE_CODE);
  expect(HANDOVER_WORDS).toBe("oh snap, master has to see this");
  expect(SHOULDER_TAP_WORDS).toBe("here you go, master");
});
