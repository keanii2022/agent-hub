import type { PlacedHouse } from "../houses/place";
import { DEMO_TAG, type HouseStatus, type StatusOf } from "../houses/state";
import type { ProjectState, VillageState } from "./village-state";

// From what the village believes to what each house shows. A house shows one
// window per agent at home: bright while that agent works, soft while it is in
// but between jobs. A house has only so many windows, so the count on the wall
// stops there; the state itself always has the true number.

/** The words hung on a house the hub has heard nothing from. */
export const NO_NEWS_NOTE = "no news";

/**
 * What the page knows about the village: its state, or "loading" before the
 * hub's first answer, or "unreachable" when the hub gave none.
 */
export type VillageNews = VillageState | "loading" | "unreachable";

function tagOf(house: PlacedHouse, project: ProjectState | null): string | null {
  // H10: the list calling a house demo is enough, and so is any scripted line in it.
  return house.data === "demo" || project?.isDemo ? DEMO_TAG : null;
}

function dark(house: PlacedHouse, project: ProjectState | null, note: string | null): HouseStatus {
  return { litWindows: 0, softWindows: 0, isDark: true, note, tag: tagOf(house, project) };
}

export function houseStatusFrom(house: PlacedHouse, news: VillageNews): HouseStatus {
  if (house.isForSale) return { litWindows: 0, softWindows: 0, isDark: true, note: null, tag: null };
  // Nothing is known yet, so nothing is claimed: no light, and no note either.
  if (news === "loading") return dark(house, null, null);
  if (news === "unreachable") return dark(house, null, NO_NEWS_NOTE);

  const project = news.projects.find((state) => state.project === house.project) ?? null;
  if (project === null || project.isDark) return dark(house, project, NO_NEWS_NOTE);
  return {
    litWindows: project.workingCount,
    softWindows: project.agents.length - project.workingCount,
    isDark: false,
    note: null,
    tag: tagOf(house, project),
  };
}

export function statusOfVillage(news: VillageNews): StatusOf {
  return (house) => houseStatusFrom(house, news);
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function describeProject(project: ProjectState): string {
  if (project.isDark) return `${project.project}: ${NO_NEWS_NOTE}.`;
  const parts =
    project.agents.length === 0
      ? ["nobody home"]
      : [counted(project.agents.length, "agent home", "agents home"), `${project.workingCount} working`];
  if (project.waiting.length > 0) {
    parts.push(`${project.waiting.length} waiting for your answer`);
  }
  return `${project.project}: ${parts.join(", ")}.`;
}

/** What the houses are showing, in plain sentences, for whoever cannot see the picture. Empty before the first news. */
export function describeVillageNews(news: VillageNews): string {
  if (news === "loading") return "";
  if (news === "unreachable") return "There is no news from any house.";
  return news.projects.map(describeProject).join(" ");
}
