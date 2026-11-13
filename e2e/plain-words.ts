import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { DESK_LOG_ROUTE, type DeskLog } from "../lib/desk";
import { VILLAGE_STATE_ROUTE, type VillageState } from "../lib/village/state";

/** The hard rules' and open questions' labels: H1 to H13 and Q1 to Q8, and any like them. */
export const RULE_CODE = /\b[HQ]\d{1,2}\b/;

/** The feed's own code names, and what a page shows when a value went missing. */
const CODE_WORDS = /\b(needs_human|result_ready|feed_failed|no_news|undefined|null|NaN)\b/;

/** The id the hub gives the line it writes for an answer from the desk: never shown. */
const DESK_ANSWER_ID = "desk-answer-to-";

/**
 * What counts as an internal id, and so must never be shown:
 * - a feed line's id (on its own: a request's own name may end in the same numbers, "REQ-512-3"),
 * - the hub's key for a piece of paperwork (`project/line id`),
 * - the id of the line the hub writes for an answer from the desk.
 * What may stay: a project's own name, and a request's own name shown as a small reference.
 */
export type InternalIds = { lineIds: readonly string[]; keys: readonly string[] };

/** Every line id and paperwork key the hub knows right now, from its own answers. */
export async function internalIdsOfTheHub(request: APIRequestContext): Promise<InternalIds> {
  const lines: { project: string; id: string }[] = [];
  const village = await request.get(VILLAGE_STATE_ROUTE);
  if (village.ok()) {
    const state = (await village.json()) as VillageState;
    for (const project of state.projects) {
      for (const item of [...project.waiting, ...project.ready]) lines.push(item.line);
      for (const agent of project.agents) lines.push(agent.latest);
    }
  }
  const log = await request.get(DESK_LOG_ROUTE);
  if (log.ok()) for (const event of ((await log.json()) as DeskLog).events) lines.push(event.line);
  return {
    lineIds: [...new Set(lines.map((line) => line.id))],
    keys: [...new Set(lines.map((line) => `${line.project}/${line.id}`))],
  };
}

/**
 * Everything a person can read or hear on the page: its title, its visible
 * text, and every accessible name and description, each as its own piece.
 */
export async function wordsOnScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const pieces = [document.title, document.body.innerText];
    const spoken = ["aria-label", "aria-description", "aria-valuetext", "aria-roledescription", "title", "alt", "placeholder"];
    for (const element of Array.from(document.querySelectorAll("*"))) {
      for (const attribute of spoken) {
        const value = element.getAttribute(attribute);
        if (value) pieces.push(value);
      }
      for (const attribute of ["aria-labelledby", "aria-describedby"]) {
        for (const id of (element.getAttribute(attribute) ?? "").split(/\s+/).filter(Boolean)) {
          const named = document.getElementById(id);
          if (named?.textContent) pieces.push(named.textContent);
        }
      }
    }
    return pieces;
  });
}

function standingAlone(id: string): RegExp {
  return new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`);
}

/**
 * H12: the one scan every screen gets. Nothing a person reads or hears is a
 * rule code, a feed code name or one of the hub's internal ids.
 */
export async function expectPlainWordsOnScreen(page: Page, extra: Partial<InternalIds> = {}): Promise<void> {
  const fromHub = await internalIdsOfTheHub(page.request);
  const lineIds = [...fromHub.lineIds, ...(extra.lineIds ?? [])];
  const keys = [...fromHub.keys, ...(extra.keys ?? [])];
  const pieces = await wordsOnScreen(page);
  expect(pieces.join(" ").trim(), "the page shows no words at all").not.toBe("");
  for (const piece of pieces) {
    expect(piece, "a rule code is on screen").not.toMatch(RULE_CODE);
    expect(piece, "a code name is on screen").not.toMatch(CODE_WORDS);
    expect(piece, "the id of an answer line is on screen").not.toContain(DESK_ANSWER_ID);
    for (const key of keys) expect(piece, "a paperwork key is on screen").not.toContain(key);
    for (const id of lineIds) expect(piece, "a line id is on screen").not.toMatch(standingAlone(id));
  }
}
