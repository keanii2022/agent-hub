import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  DESK_LOG_ROUTE,
  DESK_ORDER_IN_WORDS,
  EVERYTHING,
  deskItemsFrom,
  logShownFor,
  waitedInWords,
  type DeskLog,
} from "../lib/desk";
import type { FeedLine } from "../lib/feed";
import { villageHouses } from "../lib/village/houses";
import {
  VILLAGE_STATE_ROUTE,
  type ProjectState,
  type VillageState,
  type WaitingItem,
} from "../lib/village/state";
import { FROZEN_HUB_MOMENT, expectTheFrozenVillage } from "./frozen-hub";

const COMPUTER_NAME = "The computer on the desk";
const FIXED_PLAZA = "/?time=4200&scale=2";

const [approvalDeskHouse, teamHouse] = villageHouses;
const APPROVAL_DESK = approvalDeskHouse.project as string;
const TEAM_PROJECT = teamHouse.project as string;
// Invented for these tests only: a third house on its own data, and a fourth the hub can't read.
const GARDEN_CLUB = "garden-club";
const PRINT_SHOP = "print-shop";

// The development server adds its own floating badge, which is not part of the page.
async function hideTheDevBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function openPlaza(page: Page): Promise<Locator> {
  await page.goto(FIXED_PLAZA);
  await hideTheDevBadge(page);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expectTheFrozenVillage(canvas);
  return canvas;
}

function deskHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: "Your desk" });
}

async function expectTheDesk(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/desk$/);
  await expect(deskHeading(page)).toBeVisible();
}

/** Opens the desk and waits until it shows the hub's answers for the frozen moment. */
async function openDesk(page: Page): Promise<void> {
  await page.goto("/desk");
  await hideTheDevBadge(page);
  const desk = page.getByRole("main");
  await expect(
    desk,
    "The desk is not showing the frozen moment. Stop any hub already running on this port, so the tests can start their own frozen one.",
  ).toHaveAttribute("data-desk-as-of", FROZEN_HUB_MOMENT);
  await expect(desk).toHaveAttribute("data-log-as-of", FROZEN_HUB_MOMENT);
}

function waitingList(page: Page): Locator {
  return page.getByRole("region", { name: /^Waiting for you/ });
}

function waitingCards(page: Page): Locator {
  return waitingList(page).getByRole("article");
}

function logRegion(page: Page): Locator {
  return page.getByRole("region", { name: "Everything that happened" });
}

function logRows(page: Page): Locator {
  return logRegion(page).locator("tbody tr");
}

async function frozenVillage(page: Page): Promise<VillageState> {
  const response = await page.request.get(VILLAGE_STATE_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

async function frozenLog(page: Page): Promise<DeskLog> {
  const response = await page.request.get(DESK_LOG_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

const RULE_CODE = /\b[HQ]\d{1,2}\b/;
const CODE_WORDS = ["needs_human", "result_ready", "feed_failed", "no_news", "undefined", "null", "NaN"];

/** H12: nothing a person reads on the desk is a rule code, a status code or a line's id. */
async function expectPlainWordsOnly(page: Page, lineIds: readonly string[]): Promise<void> {
  const words = await page.locator("body").innerText();
  expect(words).not.toMatch(RULE_CODE);
  for (const code of CODE_WORDS) expect(words).not.toContain(code);
  // A scripted line's id is a pair of numbers that a request's own name can end in too
  // ("REQ-512-3"), so an id counts as shown only when it stands by itself.
  const standingAlone = (id: string): RegExp =>
    new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
  for (const id of lineIds) expect(words).not.toMatch(standingAlone(id));
  for (const named of await page.locator("[aria-label]").all()) {
    expect(await named.getAttribute("aria-label")).not.toMatch(RULE_CODE);
  }
  expect(await page.title()).not.toMatch(RULE_CODE);
}

// ---- Opening the desk ----

test("a click on the computer opens the desk, and reading starts at its heading", async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on("pageerror", (error) => pageErrors.push(error));
  await openPlaza(page);

  await page.getByRole("button", { name: COMPUTER_NAME }).click();

  await expectTheDesk(page);
  await expect(deskHeading(page)).toBeFocused();
  await expect(page).toHaveTitle(/Your desk/);
  expect(pageErrors).toEqual([]);
});

for (const key of ["Enter", "Space"] as const) {
  test(`${key} on the focused computer opens the desk`, async ({ page }) => {
    await openPlaza(page);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: COMPUTER_NAME })).toBeFocused();

    await page.keyboard.press(key);

    await expectTheDesk(page);
  });
}

test("the plaza says in plain words which key opens the desk, and that key opens it", async ({ page }) => {
  await openPlaza(page);
  await expect(page.getByText("or press D")).toBeVisible();

  await page.keyboard.press("d");

  await expectTheDesk(page);
  await expect(deskHeading(page)).toBeFocused();
});

test("the plaza's own link opens the desk too", async ({ page }) => {
  await openPlaza(page);
  await page.getByRole("link", { name: "Open the desk" }).click();
  await expectTheDesk(page);
});

test("the key that opens the desk is left alone while typing in a text field", async ({ page }) => {
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

  await page.keyboard.type("a draft, done today");
  await expect(field).toHaveValue("a draft, done today");
  expect(page.url()).toBe(addressBefore);

  // The browser's own shortcuts on that key are not taken either.
  await field.blur();
  await page.keyboard.press("Control+d");
  await page.waitForTimeout(300);
  expect(page.url()).toBe(addressBefore);
});

test("the desk has a clear way back to the plaza: a link, and Escape", async ({ page }) => {
  await openDesk(page);
  await page.getByRole("link", { name: "Back to the village" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("img", { name: /plaza at dusk/i })).toBeVisible();

  await page.keyboard.press("d");
  await expectTheDesk(page);
  await expect(page.getByText("or press Esc")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("img", { name: /plaza at dusk/i })).toBeVisible();
});

test("Escape inside a filter belongs to the filter, and does not leave the desk", async ({ page }) => {
  await openDesk(page);
  await page.getByLabel("Project").focus();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/desk$/);
});

// ---- The real frozen hub: the two scripted houses ----

test("the desk lists everything the hub says is waiting: who sent it, what it is, how long it has waited", async ({
  page,
}, testInfo) => {
  const village = await frozenVillage(page);
  const items = deskItemsFrom(village);
  expect(items.length).toBe(village.waitingCount);
  expect(new Set(items.map((item) => item.project))).toEqual(new Set([APPROVAL_DESK, TEAM_PROJECT]));

  await openDesk(page);

  await expect(page.getByRole("heading", { level: 2, name: `Waiting for you (${items.length})` })).toBeVisible();
  await expect(waitingList(page)).toContainText(DESK_ORDER_IN_WORDS);
  const cards = waitingCards(page);
  await expect(cards).toHaveCount(items.length);
  for (const [place, item] of items.entries()) {
    const card = cards.nth(place);
    await expect(card).toHaveAttribute("data-project", item.project);
    await expect(card).toHaveAttribute("data-line-id", item.lineId);
    await expect(card.getByRole("heading", { level: 3 })).toHaveText(item.line.what);
    await expect(card).toContainText(`${item.line.agent} at ${item.project}`);
    await expect(card).toContainText(`Waiting${waitedInWords(item.waitedMs)}`);
    await expect(card).toContainText(`Request ${item.line.request}`);
    await expect(card.getByText("URGENT", { exact: true })).toHaveCount(item.isUrgent ? 1 : 0);
  }
  // The frozen moment has one urgent request, and it is on top.
  expect(items.filter((item) => item.isUrgent)).toHaveLength(1);
  await expect(cards.first().getByText("URGENT", { exact: true })).toBeVisible();
  await expect(cards.first()).not.toContainText(/\d{4,}\s*ms|milliseconds/);

  // For the owner's eyes, not compared with anything: how the desk looks is theirs to judge.
  await page.screenshot({ path: testInfo.outputPath("desk.png") });
  await page.screenshot({ path: testInfo.outputPath("desk-whole-page.png"), fullPage: true });
});

test("the desk only shows: a request's choices are plain text, and nothing on an item can be pressed", async ({
  page,
}) => {
  const items = deskItemsFrom(await frozenVillage(page));
  await openDesk(page);

  const decisions = items.filter((item) => item.kind === "decision");
  expect(decisions.length).toBeGreaterThan(0);
  for (const item of decisions) {
    const card = waitingList(page).locator(`[data-line-id="${item.lineId}"]`);
    await expect(card).toContainText("You can answerApprove or Reject");
  }
  for (const control of ["button", "link", "textbox", "checkbox", "combobox"] as const) {
    await expect(waitingList(page).getByRole(control)).toHaveCount(0);
  }
});

test("H10: everything scripted on the desk is marked DEMO, and the desk says what that means", async ({ page }) => {
  const items = deskItemsFrom(await frozenVillage(page));
  await openDesk(page);

  expect(items.every((item) => item.isDemo)).toBe(true);
  for (const card of await waitingCards(page).all()) {
    await expect(card.getByText("DEMO", { exact: true })).toBeVisible();
  }
  const rows = logRows(page);
  expect(await rows.count()).toBeGreaterThan(0);
  await expect(rows.filter({ hasText: "DEMO" })).toHaveCount(await rows.count());
  await expect(page.getByText("marks a scripted example. It is not real activity.")).toBeVisible();
});

test("the log shows every event the hub has, in order, newest first", async ({ page }) => {
  const log = await frozenLog(page);
  const expected = logShownFor(log, EVERYTHING).entries;
  expect(expected.length).toBeGreaterThan(10);
  expect(new Set(expected.map((entry) => entry.project))).toEqual(new Set([APPROVAL_DESK, TEAM_PROJECT]));

  await openDesk(page);

  const rows = logRows(page);
  await expect(rows).toHaveCount(expected.length);
  await expect(logRegion(page)).toContainText(`${expected.length} events, newest first.`);
  const times = await rows.locator("time").evaluateAll((marks) => marks.map((mark) => mark.getAttribute("datetime") ?? ""));
  expect(times).toEqual(expected.map((entry) => entry.when));
  const moments = times.map((time) => Date.parse(time));
  expect(moments.every((moment) => !Number.isNaN(moment))).toBe(true);
  expect(moments).toEqual([...moments].sort((earlier, later) => later - earlier));

  await expect(rows.first()).toContainText(expected[0].what);
  await expect(rows.first()).toContainText(expected[0].agent);
  await expect(rows.first()).toContainText(expected[0].project);
  for (const heading of ["When", "Project", "Agent", "What happened", "State"]) {
    await expect(logRegion(page).getByRole("columnheader", { name: heading, exact: true })).toBeVisible();
  }
});

test("the log's filters by project and by agent work, alone and together", async ({ page }) => {
  const log = await frozenLog(page);
  await openDesk(page);
  const rows = logRows(page);
  const everything = logShownFor(log, EVERYTHING).entries.length;

  const ofTeam = logShownFor(log, { project: TEAM_PROJECT, agent: null }).entries;
  await page.getByLabel("Project").selectOption(TEAM_PROJECT);
  await expect(rows).toHaveCount(ofTeam.length);
  expect(ofTeam.length).toBeLessThan(everything);
  await expect(logRegion(page).locator(`tbody tr:not([data-project="${TEAM_PROJECT}"])`)).toHaveCount(0);
  await expect(logRegion(page)).toContainText(`${ofTeam.length} events from ${TEAM_PROJECT}, newest first.`);

  // The agents on offer are the chosen project's own.
  const agent = ofTeam[0].agent;
  const agentsOfTeam = [...new Set(ofTeam.map((entry) => entry.agent))].sort();
  expect(agentsOfTeam.length).toBeGreaterThan(1);
  await expect(page.getByLabel("Agent").locator("option")).toHaveText(["All agents", ...agentsOfTeam]);

  const ofAgent = logShownFor(log, { project: TEAM_PROJECT, agent }).entries;
  await page.getByLabel("Agent").selectOption(agent);
  await expect(rows).toHaveCount(ofAgent.length);
  expect(ofAgent.length).toBeLessThan(ofTeam.length);
  await expect(
    logRegion(page).locator(`tbody tr[data-project="${TEAM_PROJECT}"][data-agent="${agent}"]`),
  ).toHaveCount(ofAgent.length);
  const times = await rows.locator("time").evaluateAll((marks) => marks.map((mark) => mark.getAttribute("datetime")));
  expect(times).toEqual(ofAgent.map((entry) => entry.when));

  // Another project lets go of an agent it doesn't have.
  await page.getByLabel("Project").selectOption(APPROVAL_DESK);
  await expect(page.getByLabel("Agent")).toHaveValue("");
  await expect(logRegion(page).locator(`tbody tr:not([data-project="${APPROVAL_DESK}"])`)).toHaveCount(0);
  await expect(rows).toHaveCount(logShownFor(log, { project: APPROVAL_DESK, agent: null }).entries.length);

  await page.getByRole("button", { name: "Show everything" }).click();
  await expect(rows).toHaveCount(everything);
  await expect(page.getByLabel("Project")).toHaveValue("");
  await expect(page.getByRole("button", { name: "Show everything" })).toHaveCount(0);

  // An agent alone, across every project.
  await page.getByLabel("Agent").selectOption(agent);
  await expect(rows).toHaveCount(logShownFor(log, { project: null, agent }).entries.length);
  await expect(logRegion(page).locator(`tbody tr:not([data-agent="${agent}"])`)).toHaveCount(0);
});

test("H12: the desk speaks plain words: no rule codes, no status codes, no line ids", async ({ page }) => {
  const village = await frozenVillage(page);
  const log = await frozenLog(page);
  await openDesk(page);
  await expect(waitingCards(page)).toHaveCount(village.waitingCount);

  await expectPlainWordsOnly(page, [
    ...deskItemsFrom(village).map((item) => item.lineId),
    ...log.events.map((event) => event.line.id),
  ]);
});

test("the desk's own route for the log is read-only", async ({ request }) => {
  for (const send of [request.post, request.put, request.patch, request.delete]) {
    const response = await send.call(request, DESK_LOG_ROUTE, { data: {} });
    expect(response.status()).toBe(405);
  }
});

// ---- A scripted hub: more houses than the demo has ----

function scriptedLine(
  project: string,
  agent: string,
  id: string,
  status: FeedLine["status"],
  what: string,
  more: { when?: string; demo?: boolean; urgent?: boolean; choices?: { id: string; label: string }[] } = {},
): FeedLine {
  const line = {
    project,
    agent,
    request: `REQUEST-${id.toUpperCase()}`,
    step: "work",
    what,
    when: more.when ?? "2026-10-05T14:07:00Z",
    id: `line-${id}`,
    demo: more.demo ?? true,
    ...(more.urgent && { urgent: true }),
  };
  return status === "needs_human"
    ? {
        ...line,
        status,
        choices: more.choices ?? [
          { id: "approve", label: "Approve" },
          { id: "reject", label: "Reject" },
        ],
      }
    : { ...line, status };
}

function waiting(line: FeedLine, waitedMs: number): WaitingItem {
  return {
    kind: line.status === "needs_human" ? "decision" : "result",
    line,
    waitedMs,
    isUrgent: line.urgent === true,
  };
}

function scriptedProject(project: string, more: Partial<ProjectState> = {}): ProjectState {
  return {
    project,
    isDemo: true,
    isDark: false,
    whyDark: null,
    lastNewsAt: "2026-10-05T14:07:00Z",
    agents: [],
    workingCount: 0,
    waiting: [],
    ready: [],
    ...more,
  };
}

const refundAsk = scriptedLine(APPROVAL_DESK, "refund-agent", "refund", "needs_human", "Refund €410 for the wedding flowers?", {
  urgent: true,
});
const posterAsk = scriptedLine(TEAM_PROJECT, "checker", "poster", "needs_human", "Send the poster to the printer?");
const letterResult = scriptedLine(TEAM_PROJECT, "builder", "letter", "result_ready", "The welcome letter is ready to read");
const seedsAsk = scriptedLine(GARDEN_CLUB, "treasurer", "seeds", "needs_human", "Order the spring seeds now or wait for the sale?", {
  demo: false,
  choices: [
    { id: "now", label: "Order now" },
    { id: "wait", label: "Wait for the sale" },
    { id: "reject", label: "Don't order" },
  ],
});

const fourHouses: VillageState = {
  asOf: FROZEN_HUB_MOMENT,
  projects: [
    scriptedProject(APPROVAL_DESK, { waiting: [waiting(refundAsk, 60_000)] }),
    scriptedProject(TEAM_PROJECT, {
      waiting: [waiting(posterAsk, 3 * 60_000 + 20_000)],
      ready: [waiting(letterResult, 65 * 60_000)],
    }),
    scriptedProject(GARDEN_CLUB, { isDemo: false, waiting: [waiting(seedsAsk, 12 * 60_000)] }),
    // H9: the hub can't read this one at all.
    scriptedProject(PRINT_SHOP, { isDemo: false, isDark: true, whyDark: "feed_failed", lastNewsAt: null }),
  ],
  waitingCount: 4,
};

const scriptedLog: DeskLog = {
  asOf: FROZEN_HUB_MOMENT,
  // Handed over out of order on purpose: the desk puts them in order itself.
  events: [
    scriptedLine(TEAM_PROJECT, "builder", "t1", "working", "Sketching the poster", { when: "2026-10-05T14:01:00Z" }),
    scriptedLine(GARDEN_CLUB, "treasurer", "g2", "needs_human", "Order the spring seeds now or wait for the sale?", {
      when: "2026-10-05T13:55:00Z",
      demo: false,
    }),
    scriptedLine(APPROVAL_DESK, "refund-agent", "a2", "done", "Paid back €18 for the teapot", { when: "2026-10-05T14:05:00Z" }),
    scriptedLine(TEAM_PROJECT, "checker", "t2", "working", "Reading the small print", { when: "2026-10-05T14:03:00Z" }),
    scriptedLine(GARDEN_CLUB, "gardener", "g1", "working", "Counting the seed packets", {
      when: "2026-10-05T13:50:00Z",
      demo: false,
    }),
    scriptedLine(APPROVAL_DESK, "refund-agent", "a1", "blocked", "Stopped a gift card refund", { when: "2026-10-05T14:02:00Z" }),
    scriptedLine(TEAM_PROJECT, "builder", "t3", "result_ready", "The welcome letter is ready to read", {
      when: "2026-10-05T13:02:00Z",
    }),
  ].map((line, index) => ({ seq: index + 1, line })),
  unreadable: [],
  cutShort: [],
};

const newestFirstInTheScript = ["a2", "t2", "a1", "t1", "g2", "g1", "t3"].map((id) => `line-${id}`);

async function openScriptedDesk(page: Page, village: VillageState = fourHouses, log: DeskLog = scriptedLog): Promise<void> {
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: village }));
  await page.route(`**${DESK_LOG_ROUTE}`, (route) => route.fulfill({ json: log }));
  await openDesk(page);
}

test("the desk lists waiting items from three projects at once, urgent first, then the longest wait", async ({
  page,
}) => {
  await openScriptedDesk(page);

  const cards = waitingCards(page);
  await expect(cards).toHaveCount(4);
  const projects = await cards.evaluateAll((all) => all.map((card) => (card as HTMLElement).dataset.project));
  expect(projects).toEqual([APPROVAL_DESK, GARDEN_CLUB, TEAM_PROJECT, TEAM_PROJECT]);
  expect(new Set(projects).size).toBe(3);

  // Urgent leads though it has waited the shortest.
  await expect(cards.nth(0)).toContainText("URGENT");
  await expect(cards.nth(0)).toContainText("Refund €410 for the wedding flowers?");
  await expect(cards.nth(0)).toContainText(`refund-agent at ${APPROVAL_DESK}`);
  await expect(cards.nth(0)).toContainText("Waiting1 minute");
  await expect(cards.nth(0)).toContainText("Needs your answer");

  // Then what needs an answer, the longest wait first.
  await expect(cards.nth(1)).toContainText("Order the spring seeds now or wait for the sale?");
  await expect(cards.nth(1)).toContainText(`treasurer at ${GARDEN_CLUB}`);
  await expect(cards.nth(1)).toContainText("Waiting12 minutes");
  // Whatever choices a request lists are shown as they are, in words.
  await expect(cards.nth(1)).toContainText("You can answerOrder now, Wait for the sale or Don't order");
  await expect(cards.nth(2)).toContainText("Send the poster to the printer?");
  await expect(cards.nth(2)).toContainText("Waiting3 minutes");

  // What is only there to read comes last, though it has waited the longest, and offers no choices.
  await expect(cards.nth(3)).toContainText("Ready to read");
  await expect(cards.nth(3)).toContainText(`builder at ${TEAM_PROJECT}`);
  await expect(cards.nth(3)).toContainText("Waiting1 hour 5 minutes");
  await expect(cards.nth(3)).not.toContainText("You can answer");

  await expect(cards.getByText("URGENT", { exact: true })).toHaveCount(1);
  await expect(waitingList(page).getByRole("button")).toHaveCount(0);
});

test("H10: with a real house beside the scripted ones, only the scripted items and lines say DEMO", async ({ page }) => {
  await openScriptedDesk(page);

  const realCard = waitingList(page).locator(`[data-project="${GARDEN_CLUB}"]`);
  await expect(realCard).toHaveCount(1);
  await expect(realCard.getByText("DEMO", { exact: true })).toHaveCount(0);
  await expect(waitingList(page).locator(`article:not([data-project="${GARDEN_CLUB}"])`).getByText("DEMO", { exact: true })).toHaveCount(3);

  await expect(logRegion(page).locator(`tbody tr[data-project="${GARDEN_CLUB}"]`)).toHaveCount(2);
  await expect(logRegion(page).locator(`tbody tr[data-project="${GARDEN_CLUB}"]`).getByText("DEMO")).toHaveCount(0);
  await expect(logRows(page).getByText("DEMO", { exact: true })).toHaveCount(5);
});

test("H9: a house the hub can't read is named in plain words, and the rest of the desk is all there", async ({
  page,
}) => {
  await openScriptedDesk(page);

  await expect(waitingCards(page)).toHaveCount(4);
  await expect(waitingList(page)).toContainText(
    `No news from ${PRINT_SHOP}: the hub can't read what it sends right now, so anything it is waiting for may be missing here.`,
  );
  await expect(logRows(page)).toHaveCount(scriptedLog.events.length);
  await expectPlainWordsOnly(page, scriptedLog.events.map((event) => event.line.id));
});

test("H9: a house that has gone quiet keeps what it asked, and the desk says it is quiet", async ({ page }) => {
  const quietTeam: VillageState = {
    ...fourHouses,
    projects: fourHouses.projects.map((project) =>
      project.project === TEAM_PROJECT ? { ...project, isDark: true, whyDark: "no_news" } : project,
    ),
  };
  await openScriptedDesk(page, quietTeam);

  await expect(waitingCards(page)).toHaveCount(4);
  await expect(waitingList(page)).toContainText(
    `No news from ${TEAM_PROJECT} for a while. What it sent before is still listed.`,
  );
});

test("the scripted log is put in order, and its filters work together down to a plain empty state", async ({
  page,
}) => {
  await openScriptedDesk(page);
  const rows = logRows(page);
  const timesShown = (): Promise<string[]> =>
    rows.locator("time").evaluateAll((marks) => marks.map((mark) => mark.getAttribute("datetime") ?? ""));
  const whenOf = (lineId: string): string =>
    scriptedLog.events.find((event) => event.line.id === lineId)?.line.when ?? "";

  expect(await timesShown()).toEqual(newestFirstInTheScript.map(whenOf));
  await expect(logRegion(page)).toContainText("7 events, newest first.");
  await expect(page.getByLabel("Project").locator("option")).toHaveText([
    "All projects",
    APPROVAL_DESK,
    TEAM_PROJECT,
    GARDEN_CLUB,
    PRINT_SHOP,
  ]);
  await expect(page.getByLabel("Agent").locator("option")).toHaveText([
    "All agents",
    "builder",
    "checker",
    "gardener",
    "refund-agent",
    "treasurer",
  ]);
  // Every state is in words.
  await expect(rows.nth(0)).toContainText("Done");
  await expect(rows.nth(2)).toContainText("Blocked");
  await expect(rows.nth(4)).toContainText("Needs your answer");
  await expect(rows.nth(6)).toContainText("Ready to read");

  await page.getByLabel("Agent").selectOption("builder");
  expect(await timesShown()).toEqual(["line-t1", "line-t3"].map(whenOf));
  await expect(logRegion(page)).toContainText("2 events from builder, newest first.");

  await page.getByLabel("Project").selectOption(TEAM_PROJECT);
  await expect(page.getByLabel("Agent")).toHaveValue("builder");
  expect(await timesShown()).toEqual(["line-t1", "line-t3"].map(whenOf));
  await expect(logRegion(page)).toContainText(`2 events from builder at ${TEAM_PROJECT}, newest first.`);

  await page.getByLabel("Agent").selectOption("checker");
  expect(await timesShown()).toEqual(["line-t2"].map(whenOf));
  await expect(logRegion(page)).toContainText(`1 event from checker at ${TEAM_PROJECT}, newest first.`);

  // A house with nothing in the log: no table, one plain sentence.
  await page.getByLabel("Project").selectOption(PRINT_SHOP);
  await expect(rows).toHaveCount(0);
  await expect(logRegion(page).getByRole("table")).toHaveCount(0);
  await expect(logRegion(page)).toContainText(`Nothing from ${PRINT_SHOP} yet.`);
  await expect(page.getByLabel("Agent")).toHaveValue("");

  await page.getByRole("button", { name: "Show everything" }).click();
  await expect(rows).toHaveCount(7);
});

test("an empty desk says so in plain words", async ({ page }) => {
  const nothing: VillageState = {
    ...fourHouses,
    projects: fourHouses.projects.map((project) => ({ ...project, waiting: [], ready: [], isDark: false, whyDark: null })),
    waitingCount: 0,
  };
  await openScriptedDesk(page, nothing, { ...scriptedLog, events: [] });

  await expect(page.getByRole("heading", { level: 2, name: "Waiting for you (0)" })).toBeVisible();
  await expect(waitingList(page)).toContainText("Nothing is waiting for you.");
  await expect(logRegion(page)).toContainText("Nothing has happened yet.");
  await expect(logRegion(page).getByRole("table")).toHaveCount(0);
});

test("H9: when the hub gives no answer about what is waiting, the desk says so and still shows the log", async ({
  page,
}) => {
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ status: 500, json: { problem: "no" } }));
  await page.route(`**${DESK_LOG_ROUTE}`, (route) => route.fulfill({ json: scriptedLog }));
  await page.goto("/desk");

  await expect(waitingList(page)).toContainText("The desk can't reach the hub right now. It keeps trying.");
  await expect(logRows(page)).toHaveCount(scriptedLog.events.length);
  await expectPlainWordsOnly(page, []);
});

test("H9: when the hub gives no log, the desk says so and still shows what is waiting", async ({ page }) => {
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: fourHouses }));
  await page.route(`**${DESK_LOG_ROUTE}`, (route) => route.abort());
  await page.goto("/desk");

  await expect(waitingCards(page)).toHaveCount(4);
  await expect(logRegion(page)).toContainText("The desk can't reach the hub right now. It keeps trying.");
});

test("H9: a project whose log can't be read is named, and the others' lines are all there", async ({ page }) => {
  await openScriptedDesk(page, fourHouses, { ...scriptedLog, unreadable: [PRINT_SHOP] });

  await expect(logRegion(page)).toContainText(
    `The hub can't read what ${PRINT_SHOP} has done right now. The others are all here.`,
  );
  await expect(logRows(page)).toHaveCount(scriptedLog.events.length);
});

test("the plaza's mark stays away for papers already seen at the desk, and shows again for a new one", async ({
  page,
}) => {
  const frozen = await frozenVillage(page);
  const withOnly = (items: WaitingItem[]): VillageState => ({
    ...frozen,
    projects: frozen.projects.map((project) => ({
      ...project,
      waiting: project.project === APPROVAL_DESK ? items.filter((item) => item.line.project === APPROVAL_DESK) : [],
      ready: project.project === TEAM_PROJECT ? items.filter((item) => item.line.project === TEAM_PROJECT) : [],
    })),
    waitingCount: items.length,
  });
  const seen = waiting(refundAsk, 60_000);
  const neverSeen = waiting(letterResult, 30_000);
  let hubAnswers = withOnly([seen]);
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: hubAnswers }));

  const canvas = await openPlaza(page);
  await expect(canvas).toHaveAttribute("data-desk-papers", "1");
  await expect(canvas).toHaveAttribute("data-desk-mark", "showing");

  await page.getByRole("button", { name: COMPUTER_NAME }).click();
  await expectTheDesk(page);
  await expect(waitingCards(page)).toHaveCount(1);

  await page.goBack();
  const canvasAgain = page.getByRole("img", { name: /plaza at dusk/i });
  await expectTheFrozenVillage(canvasAgain);
  await expect(canvasAgain).toHaveAttribute("data-desk-papers", "1");
  await expect(canvasAgain).toHaveAttribute("data-desk-mark", "cleared");

  // A paper the desk never showed: a fresh look at the plaza finds it on the desk, under the mark.
  hubAnswers = withOnly([seen, neverSeen]);
  await page.reload();
  const canvasReloaded = page.getByRole("img", { name: /plaza at dusk/i });
  await expectTheFrozenVillage(canvasReloaded);
  await expect(canvasReloaded).toHaveAttribute("data-desk-papers", "2");
  await expect(canvasReloaded).toHaveAttribute("data-desk-mark", "showing");
});
