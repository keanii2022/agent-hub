import { AGENTS_SHARING_BUNKS_FROM, type InsideAgent, type InsideState } from "../../../lib/village/interiors";

// Every agent, step and job here is invented, so a room of any size can be
// looked at without touching the scripted demo days.

const inventedAgents: readonly Pick<InsideAgent, "name" | "step" | "what">[] = [
  { name: "sorter", step: "sort", what: "Sorting this morning's letters into three piles: bills, thanks and complaints" },
  { name: "reader", step: "read", what: "Reading the long letter about the missing garden gnome" },
  { name: "checker", step: "check", what: "Is the gnome's price right? The list says 12, the letter says 21." },
  { name: "writer", step: "draft", what: "Writing a kind reply to the gnome's owner" },
  { name: "runner", step: "deliver", what: "Carrying the finished replies to the post box" },
  { name: "counter", step: "tally", what: "Counting the stamps left in the drawer" },
  { name: "mapper", step: "plan", what: "Drawing tomorrow's round on the big map" },
  { name: "sweeper", step: "tidy", what: "Sweeping up" },
  { name: "night-watch", step: "watch", what: "Checking every door twice before the lamps go out" },
  { name: "apprentice", step: "learn", what: "Copying out the price list to learn it by heart" },
  { name: "archivist", step: "file", what: "Filing last week's letters" },
  { name: "tinkerer", step: "fix", what: "Oiling the squeaky drawer" },
];

export const INVENTED_AGENTS_AT_MOST = inventedAgents.length;
/** The agent who is out of the invented room, counted from 0, when the room is big enough to have one. */
export const INVENTED_AWAY_AGENT = 4;
export const INVENTED_HOUSE_NAME = "lab house";

/** Every third agent is between jobs, so a room shows both working and idle stations. */
function isBetweenJobs(agentIndex: number): boolean {
  return agentIndex % 3 === 2;
}

/** An invented house with `agentCount` agents in it. Marked demo, like all invented data. */
export function inventedInside(agentCount: number): InsideState {
  const count = Math.max(0, Math.min(agentCount, INVENTED_AGENTS_AT_MOST));
  return {
    kind: count === 0 ? "nobody home" : "agents home",
    houseName: INVENTED_HOUSE_NAME,
    project: INVENTED_HOUSE_NAME,
    build: "brick office",
    sign: "pink star",
    isDemo: true,
    agents: inventedAgents.slice(0, count).map((agent, agentIndex) => ({
      ...agent,
      isWorking: !isBetweenJobs(agentIndex),
      isAway: agentIndex === INVENTED_AWAY_AGENT,
    })),
    isWornOut: count >= AGENTS_SHARING_BUNKS_FROM,
    sentence: count === 0 ? "Nobody is home right now." : "",
  };
}
