import { expect, test, type Locator, type Page } from "@playwright/test";
import type { FeedLine } from "../lib/feed";
import { HANDOVER_WORDS, SHOULDER_TAP_WORDS, deskMark } from "../lib/village/delivery";
import { palette } from "../lib/village/engine";
import { villageHouses } from "../lib/village/houses";
import { desk, type Rect } from "../lib/village/plaza";
import { VILLAGE_STATE_ROUTE, type VillageState, type WaitingItem } from "../lib/village/state";
import { FROZEN_HUB_MOMENT, expectTheFrozenVillage } from "./frozen-hub";

// Paused at a known moment, the village always paints the same frame.
const FIXED_TIME_MS = 4200;
const COMPUTER_NAME = "The computer on the desk";

const [approvalDeskHouse, teamHouse] = villageHouses;
const APPROVAL_DESK = approvalDeskHouse.project as string;
const TEAM_PROJECT = teamHouse.project as string;

async function openVillage(page: Page, query: string): Promise<Locator> {
  await page.goto(`/${query}`);
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expectTheFrozenVillage(canvas);
  return canvas;
}

function computerButton(page: Page): Locator {
  return page.getByRole("button", { name: COMPUTER_NAME });
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

const markArea: Rect = {
  x: desk.markSpot.x - Math.floor(deskMark.width / 2),
  y: desk.markSpot.y - deskMark.height,
  width: deskMark.width,
  height: deskMark.height + 1,
};

/** The three rows of paper nearest the table, where any stack at all has paper. */
const footOfTheStack: Rect = { x: desk.stackSpot.x - 2, y: desk.stackSpot.y - 3, width: 5, height: 3 };

async function markIsPainted(canvas: Locator): Promise<boolean> {
  return (await coloursIn(canvas, markArea)).has(palette.lamp);
}

async function stackIsPainted(canvas: Locator): Promise<boolean> {
  return (await coloursIn(canvas, footOfTheStack)).has(palette.cream);
}

async function frozenVillage(page: Page): Promise<VillageState> {
  const response = await page.request.get(VILLAGE_STATE_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

test("what is already waiting when the page opens is on the desk from the first frame, under the mark", async ({
  page,
}) => {
  const village = await frozenVillage(page);
  expect(village.waitingCount).toBeGreaterThan(0);

  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  await expect(canvas).toHaveAttribute("data-desk-papers", String(village.waitingCount));
  await expect(canvas).toHaveAttribute("data-desk-mark", "showing");
  expect(await stackIsPainted(canvas)).toBe(true);
  expect(await markIsPainted(canvas)).toBe(true);
  // Nobody is carrying anything: the manager is where his round has him.
  await expect(canvas).toHaveAttribute("data-delivery", /^The manager is walking to /);
});

for (const how of ["a click", "Enter", "Space"] as const) {
  test(`opening the desk with ${how} clears the mark, keeps the stack, and goes nowhere`, async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));
    const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
    await expect(canvas).toHaveAttribute("data-desk-mark", "showing");
    const papers = await canvas.getAttribute("data-desk-papers");
    const addressBefore = page.url();

    if (how === "a click") await computerButton(page).click();
    else await computerButton(page).press(how);

    await expect(canvas).toHaveAttribute("data-desk-mark", "cleared");
    await expect.poll(() => markIsPainted(canvas)).toBe(false);
    expect(await stackIsPainted(canvas)).toBe(true);
    await expect(canvas).toHaveAttribute("data-desk-papers", papers ?? "");
    await expect(canvas).toHaveAttribute("data-delivery", /papers? (is|are) waiting on the desk\.$/);
    expect(page.url()).toBe(addressBefore);
    expect(pageErrors).toEqual([]);
  });
}

/** Every part of one house's handover, as the page tells it, in order. */
function handoverAt(house: string): string[] {
  return [
    `The manager is being handed paperwork at ${house}.`,
    `The manager is taking the paperwork at ${house}.`,
    `The manager is carrying paperwork from ${house} to the desk.`,
    "The manager is tapping the owner on the shoulder.",
    "The manager is walking round the desk with the paperwork.",
    "The manager is putting the paperwork on the desk.",
    "The manager is standing back from the desk.",
  ];
}

/** The parts of a story from the first of `parts` on, as many as `parts` has: equal to `parts` when they ran unbroken. */
function toldFrom(story: readonly string[], parts: readonly string[]): string[] {
  const from = story.indexOf(parts[0]);
  return from < 0 ? [] : story.slice(from, from + parts.length);
}

function scriptedLine(project: string, agent: string, id: string, status: "needs_human" | "result_ready"): FeedLine {
  const line = {
    project,
    agent,
    request: `REQUEST-${id}`,
    step: status === "needs_human" ? "gate" : "report",
    what: status === "needs_human" ? "Needs the owner's answer" : "The report is ready to read",
    when: "2026-10-05T14:07:00Z",
    id,
    demo: true,
  };
  return status === "needs_human"
    ? { ...line, status, choices: [{ id: "approve", label: "Approve" }, { id: "reject", label: "Reject" }] }
    : { ...line, status };
}

// The page's own time, moved on by hand in steps of six frames. Nothing in the
// village reads any other clock, so the same number of steps always paints the
// same frame: the handover can be stopped anywhere and compared to a saved picture.
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

test("scripted \"needs a decision\" and \"result ready\" events play the whole handover, one house after the other", async ({
  page,
}) => {
  test.setTimeout(120_000);

  // This test's hub is scripted: the same frozen village, first with nothing
  // waiting, then with one request to decide and one result to read.
  const frozen = await frozenVillage(page);
  const nothingWaiting: VillageState = {
    ...frozen,
    projects: frozen.projects.map((project) => ({ ...project, waiting: [], ready: [] })),
    waitingCount: 0,
  };
  const decision: WaitingItem = {
    kind: "decision",
    line: scriptedLine(APPROVAL_DESK, "refund-agent", "scripted-ask", "needs_human"),
    waitedMs: 30_000,
    isUrgent: false,
  };
  const result: WaitingItem = {
    kind: "result",
    line: scriptedLine(TEAM_PROJECT, "builder", "scripted-report", "result_ready"),
    waitedMs: 20_000,
    isUrgent: false,
  };
  const twoWaiting: VillageState = {
    ...nothingWaiting,
    projects: nothingWaiting.projects.map((project) =>
      project.project === APPROVAL_DESK
        ? { ...project, waiting: [decision] }
        : project.project === TEAM_PROJECT
          ? { ...project, ready: [result] }
          : project,
    ),
    waitingCount: 2,
  };
  let hubAnswers = nothingWaiting;
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: hubAnswers }));

  await page.clock.install({ time: new Date(FROZEN_HUB_MOMENT) });
  await page.clock.pauseAt(new Date(FROZEN_HUB_MOMENT));
  await page.goto("/?scale=2");
  // The development server adds its own floating badge, which is not part of the page.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");

  const has = (attribute: string, value: string | RegExp) => async (): Promise<boolean> => {
    const found = (await canvas.getAttribute(attribute)) ?? "";
    return typeof value === "string" ? found === value : value.test(found);
  };
  const isDoing = (doing: string): (() => Promise<boolean>) =>
    has("data-delivery", new RegExp(`^The manager is ${doing}`));

  await runTheClockUntil(page, "the hub's first answer", has("data-village-as-of", FROZEN_HUB_MOMENT));
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  await expect(canvas).toHaveAttribute("data-desk-mark", "cleared");
  expect(await stackIsPainted(canvas)).toBe(false);
  expect(await markIsPainted(canvas)).toBe(false);

  // Everything the page says the manager does from here on, in order.
  await canvas.evaluate((element) => {
    const told: string[] = [];
    (window as unknown as { handoverStory: string[] }).handoverStory = told;
    const note = (): void => {
      const words = (element as HTMLElement).dataset.delivery ?? "";
      const doing = words.slice(0, words.indexOf(".") + 1);
      if (told[told.length - 1] !== doing) told.push(doing);
    };
    new MutationObserver(note).observe(element, { attributes: true, attributeFilter: ["data-delivery"] });
    note();
  });
  const story = (): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { handoverStory: string[] }).handoverStory);

  hubAnswers = twoWaiting;
  await runTheClockUntil(
    page,
    "hearing of the paperwork at both houses",
    has(
      "data-delivery",
      new RegExp(`1 paper waits at ${APPROVAL_DESK} for his next call\\. 1 paper waits at ${TEAM_PROJECT} for his next call\\.`),
    ),
  );
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  await expect(canvas).toHaveAttribute("data-delivery", new RegExp(`^The manager is walking to ${APPROVAL_DESK}\\.`));

  // The request to decide comes over first: approval-desk is the first door of his round.
  await runTheClockUntil(page, "the handover at the door", isDoing(`being handed paperwork at ${APPROVAL_DESK}`));
  await runTheClockFor(page, 10);
  await expect(canvas).toHaveScreenshot("handover-at-the-door-2x.png", { maxDiffPixels: 0, threshold: 0 });

  await runTheClockUntil(page, "the walk to the desk", isDoing(`carrying paperwork from ${APPROVAL_DESK} to the desk`));
  await runTheClockFor(page, 30);
  await expect(canvas).toHaveScreenshot("carrying-paperwork-2x.png", { maxDiffPixels: 0, threshold: 0 });

  await runTheClockUntil(page, "the tap on the shoulder", isDoing("tapping the owner on the shoulder"));
  await runTheClockFor(page, 9);
  await expect(canvas).toHaveScreenshot("shoulder-tap-2x.png", { maxDiffPixels: 0, threshold: 0 });
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  expect(await markIsPainted(canvas)).toBe(false);

  // The stack and the mark appear with the drop, not before.
  await runTheClockUntil(page, "the drop", isDoing("standing back from the desk"));
  await expect(canvas).toHaveAttribute("data-desk-papers", "1");
  await expect(canvas).toHaveAttribute("data-desk-mark", "showing");
  expect(await stackIsPainted(canvas)).toBe(true);
  expect(await markIsPainted(canvas)).toBe(true);
  await expect(canvas).toHaveScreenshot("paperwork-dropped-2x.png", { maxDiffPixels: 0, threshold: 0 });

  // The owner opens the desk: the mark clears, and stays cleared until the next drop.
  await computerButton(page).click();
  await runTheClockFor(page, 1);
  await expect(canvas).toHaveAttribute("data-desk-mark", "cleared");
  expect(await markIsPainted(canvas)).toBe(false);
  expect(await stackIsPainted(canvas)).toBe(true);

  // Then the result, from the team house, the same way, and the mark comes back.
  await runTheClockUntil(page, "the second handover", isDoing(`being handed paperwork at ${TEAM_PROJECT}`));
  await expect(canvas).toHaveAttribute("data-desk-papers", "1");
  await expect(canvas).toHaveAttribute("data-desk-mark", "cleared");
  await runTheClockUntil(page, "the second drop", has("data-desk-papers", "2"));
  await expect(canvas).toHaveAttribute("data-desk-mark", "showing");
  expect(await markIsPainted(canvas)).toBe(true);

  const told = await story();
  expect(toldFrom(told, [`The manager is knocking at ${APPROVAL_DESK}.`, ...handoverAt(APPROVAL_DESK)])).toEqual([
    `The manager is knocking at ${APPROVAL_DESK}.`,
    ...handoverAt(APPROVAL_DESK),
  ]);
  expect(toldFrom(told, [`The manager is walking to ${TEAM_PROJECT}.`, `The manager is knocking at ${TEAM_PROJECT}.`, ...handoverAt(TEAM_PROJECT)])).toEqual([
    `The manager is walking to ${TEAM_PROJECT}.`,
    `The manager is knocking at ${TEAM_PROJECT}.`,
    ...handoverAt(TEAM_PROJECT),
  ]);

  // When the hub says one of them no longer waits, the stack is one paper shorter.
  hubAnswers = {
    ...twoWaiting,
    projects: twoWaiting.projects.map((project) =>
      project.project === APPROVAL_DESK ? { ...project, waiting: [] } : project,
    ),
    waitingCount: 1,
  };
  await runTheClockUntil(page, "the stack shrinking", has("data-desk-papers", "1"));
  expect(await stackIsPainted(canvas)).toBe(true);
});

test("the handover also plays by itself, on the page's own running clock", async ({ page }) => {
  const frozen = await frozenVillage(page);
  const nothingWaiting: VillageState = {
    ...frozen,
    projects: frozen.projects.map((project) => ({ ...project, waiting: [], ready: [] })),
    waitingCount: 0,
  };
  const decision: WaitingItem = {
    kind: "decision",
    line: scriptedLine(APPROVAL_DESK, "refund-agent", "scripted-ask", "needs_human"),
    waitedMs: 30_000,
    isUrgent: false,
  };
  let hubAnswers = nothingWaiting;
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: hubAnswers }));

  const canvas = await openVillage(page, "?scale=2");
  await expect(canvas).toHaveAttribute("data-desk-papers", "0");
  hubAnswers = {
    ...nothingWaiting,
    projects: nothingWaiting.projects.map((project) =>
      project.project === APPROVAL_DESK ? { ...project, waiting: [decision] } : project,
    ),
    waitingCount: 1,
  };
  // He reaches the first door a few seconds into every round; a slow start may have to wait for the next one.
  test.setTimeout(150_000);
  await expect(canvas).toHaveAttribute(
    "data-delivery",
    new RegExp(`^The manager is (being handed paperwork|taking the paperwork) at ${APPROVAL_DESK}\\.`),
    { timeout: 100_000 },
  );
  await expect(canvas).toHaveAttribute("data-delivery", /^The manager is carrying paperwork from /, { timeout: 10_000 });
});

test("H12: the handover's words on the page are plain: no rule codes, and the two lines are the owner's own", async ({
  page,
}) => {
  const canvas = await openVillage(page, `?time=${FIXED_TIME_MS}&scale=2`);
  const ruleCode = /\b[HQ]\d{1,2}\b/;
  expect(await canvas.getAttribute("data-delivery")).not.toMatch(ruleCode);
  await expect(page.locator("body")).not.toContainText(ruleCode);
  expect(HANDOVER_WORDS).toBe("oh snap, master has to see this");
  expect(SHOULDER_TAP_WORDS).toBe("here you go, master");
});
