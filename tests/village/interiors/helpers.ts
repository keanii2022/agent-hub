import { houses } from "../../../config/houses";
import { approvalDeskScript, teamHouseScript } from "../../../lib/demo/scripts";
import { createSurface, type Surface } from "../../../lib/village/engine";
import { villageHouses } from "../../../lib/village/houses";
import {
  AGENTS_SHARING_BUNKS_FROM,
  drawInside,
  type InsideAgent,
  type InsideInput,
  type InsideState,
} from "../../../lib/village/interiors";
import { projectsOf, villageStateAt, type ProjectState, type VillageState } from "../../../lib/village/state";
import { A_MOMENT_IN_THE_DEMO, dayStartOf, daysOf } from "../../demo/helpers";
import { SCREENSHOT_MS } from "../houses/helpers";

export const [approvalDeskHouse, teamHouse, houseForSale] = villageHouses;

/** Both scripted days at the moment the browser tests freeze the hub at: one agent in approval-desk, three in the team house. */
export const FROZEN_MOMENT = new Date(A_MOMENT_IN_THE_DEMO.getTime() + 30_000);

export const frozenVillage: VillageState = villageStateAt({
  projects: projectsOf(houses),
  lines: [approvalDeskScript, teamHouseScript].flatMap((script) =>
    daysOf(script, 2, new Date(dayStartOf(script, FROZEN_MOMENT).getTime() - 1)),
  ),
  now: FROZEN_MOMENT,
});

export function withProject(project: string, change: Partial<ProjectState>): VillageState {
  return {
    ...frozenVillage,
    projects: frozenVillage.projects.map((state) => (state.project === project ? { ...state, ...change } : state)),
  };
}

const inventedJobs = [
  "Sorting letters",
  "Reading the long letter about the missing garden gnome, twice, to be sure of every word in it",
  "Is the price right? The list says 12.",
  "Writing a kind reply",
  "Carrying replies to the post box",
  "Counting stamps",
  "Drawing tomorrow's round on the big map",
  "Sweeping up",
  "Checking every door twice before the lamps go out",
  "Copying out the price list",
];

/** `count` invented agents. Every third one is between jobs. */
export function inventedAgents(count: number): InsideAgent[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `agent-${index + 1}`,
    step: `step${index + 1}`,
    what: inventedJobs[index % inventedJobs.length],
    isWorking: index % 3 !== 2,
    isAway: false,
  }));
}

export function insideWith(agents: readonly InsideAgent[], change: Partial<InsideState> = {}): InsideState {
  return {
    kind: agents.length === 0 ? "nobody home" : "agents home",
    houseName: "test house",
    project: "test house",
    build: "brick office",
    sign: "blue arrow",
    isDemo: false,
    agents,
    isWornOut: agents.length >= AGENTS_SHARING_BUNKS_FROM,
    sentence: "",
    ...change,
  };
}

export function pictureOfInside(inside: InsideState, timeMs: number = SCREENSHOT_MS, input?: InsideInput): Surface {
  const surface = createSurface();
  drawInside(surface, inside, timeMs, input);
  return surface;
}
