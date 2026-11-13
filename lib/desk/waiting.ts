import type { FeedChoice } from "../feed/format";
import type { ProjectState, VillageState, WaitingItem, WhyDark } from "../village/state/village-state";

// What lies on the desk, worked out from the village's state and nothing else:
// the village and the desk read the same answer, so they can never disagree
// about what is waiting.

export type DeskItem = WaitingItem & {
  /** The project and the line's id: the same name the plaza keeps this paperwork under. */
  key: string;
  project: string;
  /** The id of the waiting line itself: what the owner's answer will point at. */
  lineId: string;
  /** H10: the line is scripted, or its whole house is. */
  isDemo: boolean;
};

function deskItemOf(project: ProjectState, item: WaitingItem): DeskItem {
  return {
    ...item,
    key: `${item.line.project}/${item.line.id}`,
    project: item.line.project,
    lineId: item.line.id,
    isDemo: project.isDemo || item.line.demo,
  };
}

function firstOf(first: boolean, second: boolean): number {
  return Number(second) - Number(first);
}

/**
 * Urgent first. Then what needs an answer before what is only there to read,
 * because an agent stands still until it is answered. Inside each of those,
 * the longest wait on top.
 */
function inDeskOrder(first: DeskItem, second: DeskItem): number {
  return (
    firstOf(first.isUrgent, second.isUrgent) ||
    firstOf(first.kind === "decision", second.kind === "decision") ||
    second.waitedMs - first.waitedMs ||
    (first.key < second.key ? -1 : first.key > second.key ? 1 : 0)
  );
}

/** The plain words on the desk for the order above. */
export const DESK_ORDER_IN_WORDS =
  "Urgent first. Then what needs your answer, then what is ready to read. The longest wait is on top.";

/** Everything waiting for the owner from every project, in the order the desk shows it. */
export function deskItemsFrom(village: VillageState): DeskItem[] {
  return village.projects
    .flatMap((project) => [...project.waiting, ...project.ready].map((item) => deskItemOf(project, item)))
    .sort(inDeskOrder);
}

export type HouseWithNoNews = {
  project: string;
  why: WhyDark;
  /** One plain sentence for the desk. */
  note: string;
};

function noNewsNote(project: string, why: WhyDark): string {
  return why === "feed_failed"
    ? `No news from ${project}: the hub can't read what it sends right now, so anything it is waiting for may be missing here.`
    : `No news from ${project} for a while. What it sent before is still listed.`;
}

/** H9: the houses the hub has no news from, each with a plain sentence. The others are untouched. */
export function housesWithNoNews(village: VillageState): HouseWithNoNews[] {
  return village.projects.flatMap((project) => {
    if (!project.isDark) return [];
    const why = project.whyDark ?? "no_news";
    return [{ project: project.project, why, note: noNewsNote(project.project, why) }];
  });
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function counted(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? "" : "s"}`;
}

/** "4 minutes", "1 hour 5 minutes", "2 days": never a number of milliseconds. */
export function waitedInWords(waitedMs: number): string {
  if (!(waitedMs >= MINUTE_MS)) return "less than a minute";
  if (waitedMs < HOUR_MS) return counted(Math.floor(waitedMs / MINUTE_MS), "minute");

  const [big, bigMs, small, smallMs] =
    waitedMs < DAY_MS ? (["hour", HOUR_MS, "minute", MINUTE_MS] as const) : (["day", DAY_MS, "hour", HOUR_MS] as const);
  const bigCount = Math.floor(waitedMs / bigMs);
  const smallCount = Math.floor((waitedMs - bigCount * bigMs) / smallMs);
  return smallCount === 0 ? counted(bigCount, big) : `${counted(bigCount, big)} ${counted(smallCount, small)}`;
}

/** The labels of a request's choices as one piece of text: "Approve or Reject". Empty when it offers none. */
export function choicesInWords(choices: readonly FeedChoice[] | undefined): string {
  const labels = (choices ?? []).map((choice) => choice.label);
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

export function kindInWords(kind: WaitingItem["kind"]): string {
  return kind === "decision" ? "Needs your answer" : "Ready to read";
}
