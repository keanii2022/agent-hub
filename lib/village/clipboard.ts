import { isInAField, type KeyPress } from "../desk/keys";
import { drawSprite } from "./engine/draw";
import { spriteFromRows } from "./engine/sprite";
import type { Surface } from "./engine/surface";
import type { Drawable } from "./plaza/draw";
import { desk, type Rect } from "./plaza/layout";

// The clipboard on the human's desk, and the build board it opens: one row per
// project, read from that project's PLAN.md. Safe for the browser: nothing
// here opens a file. The plans are read in `app/api/clipboard/plans-on-disk.ts`,
// which only the hub's own route uses. Nothing anywhere writes to a plan.

// ---- On the pixel desk ----

export const CLIPBOARD_NAME = "The clipboard on the desk";

// A board with a metal clip at its top, and a sheet showing two bars, one longer than the other.
// It is propped against the foot of the computer, which is why it can stand a little taller than the table is deep.
const clipboardSprite = spriteFromRows(
  [
    "..kik..",
    "kkiiikk",
    "kycccyk",
    "kyGGGyk",
    "kycccyk",
    "kyllcyk",
    "kyyyyyk",
    "kkkkkkk",
  ],
  // Wood, not clay: a clay board would vanish into the clay table top.
  { k: "ink", y: "wood", i: "mist", c: "cream", G: "grass", l: "lamp" },
);

/** The clipboard's own pixels: the focus mark goes round these. */
export const clipboardBounds: Rect = {
  x: desk.clipboardSpot.x - (clipboardSprite.width - 1) / 2,
  y: desk.clipboardSpot.y - clipboardSprite.height + 1,
  width: clipboardSprite.width,
  height: clipboardSprite.height,
};

const REACH_PAST_THE_EDGE = 1;

/** The area a click reaches: a little more than the clipboard, which is small. */
export const clipboardReach: Rect = {
  x: clipboardBounds.x - REACH_PAST_THE_EDGE,
  y: clipboardBounds.y - REACH_PAST_THE_EDGE,
  width: clipboardBounds.width + 2 * REACH_PAST_THE_EDGE,
  height: clipboardBounds.height + 2 * REACH_PAST_THE_EDGE,
};

export function drawClipboard(surface: Surface): void {
  drawSprite(surface, clipboardSprite, clipboardBounds.x, clipboardBounds.y);
}

/** Same foot as the desk: listed after the desk, it is drawn lying on the table, and anyone nearer still covers it. */
export const clipboardOnTheDesk: Drawable = { footY: desk.footY, draw: drawClipboard };

// ---- The ways in and out ----

export const CLIPBOARD_ROUTE = "/clipboard";
/** Where the page asks for the board. Read-only: it answers a GET and nothing else. */
export const BUILD_BOARD_ROUTE = "/api/clipboard";

/** The one key that opens the clipboard from the plaza. */
export const CLIPBOARD_KEY = "C";
/** The one key that leaves the clipboard for the plaza. */
export const LEAVE_CLIPBOARD_KEY = "Escape";

function isAPlainPressOf(key: string, press: KeyPress): boolean {
  return (
    press.key.toLowerCase() === key.toLowerCase() &&
    !press.ctrlKey &&
    !press.metaKey &&
    !press.altKey &&
    !press.repeat &&
    !press.defaultPrevented &&
    !isInAField(press.target)
  );
}

export function opensTheClipboard(press: KeyPress): boolean {
  return isAPlainPressOf(CLIPBOARD_KEY, press);
}

export function leavesTheClipboard(press: KeyPress): boolean {
  return isAPlainPressOf(LEAVE_CLIPBOARD_KEY, press);
}

// ---- Reading one plan ----

export type StepState = "done" | "current" | "not yet";

/** A step as its plan names it: "12" and "Decisions from the desk". */
export type StepName = { number: string; name: string };

export type PlanStep = StepName & { state: StepState };

export type PlanProgress = {
  total: number;
  done: number;
  /** Every step in the plan's own order. */
  steps: StepState[];
  /** The steps the plan marks as being worked on now. Usually one; none when the plan marks none. */
  currentSteps: StepName[];
};

const STEP_NUMBER = String.raw`\d+(?:\.\d+)*[a-z]?`;
// - [x] **Step 3: Hub store**
const CHECKBOX_STEP = new RegExp(String.raw`^ {0,3}[-*+] +\[([ xX])\] +(\*\*)?Step +(${STEP_NUMBER}) *[:.] *(\S.*)$`);
// ### 3. Hub store
const HEADING_STEP = new RegExp(String.raw`^#{2,6} +(?:Step +)?(${STEP_NUMBER}) *[.:)] *(\S.*)$`);
const ANY_HEADING = /^#{1,6}(?: |$)/;
// - **Status:** current
const STATUS_LINE = /^\s*(?:[-*+] +)?(?:\*\*Status:?\*\*:?|Status:) *(\S.*)$/;
const CODE_FENCE = /^ {0,3}(?:```|~~~)/;

function withoutMarkup(words: string): string {
  return words
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

type StepBeingRead = StepName & {
  isTicked: boolean;
  status: string | null;
  isBox: boolean;
};

/**
 * The steps of a plan, in its own order. Two ways of writing a step are
 * understood: a ticked or unticked box whose words start "Step 3: ...", and a
 * numbered heading. Either has a status line under it. Only a plan of boxes
 * that has no status lines at all is read by its ticks alone. Other boxes and
 * headings (a "Later" list, a note about "Step 3" among the calls to review)
 * are not steps, and neither is anything inside a code block.
 */
export function stepsOfPlan(planText: string): PlanStep[] {
  const found: StepBeingRead[] = [];
  let open: StepBeingRead | null = null;
  let insideCode = false;

  for (const line of planText.split(/\r?\n/)) {
    if (CODE_FENCE.test(line)) {
      insideCode = !insideCode;
      continue;
    }
    if (insideCode) continue;

    const box = CHECKBOX_STEP.exec(line);
    const heading = box ? null : HEADING_STEP.exec(line);
    if (box) {
      const [, tick, bold, number, rest] = box;
      const boldEnds = bold ? rest.indexOf("**") : -1;
      const name = withoutMarkup(boldEnds >= 0 ? rest.slice(0, boldEnds) : rest);
      open = name === "" ? null : { number, name, isTicked: tick !== " ", status: null, isBox: true };
    } else if (heading) {
      const name = withoutMarkup(heading[2]);
      open = name === "" ? null : { number: heading[1], name, isTicked: false, status: null, isBox: false };
    } else if (ANY_HEADING.test(line)) {
      open = null;
      continue;
    } else {
      const status = STATUS_LINE.exec(line);
      if (status && open && open.status === null) open.status = withoutMarkup(status[1]).toLowerCase();
      continue;
    }
    if (open) found.push(open);
  }

  const planHasStatusLines = found.some((step) => step.status !== null);
  return found
    .filter((step) => step.status !== null || (step.isBox && !planHasStatusLines))
    .map(({ number, name, isTicked, status }) => {
      const isDone = isTicked || /^done\b/.test(status ?? "");
      const isCurrent = !isDone && /^current\b/.test(status ?? "");
      return { number, name, state: isDone ? "done" : isCurrent ? "current" : "not yet" };
    });
}

/** The numbers of a plan, or null when no step can be found in it: the hub never guesses. */
export function progressOfPlan(planText: string): PlanProgress | null {
  const steps = stepsOfPlan(planText);
  if (steps.length === 0) return null;
  return {
    total: steps.length,
    done: steps.filter((step) => step.state === "done").length,
    steps: steps.map((step) => step.state),
    currentSteps: steps
      .filter((step) => step.state === "current")
      .map(({ number, name }) => ({ number, name })),
  };
}

// ---- The board ----

/** Names one folder whose direct subfolders are the projects, each with a PLAN.md at its top. */
export const HUB_PLANS_FOLDER_VARIABLE = "HUB_PLANS_FOLDER";

/** The folder of projects the hub was told about, or null when it was told about none. */
export function plansFolderFrom(environment: Record<string, string | undefined>): string | null {
  const chosen = environment[HUB_PLANS_FOLDER_VARIABLE];
  return chosen === undefined || chosen.trim() === "" ? null : chosen.trim();
}

/** The name this hub's own plan goes by on the board. */
export const THIS_HUB = "agent-hub";

export type BoardRow =
  | ({ project: string; plan: "read" } & PlanProgress)
  /** "missing": no plan file. "not understood": a file with no steps the hub can find. "unreadable": a file the hub can't open. */
  | { project: string; plan: "missing" | "not understood" | "unreadable" };

export type BuildBoard = {
  /** "this hub only": the hub was told about no folder of projects, so it shows its own plan. */
  from: "plans folder" | "this hub only";
  /** True when the folder the hub was told about can't be opened. The board is empty then. */
  cannotOpenFolder: boolean;
  projects: BoardRow[];
};

export function boardRowFor(project: string, planText: string): BoardRow {
  const progress = progressOfPlan(planText);
  return progress ? { project, plan: "read", ...progress } : { project, plan: "not understood" };
}

export function stepsDoneWords(done: number, total: number): string {
  return `${done} of ${total} ${total === 1 ? "step" : "steps"} done`;
}

function stepInWords(step: StepName): string {
  return `step ${step.number}: ${step.name}`;
}

const noNumbersWords = {
  missing: "This project has no plan file.",
  "not understood": "The hub can't find the steps in this project's plan, so it has no numbers for it.",
  unreadable: "The hub can't open this project's plan.",
} as const;

/** What a project is on now, in one plain sentence. */
export function nowWords(row: BoardRow): string {
  if (row.plan !== "read") return noNumbersWords[row.plan];
  if (row.done === row.total) return "Finished: every step is done.";
  if (row.currentSteps.length === 0) return "No step is marked as the one being worked on.";
  if (row.currentSteps.length === 1) return `Now on ${stepInWords(row.currentSteps[0])}`;
  return `Now on ${row.currentSteps.length} steps at once: ${row.currentSteps.map(stepInWords).join("; ")}`;
}

export const BOARD_KEY_IN_WORDS =
  "Each square is one step, in the plan's own order: green is done, yellow with a light edge is being worked on, dark is still to come.";
export const THIS_HUB_ONLY_WORDS =
  "Only this hub's own plan is on the board. The hub hasn't been told where your other projects are.";
export const CANNOT_OPEN_FOLDER_WORDS =
  "The hub can't open the folder it was told your projects are in, so the board is empty.";
export const NO_PROJECTS_WORDS = "There are no projects in the folder the hub was told about.";

// ---- Asking the hub for the board ----

/** How often the open clipboard asks the hub to read the plans again. */
export const BUILD_BOARD_ASKED_EVERY_MS = 5000;

type Fetcher = (address: string, options: { cache: "no-store" }) => Promise<Response>;

function looksLikeBuildBoard(body: unknown): body is BuildBoard {
  if (typeof body !== "object" || body === null) return false;
  const { from, cannotOpenFolder, projects } = body as Partial<BuildBoard>;
  return typeof from === "string" && typeof cannotOpenFolder === "boolean" && Array.isArray(projects);
}

/** Asks the page's own hub once. Never throws: any trouble at all is "unreachable". */
export async function askForBuildBoard(
  fetcher: Fetcher = (address, options) => fetch(address, options),
): Promise<BuildBoard | "unreachable"> {
  try {
    const response = await fetcher(BUILD_BOARD_ROUTE, { cache: "no-store" });
    if (!response.ok) return "unreachable";
    const body: unknown = await response.json();
    return looksLikeBuildBoard(body) ? body : "unreachable";
  } catch {
    return "unreachable";
  }
}

export type BuildBoardWatch = {
  fetcher?: Fetcher;
  everyMs?: number;
};

/**
 * Asks now, and again a while after each answer, handing every answer to
 * `onNews`. Returns a function that stops it.
 */
export function watchBuildBoard(
  onNews: (news: BuildBoard | "unreachable") => void,
  { fetcher, everyMs = BUILD_BOARD_ASKED_EVERY_MS }: BuildBoardWatch = {},
): () => void {
  let stopped = false;
  let nextAsk: ReturnType<typeof setTimeout> | undefined;

  async function ask(): Promise<void> {
    const news = await askForBuildBoard(fetcher);
    if (stopped) return;
    onNews(news);
    nextAsk = setTimeout(ask, everyMs);
  }
  void ask();

  return () => {
    stopped = true;
    clearTimeout(nextAsk);
  };
}
