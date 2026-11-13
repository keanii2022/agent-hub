import { describe, expect, it } from "vitest";
import { placeHouses, villageHouses } from "../../../lib/village/houses";
import {
  BACK_TO_PLAZA_WORDS,
  describeInside,
  insideOf,
  insideSentences,
  openHouseWords,
  stepInPlainWords,
} from "../../../lib/village/interiors";
import { projectStateOf } from "../../../lib/village/state";
import { approvalDeskHouse, frozenVillage, houseForSale, teamHouse, withProject } from "./helpers";

const RULE_CODE = /\b[HQ]\d{1,2}\b/;
const FEED_WORDS = /needs_human|result_ready|no_news|feed_failed|isWorking|isAway/;

describe("the inside of a house, from the village's news", () => {
  it("each agent's step and what it is doing come from its newest feed line", () => {
    for (const house of [approvalDeskHouse, teamHouse]) {
      const project = projectStateOf(frozenVillage, house.project!)!;
      const inside = insideOf(house, frozenVillage);
      expect(inside.kind).toBe("agents home");
      expect(inside.agents).toEqual(
        project.agents.map((agent) => ({
          name: agent.name,
          step: agent.latest.step,
          what: agent.latest.what,
          isWorking: agent.isWorking,
          isAway: false,
        })),
      );
    }
    expect(insideOf(approvalDeskHouse, frozenVillage).agents.map((agent) => [agent.name, agent.step])).toEqual([
      ["refund-agent", "summary"],
    ]);
    expect(insideOf(teamHouse, frozenVillage).agents.map((agent) => [agent.name, agent.isWorking])).toEqual([
      ["builder", true],
      ["checker", false],
      ["planner", true],
    ]);
  });

  it("a newer feed line changes the step shown", () => {
    const project = projectStateOf(frozenVillage, "approval-desk")!;
    const [agent] = project.agents;
    const movedOn = withProject("approval-desk", {
      agents: [{ ...agent, latest: { ...agent.latest, step: "payout", what: "Paying back the morning's refunds" } }],
    });
    expect(insideOf(approvalDeskHouse, movedOn).agents[0]).toMatchObject({
      step: "payout",
      what: "Paying back the morning's refunds",
    });
  });

  it("one agent keeps a room to itself; two or more share bunks and are worn out", () => {
    expect(insideOf(approvalDeskHouse, frozenVillage).isWornOut).toBe(false);
    expect(insideOf(teamHouse, frozenVillage).isWornOut).toBe(true);

    const [first, second] = projectStateOf(frozenVillage, teamHouse.project!)!.agents;
    const twoHome = withProject(teamHouse.project!, { agents: [first, second] });
    const oneHome = withProject(teamHouse.project!, { agents: [first] });
    expect(insideOf(teamHouse, twoHome).isWornOut).toBe(true);
    expect(insideOf(teamHouse, oneHome).isWornOut).toBe(false);
  });

  it("an agent named as away is marked away, and nobody else is", () => {
    const inside = insideOf(teamHouse, frozenVillage, { awayAgents: ["checker", "nobody-by-this-name"] });
    expect(inside.agents.map((agent) => [agent.name, agent.isAway])).toEqual([
      ["builder", false],
      ["checker", true],
      ["planner", false],
    ]);
  });

  it("a house for sale is empty, whatever the news", () => {
    for (const news of [frozenVillage, "loading", "unreachable"] as const) {
      const inside = insideOf(houseForSale, news);
      expect(inside).toMatchObject({ kind: "for sale", project: null, agents: [], isDemo: false, isWornOut: false });
      expect(inside.sentence).toBe(insideSentences.forSale);
    }
  });

  it("a dark house has no stations and says why in plain words", () => {
    const noNews = withProject(teamHouse.project!, { isDark: true, whyDark: "no_news", agents: [], workingCount: 0 });
    const feedFailed = withProject(teamHouse.project!, { isDark: true, whyDark: "feed_failed", agents: [], workingCount: 0 });
    expect(insideOf(teamHouse, noNews)).toMatchObject({ kind: "no news", agents: [], sentence: insideSentences.noNews });
    expect(insideOf(teamHouse, feedFailed)).toMatchObject({ kind: "no news", agents: [], sentence: insideSentences.feedFailed });
    expect(insideOf(teamHouse, "unreachable")).toMatchObject({ kind: "no news", agents: [], sentence: insideSentences.hubSilent });
  });

  it("a project the news doesn't mention is dark, not guessed at", () => {
    const withoutTeam = { ...frozenVillage, projects: frozenVillage.projects.filter((state) => state.project !== teamHouse.project) };
    expect(insideOf(teamHouse, withoutTeam)).toMatchObject({ kind: "no news", agents: [] });
  });

  it("before the first news nothing is claimed", () => {
    expect(insideOf(teamHouse, "loading")).toMatchObject({ kind: "not known yet", agents: [], sentence: "" });
  });

  it("a lit house everyone has left says nobody is home", () => {
    const empty = withProject(teamHouse.project!, { agents: [], workingCount: 0 });
    expect(insideOf(teamHouse, empty)).toMatchObject({ kind: "nobody home", agents: [], sentence: insideSentences.nobodyHome });
  });

  it("H9: one house's broken feed leaves the inside of the others as it was", () => {
    const teamFailed = withProject(teamHouse.project!, { isDark: true, whyDark: "feed_failed", agents: [], workingCount: 0 });
    expect(insideOf(approvalDeskHouse, teamFailed)).toEqual(insideOf(approvalDeskHouse, frozenVillage));
  });

  it("H10: a house on demo data says so inside too, lit or dark, from the list or from its lines", () => {
    expect(insideOf(approvalDeskHouse, frozenVillage).isDemo).toBe(true);
    expect(insideOf(teamHouse, "loading").isDemo).toBe(true);
    expect(insideOf(teamHouse, "unreachable").isDemo).toBe(true);
    expect(insideOf(teamHouse, withProject(teamHouse.project!, { isDark: true, whyDark: "no_news", agents: [] })).isDemo).toBe(true);

    const [listedAsReal] = placeHouses([
      { project: "approval-desk", lot: "left of the upper street", build: "brick office", sign: "green tick marquee", props: [], data: "real" },
    ]);
    expect(insideOf(listedAsReal, withProject("approval-desk", { isDemo: false })).isDemo).toBe(false);
    expect(insideOf(listedAsReal, withProject("approval-desk", { isDemo: true })).isDemo).toBe(true);
  });
});

describe("the inside in plain sentences", () => {
  it("names every agent with its step and what it is doing", () => {
    const words = describeInside(insideOf(teamHouse, frozenVillage));
    for (const agent of projectStateOf(frozenVillage, teamHouse.project!)!.agents) {
      expect(words).toContain(agent.name);
      expect(words).toContain(agent.latest.step);
      expect(words).toContain(agent.latest.what);
    }
    expect(words).toContain(`Inside the ${teamHouse.name} house (demo).`);
    expect(words).toContain("3 agents share the room and its bunk beds, and look worn out from hard work.");
    expect(words).toContain("builder is working at its station.");
    expect(words).toContain("checker is at its station, not working right now.");
  });

  it("reads a step of several words out as words", () => {
    const project = projectStateOf(frozenVillage, "approval-desk")!;
    const [agent] = project.agents;
    const atTheGate = withProject("approval-desk", {
      agents: [{ ...agent, latest: { ...agent.latest, step: "gate_decision" } }],
    });
    expect(insideOf(approvalDeskHouse, atTheGate).agents[0].step).toBe("gate_decision");
    expect(describeInside(insideOf(approvalDeskHouse, atTheGate))).toContain("Step: gate decision.");
    expect(stepInPlainWords("summary")).toBe("summary");
  });

  it("tells a lone agent, an away agent, and each kind of empty room apart", () => {
    expect(describeInside(insideOf(approvalDeskHouse, frozenVillage))).toContain(
      "One agent lives here, with a bed of its own. refund-agent is working at its station. Step: summary.",
    );
    expect(describeInside(insideOf(teamHouse, frozenVillage, { awayAgents: ["builder"] }))).toContain(
      "builder is away from its station. Last step:",
    );
    expect(describeInside(insideOf(houseForSale, frozenVillage))).toBe(
      "Inside a house for sale. The room is empty. Nobody lives here yet.",
    );
    expect(describeInside(insideOf(teamHouse, "unreachable"))).toBe(
      `Inside the ${teamHouse.name} house (demo). The room is dark: no news. ${insideSentences.hubSilent}`,
    );
    expect(describeInside(insideOf(teamHouse, "loading"))).toBe(
      `Inside the ${teamHouse.name} house (demo). Its news has not arrived yet.`,
    );
  });

  it("H12: the words carry no rule codes and no feed words", () => {
    const everyInside = [
      ...villageHouses.flatMap((house) => [
        insideOf(house, frozenVillage),
        insideOf(house, "loading"),
        insideOf(house, "unreachable"),
        insideOf(house, frozenVillage, { awayAgents: ["builder"] }),
      ]),
      insideOf(teamHouse, withProject(teamHouse.project!, { isDark: true, whyDark: "feed_failed", agents: [] })),
      insideOf(teamHouse, withProject(teamHouse.project!, { agents: [], workingCount: 0 })),
    ];
    for (const inside of everyInside) {
      const words = describeInside(inside);
      expect(words).not.toMatch(RULE_CODE);
      expect(words).not.toMatch(FEED_WORDS);
      expect(inside.sentence).not.toMatch(RULE_CODE);
    }
  });
});

describe("the words on the controls", () => {
  it("each house's door says in plain words which house it opens", () => {
    expect(openHouseWords(approvalDeskHouse)).toBe("Open the approval-desk house");
    expect(openHouseWords(teamHouse)).toBe(`Open the ${teamHouse.name} house`);
    expect(openHouseWords(houseForSale)).toBe("Open the house for sale, left of the lower street");
  });

  it("no two doors share a name", () => {
    const names = villageHouses.map(openHouseWords);
    expect(new Set(names).size).toBe(names.length);
    for (const name of [...names, BACK_TO_PLAZA_WORDS]) expect(name).not.toMatch(RULE_CODE);
  });
});
