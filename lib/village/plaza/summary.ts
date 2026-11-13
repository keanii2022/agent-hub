import { describeManagersRound } from "../characters/manager";
import { describeDelivery, paperworkOnTheDesk, type DeliveryState } from "../delivery";
import type { PlacedHouse } from "../houses/place";
import { describeHouses, villageHouses } from "../houses/village";
import { describeVillageNews, type VillageNews } from "../state/house-status";
import { NEWS_WHILE_PAUSED, speedInWords } from "./controls";
import { plazaStateAt } from "./state";

/** Everything the summary is made from: the village at one moment, and how its clock runs. */
export type SceneNow = {
  readonly timeMs: number;
  readonly paused: boolean;
  readonly speed: number;
  readonly news: VillageNews;
  readonly delivery: DeliveryState;
  /** The open house in plain sentences; null while the plaza shows. */
  readonly insideWords: string | null;
  readonly houses?: readonly PlacedHouse[];
};

/** The parts of the scene that are worth saying out loud the moment they change. */
export type NewsWorthSaying = {
  readonly pace: string;
  readonly place: string;
  readonly houses: string;
  readonly desk: string;
};

export type SceneSummary = {
  /** The whole scene, in the order a listener would want it. */
  readonly sentences: readonly string[];
  readonly worthSaying: NewsWorthSaying;
};

function paceOf(paused: boolean, speed: number): string {
  if (paused) return `The village is paused. ${NEWS_WHILE_PAUSED}`;
  return speed === 1 ? "The village runs at normal speed." : `The village runs at ${speedInWords(speed)} the normal speed.`;
}

function deskOf(delivery: DeliveryState): string {
  const onTheDesk = paperworkOnTheDesk(delivery).length;
  if (onTheDesk === 0) return "Nothing is waiting on the desk.";
  return onTheDesk === 1 ? "1 paper is waiting on the desk." : `${onTheDesk} papers are waiting on the desk.`;
}

/**
 * The scene in plain words, for whoever cannot see the picture: who is home
 * and working, what the manager or a walker is doing right now, what is on
 * the desk, and whether the village is paused and how fast it runs.
 */
export function describeScene(scene: SceneNow): SceneSummary {
  const houses = scene.houses ?? villageHouses;
  const pace = paceOf(scene.paused, scene.speed);
  const newsWords = describeVillageNews(scene.news);
  const desk = deskOf(scene.delivery);

  if (scene.insideWords !== null) {
    return {
      sentences: [scene.insideWords, pace],
      worthSaying: { pace, place: scene.insideWords.split(". ")[0], houses: newsWords, desk },
    };
  }

  const activity = plazaStateAt(scene.timeMs).human.activity;
  const sentences = [
    `The human sits at his desk in the middle, ${activity}.`,
    describeHouses(houses),
    newsWords,
    describeDelivery(scene.delivery, houses),
    describeManagersRound(houses),
    pace,
  ].filter((sentence) => sentence !== "");
  return { sentences, worthSaying: { pace, place: "Back on the plaza.", houses: newsWords, desk } };
}

/**
 * What to say out loud after the scene went from `before` to `after`: only
 * what changed among the things worth saying, never the walking about, so a
 * listener hears news and not every step. Empty when nothing worth it changed.
 */
export function announcementBetween(before: SceneSummary | null, after: SceneSummary): string {
  if (before === null) return "";
  const parts = (Object.keys(after.worthSaying) as (keyof NewsWorthSaying)[])
    .filter((part) => after.worthSaying[part] !== before.worthSaying[part])
    .map((part) => after.worthSaying[part]);
  return parts.filter((words) => words !== "").join(" ");
}
