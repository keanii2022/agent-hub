import type { BuildName } from "../houses/builds";
import type { PlacedHouse } from "../houses/place";
import type { SignStyleName } from "../houses/signs";
import { NO_NEWS_NOTE, type VillageNews } from "../state/house-status";
import type { ProjectState } from "../state/village-state";

// What the inside of one house shows at one moment, worked out from the house
// and the village's news and nothing else. Drawing and the words for a screen
// reader both read only this.

export type InsideAgent = {
  readonly name: string;
  /** The step of its newest feed line: the one it is on, or the last one it did. */
  readonly step: string;
  /** What that line says it is doing, in the feed's own words. */
  readonly what: string;
  readonly isWorking: boolean;
  /** Out of the house for the moment, for example walking to the desk. Its station stands empty. */
  readonly isAway: boolean;
};

export type InsideKind =
  /** At least one agent lives here right now. */
  | "agents home"
  /** The house has news, and the news is that everyone has left. */
  | "nobody home"
  /** Dark: nothing heard for a while, or its news could not be read. */
  | "no news"
  /** The hub has not answered yet, so nothing is claimed. */
  | "not known yet"
  | "for sale";

export type InsideState = {
  readonly kind: InsideKind;
  /** Plain words for the title, for example "approval-desk" or "House for sale". */
  readonly houseName: string;
  readonly project: string | null;
  readonly build: BuildName;
  /** The style of the house's neon sign; null when it is for sale. */
  readonly sign: SignStyleName | null;
  /** Its activity is scripted, so the inside says DEMO too (H10). */
  readonly isDemo: boolean;
  /** One per agent living here, in the order the village's state gives them. Empty unless agents are home. */
  readonly agents: readonly InsideAgent[];
  /** Two or more share the house: they sleep in bunk beds and look worn out. */
  readonly isWornOut: boolean;
  /** One plain sentence shown in a room with no stations; empty when there is nothing to say. */
  readonly sentence: string;
};

export type InsideOptions = {
  /** Names of this house's agents who are out for the moment. */
  readonly awayAgents?: readonly string[];
};

export const AGENTS_SHARING_BUNKS_FROM = 2;

export const insideSentences = {
  forSale: "Nobody lives here yet.",
  nobodyHome: "Nobody is home right now.",
  noNews: "Nothing has been heard from this house for a while.",
  feedFailed: "This house's news could not be read.",
  hubSilent: "The hub gave no answer, so there is no news from this house.",
} as const;

function sentenceForDark(project: ProjectState | null): string {
  return project?.whyDark === "feed_failed" ? insideSentences.feedFailed : insideSentences.noNews;
}

export function insideOf(house: PlacedHouse, news: VillageNews, options: InsideOptions = {}): InsideState {
  const empty = {
    houseName: house.name,
    project: house.project,
    build: house.build,
    sign: house.sign?.style ?? null,
    agents: [],
    isWornOut: false,
  };
  if (house.isForSale) {
    return { ...empty, kind: "for sale", isDemo: false, sentence: insideSentences.forSale };
  }
  const listedAsDemo = house.data === "demo";
  if (news === "loading") return { ...empty, kind: "not known yet", isDemo: listedAsDemo, sentence: "" };
  if (news === "unreachable") {
    return { ...empty, kind: "no news", isDemo: listedAsDemo, sentence: insideSentences.hubSilent };
  }

  const project = news.projects.find((state) => state.project === house.project) ?? null;
  // H10: the list calling a house demo is enough, and so is any scripted line in it.
  const isDemo = listedAsDemo || project?.isDemo === true;
  if (project === null || project.isDark) {
    return { ...empty, kind: "no news", isDemo, sentence: sentenceForDark(project) };
  }
  if (project.agents.length === 0) {
    return { ...empty, kind: "nobody home", isDemo, sentence: insideSentences.nobodyHome };
  }

  const away = options.awayAgents ?? [];
  return {
    ...empty,
    kind: "agents home",
    isDemo,
    agents: project.agents.map((agent) => ({
      name: agent.name,
      step: agent.latest.step,
      what: agent.latest.what,
      isWorking: agent.isWorking,
      isAway: away.includes(agent.name),
    })),
    isWornOut: project.agents.length >= AGENTS_SHARING_BUNKS_FROM,
    sentence: "",
  };
}

/**
 * A step as it is shown and read out. A feed's step is one word, so a step of
 * several words arrives joined with underscores; here they are words again.
 */
export function stepInPlainWords(step: string): string {
  return step.replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function endedWithAStop(words: string): string {
  return /[.!?]$/.test(words) ? words : `${words}.`;
}

function describeAgent(agent: InsideAgent): string {
  const doing = agent.isAway
    ? "is away from its station"
    : agent.isWorking
      ? "is working at its station"
      : "is at its station, not working right now";
  const stepWords = agent.isWorking && !agent.isAway ? "Step" : "Last step";
  return `${agent.name} ${doing}. ${stepWords}: ${stepInPlainWords(agent.step)}. ${endedWithAStop(agent.what)}`;
}

/** The accessible name of the control that opens a house from the plaza. */
export function openHouseWords(house: PlacedHouse): string {
  return house.isForSale ? `Open the house for sale, ${house.lot.name}` : `Open the ${house.name} house`;
}

export const BACK_TO_PLAZA_WORDS = "Back to the plaza";

/** The inside of a house in plain sentences, for whoever cannot see the picture. */
export function describeInside(inside: InsideState): string {
  if (inside.kind === "for sale") return `Inside a house for sale. The room is empty. ${inside.sentence}`;

  const parts = [`Inside the ${inside.houseName} house${inside.isDemo ? " (demo)" : ""}.`];
  if (inside.kind === "not known yet") parts.push("Its news has not arrived yet.");
  else if (inside.kind === "no news") parts.push(`The room is dark: ${NO_NEWS_NOTE}.`, inside.sentence);
  else if (inside.kind === "nobody home") parts.push(inside.sentence);
  else {
    const count = inside.agents.length;
    parts.push(
      count === 1
        ? "One agent lives here, with a bed of its own."
        : `${count} agents share the room and its bunk beds, and look worn out from hard work.`,
      ...inside.agents.map(describeAgent),
    );
  }
  return parts.join(" ");
}
