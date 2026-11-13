import { DatabaseSync } from "node:sqlite";
import { expect, test, type APIRequestContext, type Locator, type Page, type Route } from "@playwright/test";
import {
  DESK_DECISIONS_ROUTE,
  DESK_SEEN_ROUTE,
  NOTE_MAX_LENGTH,
  NO_DOOR_NOTE,
  SEEN_WORDS,
  notRecordedWords,
  type DecisionOutcome,
  type DeskAnswer,
  type DeskDecisions,
  type SeenOutcome,
} from "../lib/decisions";
import { doorLineIdFor } from "../lib/decisions/doors";
import { DESK_LOG_ROUTE, deskItemsFrom, type DeskItem, type DeskLog } from "../lib/desk";
import { palette } from "../lib/village/engine";
import { glassOfWindow, villageHouses, type PlacedHouse } from "../lib/village/houses";
import type { Rect } from "../lib/village/plaza";
import { VILLAGE_STATE_ROUTE, projectStateOf, type ProjectState, type VillageState } from "../lib/village/state";
import { DECISIONS_HUB_MOMENT, decisionsHubRecord } from "./decisions-hub";

// These tests decide things, and a decision stays on the hub's record. They
// run against a hub of their own (see decisions-hub.ts), one after another.
// Each test answers a request no other test answers, so any order works.

const [approvalDeskHouse, teamHouse] = villageHouses;
const APPROVAL_DESK = approvalDeskHouse.project as string;
const TEAM_PROJECT = teamHouse.project as string;

/** The requests open at the hub's frozen moment, by a few words only they say. */
const ARMCHAIR_275 = "Odette's €275 armchair refund";
const HEADPHONES_95 = "Kenji's headphones";
const FLOWERS_410 = "Pilar's €410 flower refund";
const POSTER = "The spring market poster is ready";
/** Never answered by any test: two tests only look at it. */
const HONEY_PRICE = "The honey is listed at €1";
const WELCOME_LETTER = "The welcome letter is ready for you to read";

const OVER_THE_LIMIT = "A refund over €400 has to be approved in approval-desk itself.";

// The development server adds its own floating badge, which is not part of the page.
async function hideTheDevBadge(page: Page): Promise<void> {
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}

async function openDesk(page: Page): Promise<void> {
  await page.goto("/desk");
  await hideTheDevBadge(page);
  const desk = page.getByRole("main");
  await expect(
    desk,
    "The desk is not showing the decisions hub's frozen moment. Stop any hub already running on its port.",
  ).toHaveAttribute("data-desk-as-of", DECISIONS_HUB_MOMENT);
  await expect(desk).toHaveAttribute("data-log-as-of", DECISIONS_HUB_MOMENT);
}

async function openPlaza(page: Page): Promise<Locator> {
  await page.goto("/?time=4200&scale=2");
  await hideTheDevBadge(page);
  const canvas = page.getByRole("img", { name: /plaza at dusk/i });
  await expect(canvas).toHaveAttribute("data-village-as-of", DECISIONS_HUB_MOMENT);
  return canvas;
}

function waitingList(page: Page): Locator {
  return page.getByRole("region", { name: /^Waiting for you/ });
}

function cardOf(page: Page, item: DeskItem): Locator {
  return waitingList(page).locator(`article[data-project="${item.project}"][data-line-id="${item.lineId}"]`);
}

/** The one place the desk says what a button led to. */
function whatTheDeskSaid(page: Page): Locator {
  return page.locator("[data-desk-said]");
}

function logRows(page: Page): Locator {
  return page.getByRole("region", { name: "Everything that happened" }).locator("tbody tr");
}

async function villageNow(request: APIRequestContext): Promise<VillageState> {
  const response = await request.get(VILLAGE_STATE_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

async function decisionsNow(request: APIRequestContext): Promise<DeskDecisions> {
  const response = await request.get(DESK_DECISIONS_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

async function logNow(request: APIRequestContext): Promise<DeskLog> {
  const response = await request.get(DESK_LOG_ROUTE);
  expect(response.status()).toBe(200);
  return response.json();
}

async function waitingItem(request: APIRequestContext, words: string): Promise<DeskItem> {
  const items = deskItemsFrom(await villageNow(request)).filter((item) => item.line.what.includes(words));
  expect(items.length, `"${words}" should be waiting on the decisions hub's desk`).toBeGreaterThan(0);
  // The same scripted sentence can wait from yesterday too; the newest is the one meant.
  return items.sort((first, second) => first.waitedMs - second.waitedMs)[0];
}

async function answerOnRecordFor(request: APIRequestContext, item: DeskItem): Promise<DeskAnswer | undefined> {
  const { answers } = await decisionsNow(request);
  return answers.find((made) => made.project === item.project && made.lineId === item.lineId);
}

/** What the project said in its own feed about an answer: the line its door adds when it takes one. */
async function doorLineFor(request: APIRequestContext, item: DeskItem) {
  const { events } = await logNow(request);
  return events.find((event) => event.line.project === item.project && event.line.id === doorLineIdFor(item.lineId))
    ?.line;
}

async function sendDecision(request: APIRequestContext, data: unknown, headers: Record<string, string> = {}) {
  const response = await request.post(DESK_DECISIONS_ROUTE, {
    data,
    headers: { "content-type": "application/json", ...headers },
  });
  return { status: response.status(), body: (await response.json()) as DecisionOutcome };
}

const RULE_CODE = /\b[HQ]\d{1,2}\b/;
const CODE_WORDS = [
  "refused_by_project",
  "already_decided",
  "note_needed",
  "not_recorded",
  "no_answer",
  "no_door",
  "needs_human",
  "result_ready",
  "undefined",
  "null",
  "NaN",
];

/** H12: nothing a person reads on the desk is a rule code, an outcome's code name or a line's id. */
async function expectPlainWordsOnly(page: Page, lineIds: readonly string[]): Promise<void> {
  const words = await page.locator("body").innerText();
  expect(words).not.toMatch(RULE_CODE);
  for (const code of CODE_WORDS) expect(words).not.toContain(code);
  for (const id of lineIds) expect(words).not.toContain(doorLineIdFor(id));
  for (const named of await page.locator("[aria-label]").all()) {
    expect(await named.getAttribute("aria-label")).not.toMatch(RULE_CODE);
  }
}

// ---- The plaza's picture ----

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

type WindowLight = "bright" | "soft" | "off";

async function windowLights(canvas: Locator, house: PlacedHouse): Promise<WindowLight[]> {
  const lights: WindowLight[] = [];
  for (const window of house.windows) {
    const colours = await coloursIn(canvas, glassOfWindow(house.build, window));
    lights.push(colours.has(palette.lamp) ? "bright" : colours.has(palette.sunset) ? "soft" : "off");
  }
  return lights;
}

/** One window for each agent at home: bright while it works, soft while it waits. */
function lightsFor(house: PlacedHouse, project: ProjectState): WindowLight[] {
  return house.windows.map((_, index) =>
    index < project.workingCount ? "bright" : index < project.agents.length ? "soft" : "off",
  );
}

// ---- Approve ----

test("an approval the project takes: it is on record, the request leaves the desk, the stack shrinks and the house goes back to work", async ({
  page,
}) => {
  const before = await villageNow(page.request);
  const armchair = await waitingItem(page.request, ARMCHAIR_275);
  const houseBefore = projectStateOf(before, APPROVAL_DESK)!;
  expect(houseBefore.waiting.map((item) => item.line.id)).toContain(armchair.lineId);

  const canvas = await openPlaza(page);
  await expect(canvas).toHaveAttribute("data-desk-papers", String(before.waitingCount));
  expect(await windowLights(canvas, approvalDeskHouse)).toEqual(lightsFor(approvalDeskHouse, houseBefore));
  await expect(canvas).toHaveAccessibleName(
    new RegExp(`${APPROVAL_DESK}: [^.]*${houseBefore.waiting.length} waiting for your answer`),
  );

  await openDesk(page);
  await expect(page.getByRole("heading", { level: 2, name: `Waiting for you (${before.waitingCount})` })).toBeVisible();
  const card = cardOf(page, armchair);
  await card.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(whatTheDeskSaid(page)).toHaveText(`${APPROVAL_DESK} took your answer: Approve.`);
  await expect(whatTheDeskSaid(page)).toBeFocused();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: `Waiting for you (${before.waitingCount - 1})` }),
  ).toBeVisible();

  // The hub's own record has the decision and the project's answer.
  expect(await answerOnRecordFor(page.request, armchair)).toMatchObject({
    choice: "approve",
    note: null,
    projectSaid: "accepted",
    reason: null,
  });
  // The project says so itself, in its own feed, and that line is scripted like the rest of its house (H10).
  const said = await doorLineFor(page.request, armchair);
  expect(said).toMatchObject({
    what: "The owner approved the €275 refund at the desk",
    status: "working",
    refers_to: armchair.lineId,
    request: armchair.line.request,
    demo: true,
  });
  const row = logRows(page).filter({ hasText: "The owner approved the €275 refund at the desk" });
  await expect(row).toHaveCount(1);
  await expect(row.getByText("DEMO", { exact: true })).toBeVisible();

  // The stack shrinks, and the house reacts: one request fewer, and its agent is at work again.
  const after = await villageNow(page.request);
  const houseAfter = projectStateOf(after, APPROVAL_DESK)!;
  expect(after.waitingCount).toBe(before.waitingCount - 1);
  expect(houseAfter.waiting.map((item) => item.line.id)).not.toContain(armchair.lineId);
  expect(houseAfter.waiting).toHaveLength(houseBefore.waiting.length - 1);
  expect(houseAfter.agents.find((agent) => agent.name === armchair.line.agent)).toMatchObject({
    isWorking: true,
    latest: { id: doorLineIdFor(armchair.lineId) },
  });

  const canvasAfter = await openPlaza(page);
  await expect(canvasAfter).toHaveAttribute("data-desk-papers", String(before.waitingCount - 1));
  expect(await windowLights(canvasAfter, approvalDeskHouse)).toEqual(lightsFor(approvalDeskHouse, houseAfter));
  expect((await windowLights(canvasAfter, approvalDeskHouse))[0]).toBe("bright");
  await expect(canvasAfter).toHaveAccessibleName(
    new RegExp(`${APPROVAL_DESK}: [^.]*1 working, ${houseAfter.waiting.length} waiting for your answer`),
  );
});

// ---- Reject ----

test("H7: a reject without a note is refused on the desk and by the hub, and with a note it goes through, by keyboard alone", async ({
  page,
}) => {
  const headphones = await waitingItem(page.request, HEADPHONES_95);
  const linesBefore = (await logNow(page.request)).events.length;
  await openDesk(page);
  const card = cardOf(page, headphones);

  await card.getByRole("button", { name: "Reject", exact: true }).focus();
  await page.keyboard.press("Enter");
  const note = card.getByRole("textbox", { name: "Your note saying why (needed)" });
  await expect(note).toBeFocused();

  // No note at all.
  await page.keyboard.press("Tab");
  await expect(card.getByRole("button", { name: "Reject with this note" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(whatTheDeskSaid(page)).toHaveText("Reject needs a note saying why. Nothing was sent.");
  await expect(note).toBeFocused();
  await expect(note).toHaveAttribute("aria-invalid", "true");
  await expect(card).toContainText("Reject needs a note saying why. Nothing was sent.");

  // Blank space is not a note either.
  await page.keyboard.type("   ");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(note).toBeFocused();
  await expect(note).toHaveAttribute("aria-invalid", "true");

  // The hub refuses it too, whatever page sends it.
  const sent = { project: headphones.project, lineId: headphones.lineId, choice: "reject" };
  for (const data of [sent, { ...sent, note: "" }, { ...sent, note: " \n\t " }]) {
    const { status, body } = await sendDecision(page.request, data);
    expect(status).toBe(422);
    expect(body).toEqual({ outcome: "note_needed", words: "Reject needs a note saying why. Nothing was sent." });
  }

  // Nothing was written and nothing was sent: no decision, and not a word from the project.
  expect(await answerOnRecordFor(page.request, headphones)).toBeUndefined();
  expect(await doorLineFor(page.request, headphones)).toBeUndefined();
  expect((await logNow(page.request)).events).toHaveLength(linesBefore);
  await expect(card).toBeVisible();

  // With a note it is carried to the project, which takes it.
  await note.fill("Two months is too long.");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(whatTheDeskSaid(page)).toHaveText(`${APPROVAL_DESK} took your answer: Reject.`);
  await expect(whatTheDeskSaid(page)).toBeFocused();
  await expect(card).toHaveCount(0);

  expect(await answerOnRecordFor(page.request, headphones)).toMatchObject({
    choice: "reject",
    note: "Two months is too long.",
    projectSaid: "accepted",
  });
  expect(await doorLineFor(page.request, headphones)).toMatchObject({
    what: "The owner turned down the €95 refund at the desk: Two months is too long.",
    refers_to: headphones.lineId,
    demo: true,
  });
});

// ---- The project says no ----

test("H2: when the project refuses, its reason is shown in plain words and there is no way around it", async ({
  page,
}) => {
  const before = await villageNow(page.request);
  const flowers = await waitingItem(page.request, FLOWERS_410);
  const linesBefore = (await logNow(page.request)).events.length;
  await openDesk(page);
  const card = cardOf(page, flowers);

  await card.getByRole("button", { name: "Approve", exact: true }).click();

  const refusal = `${APPROVAL_DESK} said no: ${OVER_THE_LIMIT} Nothing was changed there, and this request can't be answered from the desk again.`;
  await expect(whatTheDeskSaid(page)).toHaveText(refusal);
  await expect(whatTheDeskSaid(page)).toBeFocused();

  // The project still waits, so the request stays; the desk shows the answer where the buttons were.
  await expect(card).toBeVisible();
  await expect(card).toContainText(`You answered: Approve. ${refusal}`);
  await expect(card.getByRole("button")).toHaveCount(0);
  await expect(card.getByRole("textbox")).toHaveCount(0);

  // On record: the decision, and the project's own answer to it.
  expect(await answerOnRecordFor(page.request, flowers)).toMatchObject({
    choice: "approve",
    projectSaid: "refused",
    reason: OVER_THE_LIMIT,
  });
  // The project changed nothing: no new line in its feed, and the request is as open as before.
  expect(await doorLineFor(page.request, flowers)).toBeUndefined();
  expect((await logNow(page.request)).events).toHaveLength(linesBefore);
  const after = await villageNow(page.request);
  expect(after.waitingCount).toBe(before.waitingCount);
  expect(projectStateOf(after, APPROVAL_DESK)!.waiting.map((item) => item.line.id)).toContain(flowers.lineId);

  // No other way around: the same answer again and the other answer are both turned away, and nothing new is sent.
  const sent = { project: flowers.project, lineId: flowers.lineId };
  for (const data of [
    { ...sent, choice: "approve" },
    { ...sent, choice: "reject", note: "Then turn it down." },
  ]) {
    const { status, body } = await sendDecision(page.request, data);
    expect(status).toBe(409);
    expect(body.outcome).toBe("already_decided");
  }
  expect(await answerOnRecordFor(page.request, flowers)).toMatchObject({ choice: "approve", projectSaid: "refused" });
  expect((await logNow(page.request)).events).toHaveLength(linesBefore);

  // The answer is read from the record, so it is still there on a fresh look.
  await page.reload();
  await hideTheDevBadge(page);
  await expect(cardOf(page, flowers)).toContainText(`You answered: Approve. ${refusal}`);
  await expect(cardOf(page, flowers).getByRole("button")).toHaveCount(0);
  await expectPlainWordsOnly(page, [flowers.lineId]);
});

// ---- One decision ----

test("H6: a second decision on the same request is refused, and the first one stays", async ({ page, context }) => {
  const poster = await waitingItem(page.request, POSTER);
  const villageBefore = await villageNow(page.request);
  const decisionsBefore = await decisionsNow(page.request);

  // A second desk, opened before the answer and never told about it.
  const staleDesk = await context.newPage();
  const onlyAsks = (answer: unknown) => (route: Route) =>
    route.request().method() === "GET" ? route.fulfill({ json: answer }) : route.continue();
  await staleDesk.route(`**${VILLAGE_STATE_ROUTE}`, onlyAsks(villageBefore));
  await staleDesk.route(`**${DESK_DECISIONS_ROUTE}`, onlyAsks(decisionsBefore));
  await openDesk(staleDesk);
  await expect(cardOf(staleDesk, poster).getByRole("button", { name: "Approve", exact: true })).toBeVisible();

  await openDesk(page);
  await cardOf(page, poster).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(whatTheDeskSaid(page)).toHaveText(`${TEAM_PROJECT} took your answer: Approve.`);
  await expect(cardOf(page, poster)).toHaveCount(0);
  const first = await answerOnRecordFor(page.request, poster);
  expect(first).toMatchObject({ choice: "approve", projectSaid: "accepted" });
  const linesAfterFirst = (await logNow(page.request)).events.length;

  // The second press, from the desk that doesn't know.
  const answered = staleDesk.waitForResponse(
    (response) => response.url().endsWith(DESK_DECISIONS_ROUTE) && response.request().method() === "POST",
  );
  await cardOf(staleDesk, poster).getByRole("button", { name: "Approve", exact: true }).click();
  expect((await answered).status()).toBe(409);
  await expect(whatTheDeskSaid(staleDesk)).toHaveText(
    "You already answered this one: Approve. A request gets one answer, so nothing new was sent.",
  );
  await expect(cardOf(staleDesk, poster)).toContainText(`You answered: Approve. ${TEAM_PROJECT} took it.`);
  await expect(cardOf(staleDesk, poster).getByRole("button")).toHaveCount(0);

  // A different second answer is turned away the same way.
  const { status, body } = await sendDecision(page.request, {
    project: poster.project,
    lineId: poster.lineId,
    choice: "reject",
    note: "On second thoughts, no.",
  });
  expect(status).toBe(409);
  expect(body).toMatchObject({ outcome: "already_decided", answer: { choice: "approve", projectSaid: "accepted" } });

  // One decision on record, the first; and the project heard of it once.
  const { answers } = await decisionsNow(page.request);
  expect(answers.filter((made) => made.project === poster.project && made.lineId === poster.lineId)).toEqual([first]);
  expect((await logNow(page.request)).events).toHaveLength(linesAfterFirst);
  await expectPlainWordsOnly(staleDesk, [poster.lineId]);
});

// ---- The record can't be written ----

test("H5: a decision that can't be written is not sent", async ({ page }) => {
  test.setTimeout(60_000);
  const before = await villageNow(page.request);
  const honey = await waitingItem(page.request, HONEY_PRICE);
  const linesBefore = (await logNow(page.request)).events.length;
  await openDesk(page);
  const card = cardOf(page, honey);
  const approve = card.getByRole("button", { name: "Approve", exact: true });

  // Another writer holds the hub's record, so the hub's own write fails after its wait. Nothing in the hub is switched off.
  const otherWriter = new DatabaseSync(decisionsHubRecord());
  let status: number;
  try {
    otherWriter.exec("BEGIN IMMEDIATE");
    const answered = page.waitForResponse(
      (response) => response.url().endsWith(DESK_DECISIONS_ROUTE) && response.request().method() === "POST",
      { timeout: 30_000 },
    );
    await approve.click();
    status = (await answered).status();
  } finally {
    if (otherWriter.isTransaction) otherWriter.exec("ROLLBACK");
    otherWriter.close();
  }

  expect(status).toBe(503);
  await expect(whatTheDeskSaid(page)).toHaveText(notRecordedWords(TEAM_PROJECT));
  await expect(whatTheDeskSaid(page)).toHaveText(
    `The hub couldn't write your answer to its own record, so nothing was sent to ${TEAM_PROJECT}. Nothing has changed.`,
  );

  // Nothing was sent: no decision on record, not a word from the project, and the request waits as before.
  expect(await answerOnRecordFor(page.request, honey)).toBeUndefined();
  expect(await doorLineFor(page.request, honey)).toBeUndefined();
  expect((await logNow(page.request)).events).toHaveLength(linesBefore);
  const after = await villageNow(page.request);
  expect(after.waitingCount).toBe(before.waitingCount);
  expect(projectStateOf(after, TEAM_PROJECT)!.waiting.map((item) => item.line.id)).toContain(honey.lineId);

  // The owner can still answer: the buttons are where they were, with the keyboard still on the one pressed.
  await expect(card).toBeVisible();
  await expect(approve).toBeVisible();
  await expect(approve).toBeFocused();
  await expect(card.getByRole("button", { name: "Reject", exact: true })).toBeVisible();
  await expectPlainWordsOnly(page, [honey.lineId]);
});

// ---- The hub never decides ----

test("H1: nothing is decided until the owner presses a choice: looking, opening the note and leaving it decide nothing", async ({
  page,
}) => {
  const honey = await waitingItem(page.request, HONEY_PRICE);
  const decisionsBefore = await decisionsNow(page.request);
  const linesBefore = (await logNow(page.request)).events.length;

  await openDesk(page);
  const card = cardOf(page, honey);
  // Every choice is the request's own, and none of them is pressed for the owner.
  await expect(card.getByRole("button")).toHaveText(honey.line.choices!.map((choice) => choice.label));
  await card.getByRole("button", { name: "Approve", exact: true }).focus();
  await card.getByRole("button", { name: "Approve", exact: true }).hover();

  // Opening the note and backing out, with Escape and with Cancel.
  await card.getByRole("button", { name: "Reject", exact: true }).click();
  await card.getByRole("textbox").fill("Not sure yet");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/desk$/);
  await expect(card.getByRole("textbox")).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Reject", exact: true })).toBeFocused();
  await card.getByRole("button", { name: "Reject", exact: true }).click();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByRole("textbox")).toHaveCount(0);

  // Reading the routes decides nothing either, and they take no other kind of request.
  await page.reload();
  await openPlaza(page);
  for (const send of [page.request.put, page.request.patch, page.request.delete]) {
    expect((await send.call(page.request, DESK_DECISIONS_ROUTE, { data: {} })).status()).toBe(405);
    expect((await send.call(page.request, DESK_SEEN_ROUTE, { data: {} })).status()).toBe(405);
  }
  expect((await page.request.get(DESK_SEEN_ROUTE)).status()).toBe(405);

  expect(await decisionsNow(page.request)).toEqual(decisionsBefore);
  expect(await answerOnRecordFor(page.request, honey)).toBeUndefined();
  expect((await logNow(page.request)).events).toHaveLength(linesBefore);
});

test("the hub takes only what a desk button can send, and checks it against its own record", async ({ page }) => {
  const honey = await waitingItem(page.request, HONEY_PRICE);
  const letter = await waitingItem(page.request, WELCOME_LETTER);
  const decisionsBefore = await decisionsNow(page.request);
  const villageBefore = await villageNow(page.request);
  const linesBefore = (await logNow(page.request)).events.length;
  const aboutHoney = { project: honey.project, lineId: honey.lineId };

  const refused: [unknown, number, DecisionOutcome["outcome"]][] = [
    // Not what a button sends.
    [[], 400, "not_understood"],
    ["approve", 400, "not_understood"],
    [{}, 400, "not_understood"],
    [{ ...aboutHoney }, 400, "not_understood"],
    [{ ...aboutHoney, choice: 1 }, 400, "not_understood"],
    [{ ...aboutHoney, choice: "approve", amount: 5 }, 400, "not_understood"],
    [{ ...aboutHoney, choice: "approve", line: { ...honey.line, choices: [] } }, 400, "not_understood"],
    [{ ...aboutHoney, choice: "approve", note: "Only a reject carries a note" }, 400, "not_understood"],
    [{ ...aboutHoney, choice: "reject", note: "x".repeat(NOTE_MAX_LENGTH + 1) }, 400, "not_understood"],
    // Not on the hub's record as waiting, whatever the page thinks.
    [{ project: "no-such-project", lineId: honey.lineId, choice: "approve" }, 404, "not_waiting"],
    [{ project: honey.project, lineId: "no-such-line", choice: "approve" }, 404, "not_waiting"],
    [{ project: letter.project, lineId: letter.lineId, choice: "approve" }, 404, "not_waiting"],
    // Not one of the request's own choices.
    [{ ...aboutHoney, choice: "approve-and-double-it" }, 422, "not_offered"],
  ];
  for (const [data, status, outcome] of refused) {
    const answer = await sendDecision(page.request, data);
    expect(answer, JSON.stringify(data)).toMatchObject({ status, body: { outcome } });
    expect(answer.body.words).not.toMatch(RULE_CODE);
  }

  // Another website can't make the owner's browser decide.
  const fromElsewhere = await sendDecision(
    page.request,
    { ...aboutHoney, choice: "approve" },
    { origin: "https://elsewhere.example" },
  );
  expect(fromElsewhere).toMatchObject({ status: 403, body: { outcome: "not_understood" } });
  const asAForm = await page.request.post(DESK_DECISIONS_ROUTE, {
    form: { ...aboutHoney, choice: "approve" },
  });
  expect(asAForm.status()).toBe(415);

  const seenRefused: [unknown, number, SeenOutcome["outcome"]][] = [
    [{}, 400, "not_understood"],
    [{ project: letter.project, lineId: letter.lineId, seen: true }, 400, "not_understood"],
    [{ project: "no-such-project", lineId: letter.lineId }, 404, "not_a_result"],
    // A request waiting for an answer is not a result: it can't be waved away as seen.
    [{ ...aboutHoney }, 404, "not_a_result"],
  ];
  for (const [data, status, outcome] of seenRefused) {
    const response = await page.request.post(DESK_SEEN_ROUTE, { data });
    expect(response.status(), JSON.stringify(data)).toBe(status);
    expect(await response.json()).toMatchObject({ outcome });
  }

  // None of it left a mark.
  expect(await decisionsNow(page.request)).toEqual(decisionsBefore);
  expect(await villageNow(page.request)).toEqual(villageBefore);
  expect((await logNow(page.request)).events).toHaveLength(linesBefore);
});

// ---- Seen ----

test("a ready result marked as seen leaves the desk and the stack, and stays in the log", async ({ page }) => {
  const before = await villageNow(page.request);
  const letter = await waitingItem(page.request, WELCOME_LETTER);
  const decisionsBefore = await decisionsNow(page.request);
  const linesBefore = (await logNow(page.request)).events.length;

  const canvas = await openPlaza(page);
  await expect(canvas).toHaveAttribute("data-desk-papers", String(before.waitingCount));

  await openDesk(page);
  const card = cardOf(page, letter);
  // A result has nothing to choose: one button, and no note.
  await expect(card.getByRole("button")).toHaveText(["Mark as seen"]);
  await card.getByRole("button", { name: "Mark as seen" }).focus();
  await page.keyboard.press("Enter");

  await expect(whatTheDeskSaid(page)).toHaveText(SEEN_WORDS);
  await expect(whatTheDeskSaid(page)).toBeFocused();
  await expect(card).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: `Waiting for you (${before.waitingCount - 1})` }),
  ).toBeVisible();

  const after = await villageNow(page.request);
  expect(after.waitingCount).toBe(before.waitingCount - 1);
  expect(deskItemsFrom(after).map((item) => item.key)).not.toContain(letter.key);
  // It is the owner's own mark, not a decision: nothing was sent to the project, and its line is still in the log.
  expect(await decisionsNow(page.request)).toEqual(decisionsBefore);
  const log = await logNow(page.request);
  expect(log.events).toHaveLength(linesBefore);
  expect(log.events.some((event) => event.line.id === letter.lineId && event.line.project === letter.project)).toBe(true);

  // Marking it again changes nothing.
  const again = await page.request.post(DESK_SEEN_ROUTE, { data: { project: letter.project, lineId: letter.lineId } });
  expect(again.status()).toBe(200);
  expect(await again.json()).toMatchObject({ outcome: "already_seen" });

  await page.reload();
  await hideTheDevBadge(page);
  await expect(page.getByRole("main")).toHaveAttribute("data-desk-as-of", DECISIONS_HUB_MOMENT);
  await expect(cardOf(page, letter)).toHaveCount(0);
  const canvasAfter = await openPlaza(page);
  await expect(canvasAfter).toHaveAttribute("data-desk-papers", String(before.waitingCount - 1));
});

// ---- A house without a door ----

test("a house that can't take answers gets no buttons, and the desk says so in plain words", async ({ page }) => {
  const village = await villageNow(page.request);
  const honey = await waitingItem(page.request, HONEY_PRICE);
  // The same request as the hub's own project would send it: not scripted, so no stand-in answers for it.
  const itsOwn = { ...honey.line, demo: false };
  const withARealHouse: VillageState = {
    ...village,
    projects: village.projects.map((project) =>
      project.project === honey.project
        ? {
            ...project,
            isDemo: false,
            waiting: [{ kind: "decision", line: itsOwn, waitedMs: honey.waitedMs, isUrgent: honey.isUrgent }],
            ready: [],
          }
        : { ...project, waiting: [], ready: [] },
    ),
    waitingCount: 1,
  };
  await page.route(`**${VILLAGE_STATE_ROUTE}`, (route) => route.fulfill({ json: withARealHouse }));
  await openDesk(page);

  const card = cardOf(page, honey);
  await expect(card).toContainText(NO_DOOR_NOTE);
  await expect(card).toContainText("This house can't take answers from the hub yet.");
  await expect(card).toContainText("You can answerApprove or Reject");
  await expect(waitingList(page).getByRole("button")).toHaveCount(0);
  await expect(waitingList(page).getByRole("textbox")).toHaveCount(0);
});
