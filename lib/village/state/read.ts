import type { FeedLine } from "../../feed/format";
import type { HubStore } from "../../store/hub-store";
import { villageStateAt, type VillageProject, type VillageState } from "./village-state";

/**
 * How far back the village reads the record: one day. Whatever is older no
 * longer counts, so an agent not heard from for a day is not home, and a
 * request that has waited longer than a day drops out of the village (the
 * record itself keeps every line).
 */
export const VILLAGE_LOOKS_BACK_MS = 24 * 60 * 60 * 1000;

export type VillageReading = {
  store: Pick<HubStore, "readLines">;
  projects: readonly VillageProject[];
  now: Date;
  looksBackMs?: number;
  noNewsAfterMs?: number;
};

/**
 * The village's state as the record has it at `now`. Only ever reads. Each
 * project is read by itself, so one whose lines cannot be read goes dark and
 * the others are still read (H9).
 */
export function readVillageState(reading: VillageReading): VillageState {
  const { store, projects, now, looksBackMs = VILLAGE_LOOKS_BACK_MS, noNewsAfterMs } = reading;
  const happenedSince = new Date(now.getTime() - looksBackMs);
  const lines: FeedLine[] = [];
  const unreadable: string[] = [];

  for (const { project } of projects) {
    try {
      for (const stored of store.readLines({ project, happenedSince })) lines.push(stored.line);
    } catch {
      unreadable.push(project);
    }
  }
  return villageStateAt({ projects, lines, unreadable, now, noNewsAfterMs });
}
