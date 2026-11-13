import { feedTimeOf } from "../demo/script";
import type { HubStore, StoredFeedLine } from "../store/hub-store";
import type { VillageProject } from "../village/state/village-state";
import { DESK_LOG_LINES_PER_PROJECT, type DeskLog } from "./log";

export type DeskLogReading = {
  store: Pick<HubStore, "readLines">;
  projects: readonly VillageProject[];
  /** The projects on their own data right now, whatever the house list says. */
  realProjects: readonly string[];
  now: Date;
  linesPerProject?: number;
};

/**
 * The log as the record has it at `now`. Only ever reads. Real and scripted
 * lines are kept apart the way the village keeps them: a real house's log is
 * its real lines only and a demo house's its scripted lines only (H10). Each
 * project is read by itself, so one that can't be read is named and the
 * others are still read (H9).
 */
export function readDeskLog(reading: DeskLogReading): DeskLog {
  const { store, projects, realProjects, now, linesPerProject = DESK_LOG_LINES_PER_PROJECT } = reading;
  const nowMs = now.getTime();
  const events: StoredFeedLine[] = [];
  const unreadable: string[] = [];
  const cutShort: string[] = [];

  for (const { project, data } of projects) {
    const wantsDemo = !(data === "real" || realProjects.includes(project));
    try {
      const ofProject = store
        .readLines({ project, newestFirst: true })
        // A line dated after `now` has not happened yet, as far as this moment knows.
        .filter((stored) => stored.line.demo === wantsDemo && Date.parse(stored.line.when) <= nowMs);
      if (ofProject.length > linesPerProject) cutShort.push(project);
      events.push(...ofProject.slice(0, linesPerProject));
    } catch {
      unreadable.push(project);
    }
  }

  events.sort(
    (first, second) => Date.parse(second.line.when) - Date.parse(first.line.when) || second.seq - first.seq,
  );
  return { asOf: feedTimeOf(now), events, unreadable, cutShort };
}
