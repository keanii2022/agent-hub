import type { HubStore } from "../store/hub-store";
import { VILLAGE_LOOKS_BACK_MS } from "../village/state/read";
import { deskAnswerOf } from "./decide";
import type { DecisionDoor } from "./doors";
import type { DeskDecisions } from "./words";

export type DeskDecisionsReading = {
  store: Pick<HubStore, "readDecisions">;
  doors: readonly DecisionDoor[];
  /** The projects on their own data right now. */
  realProjects: readonly string[];
  now: Date;
  looksBackMs?: number;
};

/**
 * The decisions the desk needs to know about: as far back as the village
 * itself looks, since nothing older is still on the desk. Only ever reads.
 */
export function readDeskDecisions(reading: DeskDecisionsReading): DeskDecisions {
  const { store, doors, realProjects, now, looksBackMs = VILLAGE_LOOKS_BACK_MS } = reading;
  return {
    answers: store.readDecisions({ decidedSince: new Date(now.getTime() - looksBackMs) }).map(deskAnswerOf),
    canAnswer: doors.map((door) => door.project).filter((project) => !realProjects.includes(project)),
  };
}
