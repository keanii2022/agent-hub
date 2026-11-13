import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PLAN_FILE, readBuildBoard } from "../app/api/clipboard/plans-on-disk";
import {
  BOARD_KEY_IN_WORDS,
  BUILD_BOARD_ROUTE,
  CANNOT_OPEN_FOLDER_WORDS,
  CLIPBOARD_NAME,
  HUB_PLANS_FOLDER_VARIABLE,
  NO_PROJECTS_WORDS,
  THIS_HUB_ONLY_WORDS,
  clipboardBounds,
  clipboardReach,
  nowWords,
  progressOfPlan,
  stepsDoneWords,
  type BoardRow,
  type BuildBoard,
} from "../lib/village/clipboard";
import { SCREEN_WIDTH, palette } from "../lib/village/engine";
import { villageHouses } from "../lib/village/houses";
import { openHouseWords } from "../lib/village/interiors";
import type { Rect } from "../lib/village/plaza";
import { expectTheFrozenVillage } from "./frozen-hub";
import { SCRIPTED_PLANS_FOLDER } from "./scripted-plans";

const FIXED_PLAZA = "/?time=4200&scale=2";
const COMPUTER_NAME = "The computer on the desk";
const RULE_CODE = /\b[HQ]\d{1,2}\b/;

// The development server adds its own floating badge, which is not part of the page.
async function hideTheDevBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function openPlaza(page: Page, address: string = FIXED_PLAZA): Promise<Locator> {
  await page.goto(address);
  await hideTheDevBadge(page);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expectTheFrozenVillage(canvas);
  return canvas;
}

function clipboardButton(page: Page): Locator {
  return page.getByRole("button", { name: CLIPBOARD_NAME, exact: true });
}

function boardHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Your build board" });
}

async function expectTheClipboard(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/clipboard$/);
  await expect(boardHeading(page)).toBeVisible();
}

async function expectThePlazaPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("img", { name: /plaza at dusk/i })).toBeVisible();
}

/** Opens the clipboard and waits until it shows a board from the hub. */
async function openClipboard(page: Page): Promise<void> {
  await page.goto("/clipboard");
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-board-from", /./);
}

function rowOf(page: Page, project: string): Locator {
  return page.getByRole("article", { name: project, exact: true });
}

async function colourAt(canvas: Locator, x: number, y: number): Promise<string> {
  return canvas.evaluate(
    (element: HTMLCanvasElement, at) => {
      const scale = Number(element.dataset.pixelScale);
      const context = element.getContext("2d");
      if (!context) throw new Error("Could not read the canvas");
      const [red, green, blue] = context.getImageData(at.x * scale, at.y * scale, 1, 1).data;
      return "#" + [red, green, blue].map((part) => part.toString(16).padStart(2, "0")).join("");
    },
    { x, y },
  );
}

const focusMarkCorner = { x: clipboardBounds.x - 2, y: clipboardBounds.y - 2 };

/** Tabs through the plaza until the keyboard is on the clipboard. */
async function tabToTheClipboard(page: Page): Promise<void> {
  for (let presses = 0; presses < villageHouses.length + 2; presses += 1) {
    await page.keyboard.press("Tab");
    if (await clipboardButton(page).evaluate((button) => button === document.activeElement)) return;
  }
  await expect(clipboardButton(page)).toBeFocused();
}

// ---- The scripted plans, read here straight from the same files the hub reads ----

function scriptedProjects(): string[] {
  return readdirSync(SCRIPTED_PLANS_FOLDER, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function planTextOf(project: string): string | null {
  try {
    return readFileSync(join(SCRIPTED_PLANS_FOLDER, project, PLAN_FILE), "utf8");
  } catch {
    return null;
  }
}

function fingerprintOfThePlans(): Record<string, string> {
  const prints: Record<string, string> = {};
  for (const entry of readdirSync(SCRIPTED_PLANS_FOLDER, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    prints[path] = createHash("sha256").update(readFileSync(path)).digest("hex");
  }
  return prints;
}

// ---- The clipboard on the pixel desk ----

test("the clipboard lies on the desk in the picture, and its button stays over it at every scale", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const canvas = await openPlaza(page, "/?time=4200");
  await expect(canvas).toHaveAttribute("data-pixel-scale", "3");
  // The board itself, the top of its sheet of paper, and the longer bar on the sheet.
  expect(await colourAt(canvas, clipboardBounds.x + 1, clipboardBounds.y + 2)).toBe(palette.wood);
  expect(await colourAt(canvas, clipboardBounds.x + 2, clipboardBounds.y + 2)).toBe(palette.cream);
  expect(await colourAt(canvas, clipboardBounds.x + 2, clipboardBounds.y + 3)).toBe(palette.grass);

  async function expectButtonOverClipboard(): Promise<void> {
    await expect
      .poll(async () => {
        const canvasBox = await canvas.boundingBox();
        const buttonBox = await clipboardButton(page).boundingBox();
        if (!canvasBox || !buttonBox) return null;
        const pagePixelsPerVillagePixel = canvasBox.width / SCREEN_WIDTH;
        return [
          (buttonBox.x - canvasBox.x) / pagePixelsPerVillagePixel,
          (buttonBox.y - canvasBox.y) / pagePixelsPerVillagePixel,
          buttonBox.width / pagePixelsPerVillagePixel,
          buttonBox.height / pagePixelsPerVillagePixel,
        ].map((villagePixels) => Math.round(villagePixels * 10) / 10);
      })
      .toEqual([clipboardReach.x, clipboardReach.y, clipboardReach.width, clipboardReach.height]);
  }

  await expectButtonOverClipboard();
  await page.setViewportSize({ width: 900, height: 600 });
  await expect(canvas).toHaveAttribute("data-pixel-scale", "2");
  await expectButtonOverClipboard();
});

test("a click on the clipboard's picture opens the build board, and reading starts at its heading", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  const canvas = await openPlaza(page);

  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("The canvas is not on the page");
  const pagePixelsPerVillagePixel = canvasBox.width / SCREEN_WIDTH;
  const middleOf = (area: Rect) => ({ x: area.x + area.width / 2, y: area.y + area.height / 2 });
  const middle = middleOf(clipboardBounds);
  await page.mouse.click(
    canvasBox.x + middle.x * pagePixelsPerVillagePixel,
    canvasBox.y + middle.y * pagePixelsPerVillagePixel,
  );

  await expectTheClipboard(page);
  await expect(boardHeading(page)).toBeFocused();
  await expect(page).toHaveTitle(/Your build board/);
  expect(pageErrors).toEqual([]);
});

test("the clipboard is reached with the keyboard, after the computer and the houses, and shows a focus mark", async ({
  page,
}) => {
  const canvas = await openPlaza(page);
  expect(await colourAt(canvas, focusMarkCorner.x, focusMarkCorner.y)).not.toBe(palette.lamp);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: COMPUTER_NAME })).toBeFocused();
  for (const house of villageHouses) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: openHouseWords(house), exact: true })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(clipboardButton(page)).toBeFocused();

  await expect.poll(() => colourAt(canvas, focusMarkCorner.x, focusMarkCorner.y)).toBe(palette.lamp);
  await expect(canvas).toHaveScreenshot("plaza-clipboard-focused-2x.png", { maxDiffPixels: 0, threshold: 0 });

  await clipboardButton(page).blur();
  await expect.poll(() => colourAt(canvas, focusMarkCorner.x, focusMarkCorner.y)).not.toBe(palette.lamp);
});

for (const key of ["Enter", "Space"] as const) {
  test(`${key} on the focused clipboard opens the build board`, async ({ page }) => {
    await openPlaza(page);
    await tabToTheClipboard(page);

    await page.keyboard.press(key);

    await expectTheClipboard(page);
    await expect(boardHeading(page)).toBeFocused();
  });
}

test("the plaza says in plain words which key opens the clipboard, and that key opens it", async ({ page }) => {
  await openPlaza(page);
  await expect(page.getByText("Press C for the clipboard")).toBeVisible();
  await expect(page.getByText("or press D")).toBeVisible();

  await page.keyboard.press("c");

  await expectTheClipboard(page);
  await expect(boardHeading(page)).toBeFocused();
});

test("the key that opens the clipboard is left alone while typing in a text field, and so is copy", async ({ page }) => {
  await openPlaza(page);
  const addressBefore = page.url();
  // The plaza has no text field yet, so this test brings its own.
  await page.evaluate(() => {
    const field = document.createElement("input");
    field.setAttribute("aria-label", "A note");
    document.body.append(field);
    field.focus();
  });
  const field = page.getByRole("textbox", { name: "A note" });

  await page.keyboard.type("a quick check, come back");
  await expect(field).toHaveValue("a quick check, come back");
  expect(page.url()).toBe(addressBefore);

  await field.blur();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Meta+c");
  await page.waitForTimeout(300);
  expect(page.url()).toBe(addressBefore);
});

test("the clipboard's button is put away while a house is open", async ({ page }) => {
  await openPlaza(page);
  await expect(clipboardButton(page)).toBeVisible();

  await page.getByRole("button", { name: openHouseWords(villageHouses[0]), exact: true }).click();

  // The picture's words change when a house is opened, so this holds the canvas itself.
  await expect(page.locator("canvas")).toHaveAttribute("data-inside-of", villageHouses[0].name);
  await expect(clipboardButton(page)).toBeHidden();
});

test("the desk has one small line that opens the clipboard", async ({ page }) => {
  await page.goto("/desk");
  await page.getByRole("link", { name: "Open the clipboard" }).click();
  await expectTheClipboard(page);
});

test("the clipboard has a clear way back to the plaza: a link, and Escape", async ({ page }) => {
  await openClipboard(page);
  await page.getByRole("link", { name: "Back to the village" }).click();
  await expectThePlazaPage(page);

  await page.keyboard.press("c");
  await expectTheClipboard(page);
  await expect(page.getByText("or press Esc")).toBeVisible();
  await page.keyboard.press("Escape");
  await expectThePlazaPage(page);
});

// ---- The build board, from the scripted folder of plans ----

test("the board's numbers match the PLAN.md files in the scripted folder", async ({ page }) => {
  const projects = scriptedProjects();
  expect(projects.length).toBeGreaterThanOrEqual(6);
  await openClipboard(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-board-from", "plans folder");
  await expect(page.getByRole("article")).toHaveCount(projects.length);
  await expect(page.getByRole("heading", { level: 2, name: `Projects (${projects.length})` })).toBeVisible();
  // One row per project, in name order.
  expect(await page.getByRole("article").getByRole("heading", { level: 3 }).allInnerTexts()).toEqual(projects);

  let rowsWithNumbers = 0;
  for (const project of projects) {
    const row = rowOf(page, project);
    const planText = planTextOf(project);
    const progress = planText === null ? null : progressOfPlan(planText);
    if (progress === null) {
      await expect(row.getByRole("progressbar")).toHaveCount(0);
      await expect(row).not.toContainText("steps done");
      continue;
    }
    rowsWithNumbers += 1;
    await expect(row).toContainText(`${progress.done} of ${progress.total} steps done`);
    const bar = row.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", String(progress.done));
    await expect(bar).toHaveAttribute("aria-valuemax", String(progress.total));
    await expect(bar).toHaveAttribute("aria-valuetext", stepsDoneWords(progress.done, progress.total));
    await expect(bar.locator("[data-step]")).toHaveCount(progress.total);
    await expect(bar.locator('[data-step="done"]')).toHaveCount(progress.done);
    await expect(bar.locator('[data-step="current"]')).toHaveCount(progress.currentSteps.length);
    expect(await bar.locator("[data-step]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-step")))).toEqual(
      progress.steps,
    );
    for (const step of progress.currentSteps) await expect(row).toContainText(`step ${step.number}: ${step.name}`);
  }
  expect(rowsWithNumbers).toBeGreaterThanOrEqual(4);
});

test("the board's numbers are the ones a person counts in those files", async ({ page }) => {
  // Counted without the hub's own reader, in the part of the file between its two rules, where the steps are:
  // ticked and unticked step boxes with a status line straight under them.
  const [, bakerySteps = ""] = (planTextOf("bakery-orders") ?? "").split("\n---\n");
  const stepBoxes = [...bakerySteps.matchAll(/^- \[([ x])\] \*\*Step \d+: .+\n {2}- \*\*Status:\*\* /gm)];
  const ticked = stepBoxes.filter((box) => box[1] === "x").length;
  expect([ticked, stepBoxes.length]).toEqual([3, 7]);

  await openClipboard(page);
  const expected: Record<string, [numbers: string, now: string]> = {
    "bakery-orders": [`${ticked} of ${stepBoxes.length} steps done`, "Now on step 4: Morning bake list"],
    "kite-shop": ["2 of 5 steps done", "Now on step 3: Wind checker"],
    "lighthouse-log": ["4 of 4 steps done", "Finished: every step is done."],
    "paper-boats": ["1 of 3 steps done", "No step is marked as the one being worked on."],
  };
  for (const [project, [numbers, now]] of Object.entries(expected)) {
    await expect(rowOf(page, project).getByText(numbers, { exact: true })).toBeVisible();
    await expect(rowOf(page, project).getByText(now, { exact: true })).toBeVisible();
    await expect(rowOf(page, project).getByRole("progressbar", { name: project })).toBeVisible();
  }
  await expect(page.getByText(BOARD_KEY_IN_WORDS)).toBeVisible();
});

test("H9: a project with no plan file and one whose plan has no steps say so plainly, and the others are all there", async ({
  page,
}) => {
  await openClipboard(page);

  await expect(rowOf(page, "tide-tables")).toContainText("This project has no plan file.");
  await expect(rowOf(page, "scrambled-notes")).toContainText(
    "The hub can't find the steps in this project's plan, so it has no numbers for it.",
  );
  for (const project of ["tide-tables", "scrambled-notes"]) {
    await expect(rowOf(page, project).getByRole("progressbar")).toHaveCount(0);
  }
  await expect(page.getByRole("progressbar")).toHaveCount(scriptedProjects().length - 2);
});

test("the hub's own route gives exactly what the scripted files say", async ({ request }) => {
  const response = await request.get(BUILD_BOARD_ROUTE);
  expect(response.status()).toBe(200);
  const board: BuildBoard = await response.json();

  expect(board).toEqual(readBuildBoard({ plansFolder: SCRIPTED_PLANS_FOLDER, hubFolder: process.cwd() }));
  expect(board.projects.map((row) => row.project)).toEqual(scriptedProjects());
  expect(JSON.stringify(board)).not.toContain(process.cwd());
});

test("H3: the clipboard only reads: its route takes nothing, nothing on the board can be pressed, and the plans stay as they were", async ({
  page,
  request,
}) => {
  const before = fingerprintOfThePlans();
  for (const send of [request.post, request.put, request.patch, request.delete]) {
    const response = await send.call(request, BUILD_BOARD_ROUTE, { data: { project: "bakery-orders", done: 7 } });
    expect(response.status()).toBe(405);
  }

  await openClipboard(page);
  await expect(page.getByRole("article")).toHaveCount(scriptedProjects().length);
  for (const control of ["button", "textbox", "checkbox", "combobox"] as const) {
    await expect(page.getByRole("main").getByRole(control)).toHaveCount(0);
  }
  await expect(page.getByRole("main").getByRole("link")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("main")).toHaveAttribute("data-board-from", "plans folder");

  expect(fingerprintOfThePlans()).toEqual(before);
});

test("H12: the clipboard speaks plain words: no rule codes, no setting names, no file names", async ({ page }) => {
  await openClipboard(page);
  await expect(page.getByRole("article")).toHaveCount(scriptedProjects().length);

  const words = await page.locator("body").innerText();
  expect(words).not.toMatch(RULE_CODE);
  for (const code of [HUB_PLANS_FOLDER_VARIABLE, PLAN_FILE, "not-started", "undefined", "null", "NaN", "unreadable"]) {
    expect(words).not.toContain(code);
  }
  for (const named of await page.locator("[aria-label], [aria-valuetext]").all()) {
    expect((await named.getAttribute("aria-label")) ?? "").not.toMatch(RULE_CODE);
    expect((await named.getAttribute("aria-valuetext")) ?? "").not.toMatch(RULE_CODE);
  }
  expect(await page.title()).not.toMatch(RULE_CODE);
  expect(CLIPBOARD_NAME).not.toMatch(RULE_CODE);
});

// ---- A scripted hub: boards the scripted folder can't show ----

async function answerTheBoardWith(page: Page, board: BuildBoard): Promise<void> {
  await page.route(`**${BUILD_BOARD_ROUTE}`, (route) => route.fulfill({ json: board }));
}

const gardenRow: BoardRow = {
  project: "garden-club",
  plan: "read",
  total: 6,
  done: 2,
  steps: ["done", "done", "current", "current", "not yet", "not yet"],
  currentSteps: [
    { number: "3", name: "Seed swap" },
    { number: "4", name: "Rota" },
  ],
};

test("with no folder of projects named, the board shows this hub's own plan and says why", async ({ page }) => {
  const ownRow: BoardRow = { ...gardenRow, project: "agent-hub" };
  await answerTheBoardWith(page, { from: "this hub only", cannotOpenFolder: false, projects: [ownRow] });
  await openClipboard(page);

  await expect(page.getByText(THIS_HUB_ONLY_WORDS)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(rowOf(page, "agent-hub")).toContainText("2 of 6 steps done");
});

test("a project being worked on in several steps at once names each of them", async ({ page }) => {
  await answerTheBoardWith(page, { from: "plans folder", cannotOpenFolder: false, projects: [gardenRow] });
  await openClipboard(page);

  await expect(rowOf(page, "garden-club")).toContainText(nowWords(gardenRow));
  await expect(rowOf(page, "garden-club")).toContainText("Now on 2 steps at once: step 3: Seed swap; step 4: Rota");
  await expect(page.getByText(THIS_HUB_ONLY_WORDS)).toHaveCount(0);
});

test("H9: a plan the hub can't open gets its own row, and the project next to it keeps its numbers", async ({ page }) => {
  await answerTheBoardWith(page, {
    from: "plans folder",
    cannotOpenFolder: false,
    projects: [gardenRow, { project: "print-shop", plan: "unreadable" }],
  });
  await openClipboard(page);

  await expect(rowOf(page, "print-shop")).toContainText("The hub can't open this project's plan.");
  await expect(rowOf(page, "garden-club")).toContainText("2 of 6 steps done");
});

test("a folder the hub can't open, and a folder with no projects, each say so in plain words", async ({ page }) => {
  await answerTheBoardWith(page, { from: "plans folder", cannotOpenFolder: true, projects: [] });
  await openClipboard(page);
  await expect(page.getByText(CANNOT_OPEN_FOLDER_WORDS)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);

  await page.unroute(`**${BUILD_BOARD_ROUTE}`);
  await answerTheBoardWith(page, { from: "plans folder", cannotOpenFolder: false, projects: [] });
  await openClipboard(page);
  await expect(page.getByText(NO_PROJECTS_WORDS)).toBeVisible();
  await expect(page.getByText(BOARD_KEY_IN_WORDS)).toHaveCount(0);
});

test("H9: when the hub gives no board, the clipboard says so, and the way back still works", async ({ page }) => {
  await page.route(`**${BUILD_BOARD_ROUTE}`, (route) =>
    route.fulfill({ status: 500, json: { problem: "The hub couldn't read the plans." } }),
  );
  await page.goto("/clipboard");

  await expect(page.getByText("The clipboard can't reach the hub right now. It keeps trying.")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expectThePlazaPage(page);
});

test("H9: when the hub goes quiet after answering, the board it gave stays up and is marked as maybe out of date", async ({
  page,
}) => {
  let hubAnswers = true;
  await page.route(`**${BUILD_BOARD_ROUTE}`, (route) =>
    hubAnswers
      ? route.fulfill({ json: { from: "plans folder", cannotOpenFolder: false, projects: [gardenRow] } })
      : route.abort(),
  );
  await openClipboard(page);
  await expect(rowOf(page, "garden-club")).toBeVisible();

  hubAnswers = false;

  await expect(page.getByText("This board may be out of date.")).toBeVisible({ timeout: 15_000 });
  await expect(rowOf(page, "garden-club")).toContainText("2 of 6 steps done");
});
