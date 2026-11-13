import { RESULT_STATUS } from "../feed/requests";
import type { SeenResult } from "../store/desk-record";
import type { HubStore } from "../store/hub-store";
import type { VillageState } from "../village/state/village-state";
import {
  ALREADY_SEEN_WORDS,
  NOT_A_RESULT_WORDS,
  NOT_UNDERSTOOD_WORDS,
  SEEN_NOT_RECORDED_WORDS,
  SEEN_WORDS,
  type DeskSeenRequest,
  type SeenOutcome,
} from "./words";

// "Seen" is the owner's own mark on a ready result. It is not a decision:
// nothing is sent to any project, so it works for every house, door or not.

export type SeenDesk = {
  store: Pick<HubStore, "findLine" | "markResultSeen">;
  now: Date;
};

const LONGEST_NAME = 200;

function isAName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= LONGEST_NAME;
}

/** Exactly what "Mark as seen" sends, or null for anything else. */
export function readSeenRequest(sent: unknown): DeskSeenRequest | null {
  if (typeof sent !== "object" || sent === null || Array.isArray(sent)) return null;
  if (Object.keys(sent).some((part) => part !== "project" && part !== "lineId")) return null;
  const { project, lineId } = sent as Record<string, unknown>;
  return isAName(project) && isAName(lineId) ? { project, lineId } : null;
}

/** Marks one ready result as seen. `sent` is what the button sent, untrusted. Throws only when the record can't be read. */
export function markSeenAtTheDesk(desk: SeenDesk, sent: unknown): SeenOutcome {
  const request = readSeenRequest(sent);
  if (request === null) return { outcome: "not_understood", words: NOT_UNDERSTOOD_WORDS };

  const result = desk.store.findLine(request.project, request.lineId)?.line;
  if (result === undefined || result.status !== RESULT_STATUS) {
    return { outcome: "not_a_result", words: NOT_A_RESULT_WORDS };
  }
  try {
    const { marked } = desk.store.markResultSeen(result.project, result.id, desk.now);
    return marked ? { outcome: "seen", words: SEEN_WORDS } : { outcome: "already_seen", words: ALREADY_SEEN_WORDS };
  } catch {
    return { outcome: "not_recorded", words: SEEN_NOT_RECORDED_WORDS };
  }
}

/**
 * The village with the results the owner has seen taken off: they leave the
 * desk and the stack. What the village works out from the feed is untouched;
 * the owner's marks are laid over it, and the count of what is waiting follows.
 */
export function withoutSeenResults(
  village: VillageState,
  seen: readonly Pick<SeenResult, "project" | "resultLineId">[],
): VillageState {
  if (seen.length === 0) return village;
  const isSeen = (project: string, lineId: string) =>
    seen.some((mark) => mark.project === project && mark.resultLineId === lineId);

  const projects = village.projects.map((project) => {
    const ready = project.ready.filter((item) => !isSeen(item.line.project, item.line.id));
    return ready.length === project.ready.length ? project : { ...project, ready };
  });
  return {
    ...village,
    projects,
    waitingCount: projects.reduce((total, project) => total + project.waiting.length + project.ready.length, 0),
  };
}
