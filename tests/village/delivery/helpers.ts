import { houses } from "../../../config/houses";
import type { FeedLine } from "../../../lib/feed";
import {
  deliveryAfter,
  deliveryStartingAt,
  waitingPapersOf,
  type DeliveryEvent,
  type DeliveryState,
  type WaitingPaper,
} from "../../../lib/village/delivery";
import { villageHouses } from "../../../lib/village/houses";
import { projectsOf, villageStateAt, type VillageState } from "../../../lib/village/state";
import { feedLine, momentAt } from "../../feed/lines";

export const [approvalDeskHouse, teamHouse] = villageHouses;
export const APPROVAL_DESK = approvalDeskHouse.project as string;
export const TEAM_PROJECT = teamHouse.project as string;

export const STEP_MS = 20;

/** What the hub would answer at a moment of an invented day, given the lines written so far. */
export function villageWith(lines: readonly FeedLine[], at: string): VillageState {
  return villageStateAt({ projects: projectsOf(houses), lines, now: momentAt(at) });
}

/** The hub's answer as the event the page hands on, at a village time. */
export function newsOf(lines: readonly FeedLine[], at: string, atMs: number): DeliveryEvent {
  return { type: "news", atMs, waiting: waitingPapersOf(villageWith(lines, at)) };
}

/** A scripted "needs a decision" line. */
export function decisionNeeded(at: string, id: string, project: string = APPROVAL_DESK, urgent?: boolean): FeedLine {
  return feedLine({
    at,
    id,
    project,
    agent: "refund-agent",
    request: `REQUEST-${id}`,
    step: "gate",
    what: "Needs the owner's answer",
    status: "needs_human",
    ...(urgent && { urgent }),
  });
}

/** A scripted "result ready" line. */
export function resultReady(at: string, id: string, project: string = TEAM_PROJECT): FeedLine {
  return feedLine({
    at,
    id,
    project,
    agent: "builder",
    request: `REQUEST-${id}`,
    step: "report",
    what: "The report is ready to read",
    status: "result_ready",
  });
}

/** The owner's answer to a request, which closes it. */
export function decided(at: string, askedWith: FeedLine): FeedLine {
  return feedLine({
    at,
    project: askedWith.project,
    agent: askedWith.agent,
    request: askedWith.request,
    step: "decided",
    what: "The owner answered",
    refers_to: askedWith.id,
  });
}

/** A page that has been open since time zero and has heard that nothing is waiting. */
export function anOpenPageWithAnEmptyDesk(): DeliveryState {
  return deliveryAfter(deliveryStartingAt(0), { type: "news", atMs: 0, waiting: [] });
}

/** Every state from just after `from` up to `toMs`, a frame apart. */
export function playedTo(from: DeliveryState, toMs: number, stepMs: number = STEP_MS): DeliveryState[] {
  const states: DeliveryState[] = [];
  let state = from;
  for (let atMs = from.atMs + stepMs; atMs <= toMs; atMs += stepMs) {
    state = deliveryAfter(state, { type: "time passed", atMs });
    states.push(state);
  }
  return states;
}

/** What `read` says along the way, with repeats dropped: the order things happened in. */
export function storyOf<Told>(states: readonly DeliveryState[], read: (state: DeliveryState) => Told): Told[] {
  const story: Told[] = [];
  for (const state of states) {
    const told = read(state);
    if (story.length === 0 || JSON.stringify(story[story.length - 1]) !== JSON.stringify(told)) story.push(told);
  }
  return story;
}

export function invented(count: number, project: string = APPROVAL_DESK, urgent: readonly number[] = []): WaitingPaper[] {
  return Array.from({ length: count }, (_, index) => ({
    key: `${project}/invented-${index}`,
    project,
    kind: "decision" as const,
    isUrgent: urgent.includes(index),
    from: "refund-agent",
  }));
}
