import { describe, expect, it } from "vitest";
import { houseStateAt, villageHouses } from "../../../lib/village/houses";
import { houseStatusFrom, statusOfVillage } from "../../../lib/village/state";
import { frozenVillage, withProject } from "../interiors/helpers";

// The frozen village: approval-desk's one agent is working; the team house has
// builder and planner working and checker between jobs.
const [approvalDeskHouse, teamHouse, houseForSale] = villageHouses;
const TEAM = teamHouse.project as string;

describe("a house whose agent has walked out to the desk", () => {
  it("shows exactly what it always did while everyone at home is in", () => {
    for (const house of villageHouses) {
      expect(houseStatusFrom(house, frozenVillage, [])).toEqual(houseStatusFrom(house, frozenVillage));
      expect(statusOfVillage(frozenVillage, () => [])(house)).toEqual(statusOfVillage(frozenVillage)(house));
      expect(houseStatusFrom(house, frozenVillage)).not.toHaveProperty("agentsAway");
    }
  });

  it("turns off the window of each agent who is out: a bright one for a working agent, a soft one for one between jobs", () => {
    expect(houseStatusFrom(teamHouse, frozenVillage)).toMatchObject({ litWindows: 2, softWindows: 1 });
    expect(houseStatusFrom(teamHouse, frozenVillage, ["builder"])).toMatchObject({
      litWindows: 1,
      softWindows: 1,
      agentsAway: 1,
    });
    expect(houseStatusFrom(teamHouse, frozenVillage, ["checker"])).toMatchObject({
      litWindows: 2,
      softWindows: 0,
      agentsAway: 1,
    });
    expect(houseStatusFrom(teamHouse, frozenVillage, ["builder", "checker", "planner"])).toMatchObject({
      litWindows: 0,
      softWindows: 0,
      isDark: false,
      note: null,
      agentsAway: 3,
    });
  });

  it("stays a house with news while its only agent is out: sign on, tag on, no note, no window", () => {
    const status = houseStatusFrom(approvalDeskHouse, frozenVillage, [frozenVillage.projects[0].agents[0].name]);
    expect(status).toEqual({ ...houseStatusFrom(approvalDeskHouse, frozenVillage), litWindows: 0, softWindows: 0, agentsAway: 1 });
    expect(houseStateAt(approvalDeskHouse, 0, status).sign).not.toBeNull();
    expect(houseStateAt(approvalDeskHouse, 0, status)).toMatchObject({ isDark: false, litWindows: 0, softWindows: 0 });
  });

  it("only counts agents who live there: a name the house does not know changes nothing", () => {
    expect(houseStatusFrom(teamHouse, frozenVillage, ["nobody-by-that-name"])).toEqual(
      houseStatusFrom(teamHouse, frozenVillage),
    );
  });

  it("asks who is out house by house, by the house's own project", () => {
    const asked: string[] = [];
    const statusOf = statusOfVillage(frozenVillage, (project) => {
      asked.push(project);
      return project === TEAM ? ["planner"] : [];
    });
    expect(statusOf(teamHouse)).toMatchObject({ litWindows: 1, softWindows: 1, agentsAway: 1 });
    expect(statusOf(approvalDeskHouse)).toMatchObject({ litWindows: 1, softWindows: 0 });
    expect(statusOf(houseForSale)).toMatchObject({ isDark: true, litWindows: 0 });
    expect(asked).toEqual([TEAM, approvalDeskHouse.project]);
  });

  it("H9: a dark house and a village with no news show nobody away: nothing is known of who is in", () => {
    const dark = withProject(TEAM, { isDark: true, whyDark: "no_news", agents: [], workingCount: 0 });
    for (const news of [dark, "loading", "unreachable"] as const) {
      expect(houseStatusFrom(teamHouse, news, ["builder"])).toEqual(houseStatusFrom(teamHouse, news));
    }
  });
});
