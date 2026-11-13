import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DESK_KEY, opensTheDesk } from "../../lib/desk";
import {
  BOARD_KEY_IN_WORDS,
  BUILD_BOARD_ROUTE,
  CANNOT_OPEN_FOLDER_WORDS,
  CLIPBOARD_KEY,
  CLIPBOARD_NAME,
  HUB_PLANS_FOLDER_VARIABLE,
  NO_PROJECTS_WORDS,
  THIS_HUB_ONLY_WORDS,
  askForBuildBoard,
  boardRowFor,
  clipboardBounds,
  clipboardOnTheDesk,
  clipboardReach,
  drawClipboard,
  leavesTheClipboard,
  nowWords,
  opensTheClipboard,
  plansFolderFrom,
  progressOfPlan,
  stepsDoneWords,
  stepsOfPlan,
  watchBuildBoard,
  type BoardRow,
  type BuildBoard,
} from "../../lib/village/clipboard";
import { colourAt, createSurface, type ColourName } from "../../lib/village/engine";
import { drawVillage } from "../../lib/village/houses";
import { desk, isInsideRect, plazaStateAt, type Rect } from "../../lib/village/plaza";
import { KEYBOARD_KEYS_ACROSS } from "../../lib/village/plaza/sprites";

const boxesPlan = `# Stage 1 plan

**How to use this file**

- To tick a step: change its Status to \`done\`, tick its box, and mark the next step \`current\`.
- Statuses: \`not-started\`, \`current\`, \`done\`. Only one step is ever \`current\`.
- [x] Read the rules first.

---

- [x] **Step 1: Skeleton**
  - **Status:** done
  - **Goal:** Start the project.
  - [x] Pick a name.
  - [ ] Ask someone.

- [x] **Step 2: Feed format** (parts 3 and 4)
  - **Status:** done

- [ ] **Step 3: Hub store** (part 5)
  - **Status:** current
  - **Goal:** The hub's own record.

- [ ] **Step 4: \`Demo\` player**
  - **Status:** not-started

---

## Later (not now)

- **Real house:** a translator.
- [ ] More houses.
- [x] Sound.

## Calls to review

- **Step 2: how the feed looks.** One line each.
- [ ] **Step 3: where the record lives.** In a file.
`;

const headingsPlan = `# Garden plan

## Steps

### 1. Dig the beds

**Status:** done

### 2. Plant the beans

**Status:** done

- [x] Buy seeds.

### 3. Hub store

**Status:** current

### 4. Water butt

**Status:** not-started

## Later

### Ideas

### 5. A pond

Not decided.

## Calls to review

### 1. Which beans

Runner beans.
`;

describe("reading a plan written as tick boxes", () => {
  it("counts the steps, the done ones, and names the one being worked on", () => {
    expect(progressOfPlan(boxesPlan)).toEqual({
      total: 4,
      done: 2,
      steps: ["done", "done", "current", "not yet"],
      currentSteps: [{ number: "3", name: "Hub store" }],
    });
  });

  it("keeps a step's name in plain words: no stars, no backticks, nothing after the bold part", () => {
    expect(stepsOfPlan(boxesPlan).map((step) => step.name)).toEqual([
      "Skeleton",
      "Feed format",
      "Hub store",
      "Demo player",
    ]);
  });

  it("does not count other tick boxes: a to-do under a step, a Later list, a call to review", () => {
    const numbers = stepsOfPlan(boxesPlan).map((step) => step.number);
    expect(numbers).toEqual(["1", "2", "3", "4"]);
  });

  it("reads a plan of boxes with no status lines by its ticks alone", () => {
    const ticksOnly = "- [x] **Step 1: Dig**\n- [X] Step 2: Plant\n- [ ] **Step 3: Water**\n- [ ] Buy a hose\n";
    expect(progressOfPlan(ticksOnly)).toEqual({
      total: 3,
      done: 2,
      steps: ["done", "done", "not yet"],
      currentSteps: [],
    });
  });

  it("takes a ticked box as done even when its status line has not caught up", () => {
    const plan = "- [x] **Step 1: Dig**\n  - **Status:** current\n- [ ] **Step 2: Plant**\n  - **Status:** done\n";
    expect(progressOfPlan(plan)).toMatchObject({ total: 2, done: 2, currentSteps: [] });
  });

  it("names every step marked current, in the plan's order", () => {
    const plan = [
      "- [x] **Step 1: Dig**",
      "  - **Status:** done",
      "- [ ] **Step 2: Plant**",
      "  - **Status:** current",
      "- [ ] **Step 2.5: Net the beans**",
      "  - **Status:** current",
    ].join("\r\n");
    expect(progressOfPlan(plan)?.currentSteps).toEqual([
      { number: "2", name: "Plant" },
      { number: "2.5", name: "Net the beans" },
    ]);
  });

  it("only takes the first status line under a step", () => {
    const plan = "- [ ] **Step 1: Dig**\n  - **Status:** not-started\n  - **Status:** done\n";
    expect(progressOfPlan(plan)).toMatchObject({ total: 1, done: 0 });
  });
});

describe("reading a plan written as numbered headings", () => {
  it("counts the steps, the done ones, and names the one being worked on", () => {
    expect(progressOfPlan(headingsPlan)).toEqual({
      total: 4,
      done: 2,
      steps: ["done", "done", "current", "not yet"],
      currentSteps: [{ number: "3", name: "Hub store" }],
    });
  });

  it("does not count a heading with no status line under it, numbered or not", () => {
    expect(stepsOfPlan(headingsPlan).map((step) => step.name)).toEqual([
      "Dig the beds",
      "Plant the beans",
      "Hub store",
      "Water butt",
    ]);
  });

  it("does not let a status line reach back past another heading", () => {
    const plan = "### 1. Dig\n\n## Notes\n\n**Status:** done\n";
    expect(progressOfPlan(plan)).toBeNull();
  });

  it("reads a heading that says Step too, and a status with no bullet or with one", () => {
    const plan = "## Step 1: Dig\n- **Status:** done\n\n## Step 2: Plant\nStatus: current\n";
    expect(progressOfPlan(plan)).toEqual({
      total: 2,
      done: 1,
      steps: ["done", "current"],
      currentSteps: [{ number: "2", name: "Plant" }],
    });
  });
});

describe("reading any plan", () => {
  it("skips what is inside a code block, such as an example of how to write a step", () => {
    const plan = "```\n- [x] **Step 9: An example**\n  - **Status:** done\n```\n\n- [ ] **Step 1: Dig**\n  - **Status:** current\n";
    expect(progressOfPlan(plan)).toMatchObject({ total: 1, done: 0 });
  });

  it("says a finished plan is all done, with nothing current", () => {
    const plan = "- [x] **Step 1: Dig**\n  - **Status:** done\n- [x] **Step 2: Plant**\n  - **Status:** done\n";
    expect(progressOfPlan(plan)).toEqual({ total: 2, done: 2, steps: ["done", "done"], currentSteps: [] });
  });

  it("gives no numbers for words with no steps in them: it never guesses", () => {
    for (const notAPlan of ["", "# Thoughts\n\n- Buy a notebook.\n- [ ] Sort the notes.\n", "**Status:** done\n"]) {
      expect(progressOfPlan(notAPlan)).toBeNull();
    }
  });

  it("understands this hub's own plan", () => {
    const own = progressOfPlan(readFileSync("PLAN.md", "utf8"));
    expect(own).not.toBeNull();
    expect(own!.total).toBeGreaterThanOrEqual(18);
    expect(own!.done).toBeGreaterThanOrEqual(12);
    expect(own!.done).toBeLessThanOrEqual(own!.total);
    expect(own!.steps).toHaveLength(own!.total);
  });
});

describe("the board's rows, in words", () => {
  const read = (plan: string): BoardRow => boardRowFor("garden", plan);

  it("says how many steps are done, and gets one step right", () => {
    expect(stepsDoneWords(8, 18)).toBe("8 of 18 steps done");
    expect(stepsDoneWords(0, 1)).toBe("0 of 1 step done");
  });

  it("names the step being worked on", () => {
    expect(nowWords(read(headingsPlan))).toBe("Now on step 3: Hub store");
  });

  it("names each step when several are being worked on at once", () => {
    const plan = "- [ ] **Step 2: Plant**\n  - **Status:** current\n- [ ] **Step 3: Water**\n  - **Status:** current\n";
    expect(nowWords(read(plan))).toBe("Now on 2 steps at once: step 2: Plant; step 3: Water");
  });

  it("says so when nothing is marked current, and when the plan is finished", () => {
    expect(nowWords(read("- [x] **Step 1: Dig**\n- [ ] **Step 2: Plant**\n"))).toBe(
      "No step is marked as the one being worked on.",
    );
    expect(nowWords(read("- [x] **Step 1: Dig**\n"))).toBe("Finished: every step is done.");
  });

  it("H9: gives a plan it can't understand its own row, in plain words, with no numbers", () => {
    const row = read("# Thoughts\n");
    expect(row).toEqual({ project: "garden", plan: "not understood" });
    expect(nowWords(row)).toMatch(/can't find the steps/);
  });

  it("has plain words for a project with no plan file, and for a plan that can't be opened", () => {
    expect(nowWords({ project: "garden", plan: "missing" })).toBe("This project has no plan file.");
    expect(nowWords({ project: "garden", plan: "unreadable" })).toBe("The hub can't open this project's plan.");
  });

  it("H12: none of the board's own words is a rule code or a setting's name", () => {
    const words = [
      CLIPBOARD_NAME,
      BOARD_KEY_IN_WORDS,
      THIS_HUB_ONLY_WORDS,
      CANNOT_OPEN_FOLDER_WORDS,
      NO_PROJECTS_WORDS,
      nowWords({ project: "garden", plan: "missing" }),
      nowWords({ project: "garden", plan: "not understood" }),
      nowWords({ project: "garden", plan: "unreadable" }),
    ];
    for (const sentence of words) {
      expect(sentence).not.toMatch(/\b[HQ]\d{1,2}\b/);
      expect(sentence).not.toContain(HUB_PLANS_FOLDER_VARIABLE);
      expect(sentence).not.toContain("PLAN.md");
    }
  });
});

describe("where the plans are", () => {
  it("is a setting: one folder named in the environment", () => {
    expect(HUB_PLANS_FOLDER_VARIABLE).toBe("HUB_PLANS_FOLDER");
    expect(plansFolderFrom({ HUB_PLANS_FOLDER: " plans/of/mine " })).toBe("plans/of/mine");
  });

  it("is nowhere when the setting is left out or left empty", () => {
    expect(plansFolderFrom({})).toBeNull();
    expect(plansFolderFrom({ HUB_PLANS_FOLDER: "  " })).toBeNull();
  });
});

describe("the key that opens the clipboard", () => {
  it("is C, in either case, and is not the desk's key", () => {
    expect(CLIPBOARD_KEY).toBe("C");
    expect(CLIPBOARD_KEY).not.toBe(DESK_KEY);
    expect(opensTheClipboard({ key: "c" })).toBe(true);
    expect(opensTheClipboard({ key: "C" })).toBe(true);
    expect(opensTheClipboard({ key: DESK_KEY })).toBe(false);
    expect(opensTheDesk({ key: CLIPBOARD_KEY })).toBe(false);
  });

  it("leaves the browser's own shortcuts alone, such as copy", () => {
    expect(opensTheClipboard({ key: "c", metaKey: true })).toBe(false);
    expect(opensTheClipboard({ key: "c", ctrlKey: true })).toBe(false);
    expect(opensTheClipboard({ key: "c", altKey: true })).toBe(false);
  });

  it("does nothing while held down, when something else took it, or while typing in a field", () => {
    expect(opensTheClipboard({ key: "c", repeat: true })).toBe(false);
    expect(opensTheClipboard({ key: "c", defaultPrevented: true })).toBe(false);
    expect(opensTheClipboard({ key: "c", target: { tagName: "INPUT" } })).toBe(false);
    expect(opensTheClipboard({ key: "c", target: { tagName: "BUTTON" } })).toBe(true);
  });

  it("Escape leaves the clipboard, by the same rules", () => {
    expect(leavesTheClipboard({ key: "Escape" })).toBe(true);
    expect(leavesTheClipboard({ key: "Escape", target: { tagName: "SELECT" } })).toBe(false);
    expect(leavesTheClipboard({ key: "c" })).toBe(false);
  });
});

describe("the clipboard on the pixel desk", () => {
  const tableTop: Rect = { x: desk.tableAt.x, y: desk.tableAt.y, width: 41, height: 9 };
  const keyboard: Rect = { ...desk.keyboardAt, width: KEYBOARD_KEYS_ACROSS, height: 4 };
  const corners = (box: Rect) => [
    { x: box.x, y: box.y },
    { x: box.x + box.width - 1, y: box.y + box.height - 1 },
  ];
  const overlap = (first: Rect, second: Rect): boolean =>
    first.x < second.x + second.width &&
    second.x < first.x + first.width &&
    first.y < second.y + second.height &&
    second.y < first.y + first.height;

  it("stands on the table top, no higher than its back edge, with its bottom middle on the desk's clipboard spot", () => {
    for (const corner of corners(clipboardBounds)) expect(isInsideRect(tableTop, corner.x, corner.y)).toBe(true);
    expect(clipboardBounds.x + (clipboardBounds.width - 1) / 2).toBe(desk.clipboardSpot.x);
    expect(clipboardBounds.y + clipboardBounds.height - 1).toBe(desk.clipboardSpot.y);
  });

  it("keeps clear of the keyboard, the computer's glass and the stack of paperwork", () => {
    expect(overlap(clipboardBounds, keyboard)).toBe(false);
    expect(overlap(clipboardBounds, desk.computerGlass)).toBe(false);
    expect(clipboardBounds.x + clipboardBounds.width).toBeLessThan(desk.stackSpot.x - 4);
  });

  it("is painted only inside its own bounds: a board, a clip, a sheet, and two bars", () => {
    const surface = createSurface();
    drawClipboard(surface);
    const painted = new Set<ColourName>();
    for (let y = 0; y < surface.height; y += 1) {
      for (let x = 0; x < surface.width; x += 1) {
        const colour = colourAt(surface, x, y);
        if (colour === null) continue;
        expect(isInsideRect(clipboardBounds, x, y), `${x},${y}`).toBe(true);
        painted.add(colour);
      }
    }
    expect([...painted].sort()).toEqual(["cream", "grass", "ink", "lamp", "mist", "wood"]);
  });

  it("is drawn with the desk, so the village picture has it lying on the table", () => {
    const without = createSurface();
    const withClipboard = createSurface();
    drawVillage(without, plazaStateAt(4200));
    drawVillage(withClipboard, plazaStateAt(4200), undefined, undefined, [clipboardOnTheDesk]);
    expect(clipboardOnTheDesk.footY).toBe(desk.footY);

    let changedInside = 0;
    for (let y = 0; y < without.height; y += 1) {
      for (let x = 0; x < without.width; x += 1) {
        if (colourAt(without, x, y) === colourAt(withClipboard, x, y)) continue;
        expect(isInsideRect(clipboardBounds, x, y), `${x},${y}`).toBe(true);
        changedInside += 1;
      }
    }
    expect(changedInside).toBeGreaterThan(clipboardBounds.width * clipboardBounds.height * 0.8);
  });

  it("can be clicked a little past its own edge, and never off the picture", () => {
    for (const corner of corners(clipboardBounds)) expect(isInsideRect(clipboardReach, corner.x, corner.y)).toBe(true);
    expect(clipboardReach.width).toBeGreaterThan(clipboardBounds.width);
    expect(clipboardReach.height).toBeGreaterThan(clipboardBounds.height);
    expect(clipboardReach.x).toBeGreaterThanOrEqual(0);
    expect(clipboardReach.y).toBeGreaterThanOrEqual(0);
  });
});

describe("asking the hub for the board", () => {
  const board: BuildBoard = { from: "plans folder", cannotOpenFolder: false, projects: [] };
  const answering = (body: unknown, status = 200) => async () => Response.json(body, { status });

  it("asks the read-only route, and hands back the board", async () => {
    const asked: string[] = [];
    const answer = await askForBuildBoard(async (address) => {
      asked.push(address);
      return Response.json(board);
    });
    expect(asked).toEqual([BUILD_BOARD_ROUTE]);
    expect(answer).toEqual(board);
  });

  it("never throws: a hub in trouble, an odd answer, or no answer at all is unreachable", async () => {
    expect(await askForBuildBoard(answering({ problem: "no" }, 500))).toBe("unreachable");
    expect(await askForBuildBoard(answering({ projects: "none" }))).toBe("unreachable");
    expect(await askForBuildBoard(answering(null))).toBe("unreachable");
    expect(
      await askForBuildBoard(async () => {
        throw new Error("offline");
      }),
    ).toBe("unreachable");
  });

  it("keeps asking until it is stopped", async () => {
    const heard: unknown[] = [];
    let asks = 0;
    const stop = watchBuildBoard((news) => heard.push(news), {
      everyMs: 1,
      fetcher: async () => {
        asks += 1;
        return Response.json(board);
      },
    });
    await expect.poll(() => heard.length).toBeGreaterThanOrEqual(3);
    stop();
    const asksWhenStopped = asks;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asks).toBeLessThanOrEqual(asksWhenStopped + 1);
    expect(heard[0]).toEqual(board);
  });
});
