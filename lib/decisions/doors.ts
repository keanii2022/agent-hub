import { feedTimeOf } from "../demo/script";
import { TEAM_HOUSE_PROJECT } from "../demo/scripts/team-house";
import {
  APPROVE_CHOICE_ID,
  REJECT_CHOICE_ID,
  type FeedChoice,
  type FeedLine,
  type JsonValue,
  type WaitingFeedLine,
} from "../feed/format";
import { openRequestsFrom } from "../feed/requests";

// A project's decision door: the one way an owner's decision gets in (H3).
// The project re-checks every decision with its own rules and may refuse (H2).
//
// In Stage 1 each demo project has a stand-in door with a small scripted rule.
// A real project has none until Stage 2 settles how a decision reaches it.

export type DoorDelivery = {
  /** The waiting line the owner answered, as the hub's record holds it. */
  ask: WaitingFeedLine;
  /** The choice the owner picked, out of the ones the line itself lists. */
  choice: FeedChoice;
  note: string | null;
  at: Date;
  /** Every line the project has sent about this request so far: what a stand-in has for a memory. */
  linesOfRequest: readonly FeedLine[];
};

export type DoorAnswer =
  /** `says`: the lines the project now adds to its own feed. Not checked yet: the hub's checker has the last word. */
  | { accepted: true; says: readonly unknown[] }
  /** `reason`: the project's own reason, in plain words. */
  | { accepted: false; reason: string };

export type DecisionDoor = {
  project: string;
  knock(delivery: DoorDelivery): DoorAnswer;
};

export const NO_LONGER_WAITING_REASON = "This request is no longer waiting for an answer.";

/** The id of the line a stand-in says when it takes an answer. A scripted day's own ids are two numbers, so the two never clash. */
export function doorLineIdFor(askLineId: string): string {
  return `desk-answer-to-${askLineId}`;
}

const isApproval = (delivery: DoorDelivery) => delivery.choice.id === APPROVE_CHOICE_ID;

type StandInRule = {
  project: string;
  /** The step the project's own "the owner decided" lines use. */
  step: string;
  /** The project's own reason to say no, or null when it has none. */
  refuses(delivery: DoorDelivery): string | null;
  /** The sentences the project puts in its feed once it has taken a yes or a no. */
  saysOfApproval(delivery: DoorDelivery): string;
  saysOfRejection(delivery: DoorDelivery): string;
};

function saysWhenAccepted(rule: StandInRule, delivery: DoorDelivery): string {
  if (isApproval(delivery)) return rule.saysOfApproval(delivery);
  if (delivery.choice.id === REJECT_CHOICE_ID) return rule.saysOfRejection(delivery);
  return `The owner answered at the desk: ${delivery.choice.label}`;
}

function standInDoor(rule: StandInRule): DecisionDoor {
  return {
    project: rule.project,
    knock(delivery) {
      const { ask, choice, note, at } = delivery;
      const isStillOpen =
        ask.project === rule.project && openRequestsFrom(delivery.linesOfRequest).some((open) => open.id === ask.id);
      if (!isStillOpen) return { accepted: false, reason: NO_LONGER_WAITING_REASON };

      const reason = rule.refuses(delivery);
      if (reason !== null) return { accepted: false, reason };

      return {
        accepted: true,
        says: [
          {
            project: rule.project,
            agent: ask.agent,
            request: ask.request,
            step: rule.step,
            what: saysWhenAccepted(rule, delivery),
            status: "working",
            when: feedTimeOf(at),
            id: doorLineIdFor(ask.id),
            // Pointing at the waiting line is what closes the request.
            refers_to: ask.id,
            details: { choice: choice.id, ...(note !== null && { note }), answered: "at the hub's desk" },
            // H10: a stand-in's line is scripted, like the rest of its house.
            demo: true,
          },
        ],
      };
    },
  };
}

function amountOf(details: JsonValue | undefined): number | null {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return null;
  return typeof details.amount === "number" ? details.amount : null;
}

function onOneLine(note: string | null): string {
  return (note ?? "").replace(/\s+/g, " ").trim();
}

function refundOf(delivery: DoorDelivery): string {
  const amount = amountOf(delivery.ask.details);
  return amount === null ? "refund" : `€${amount} refund`;
}

export const APPROVAL_DESK_APPROVES_UP_TO_EUR = 400;

/** approval-desk's stand-in: it takes any answer up to its own limit, and wants bigger refunds approved at home. */
export const approvalDeskDoor: DecisionDoor = standInDoor({
  project: "approval-desk",
  step: "human_decision",
  refuses(delivery) {
    if (!isApproval(delivery)) return null;
    const amount = amountOf(delivery.ask.details);
    if (amount === null) {
      return "This request doesn't say how much the refund is, so it has to be approved in approval-desk itself.";
    }
    return amount > APPROVAL_DESK_APPROVES_UP_TO_EUR
      ? `A refund over €${APPROVAL_DESK_APPROVES_UP_TO_EUR} has to be approved in approval-desk itself.`
      : null;
  },
  saysOfApproval: (delivery) => `The owner approved the ${refundOf(delivery)} at the desk`,
  saysOfRejection: (delivery) =>
    `The owner turned down the ${refundOf(delivery)} at the desk: ${onOneLine(delivery.note)}`,
});

export const TEAM_HOUSE_SPENDS_UP_TO_EUR = 30;

/** The team house's stand-in: it takes any answer, except a yes to spending more than its own limit. */
export const teamHouseDoor: DecisionDoor = standInDoor({
  project: TEAM_HOUSE_PROJECT,
  step: "decision",
  refuses(delivery) {
    const amount = amountOf(delivery.ask.details);
    return isApproval(delivery) && amount !== null && amount > TEAM_HOUSE_SPENDS_UP_TO_EUR
      ? `Spending over €${TEAM_HOUSE_SPENDS_UP_TO_EUR} has to be signed off in ${TEAM_HOUSE_PROJECT} itself.`
      : null;
  },
  saysOfApproval: () => "The owner said yes at the desk, so this goes ahead",
  saysOfRejection: (delivery) => `The owner said no at the desk: ${onOneLine(delivery.note)}`,
});

/** One stand-in per demo project. A new demo project that takes answers is one more entry here. */
export const STAND_IN_DOORS: readonly DecisionDoor[] = [approvalDeskDoor, teamHouseDoor];
