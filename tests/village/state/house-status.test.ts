import { describe, expect, it } from "vitest";
import { houses } from "../../../config/houses";
import type { ColourName, Surface } from "../../../lib/village/engine";
import {
  DEMO_TAG,
  glassOfWindow,
  houseStateAt,
  placeHouses,
  signStyles,
  villageHouses,
  type PlacedHouse,
} from "../../../lib/village/houses";
import type { Rect } from "../../../lib/village/plaza";
import {
  NO_NEWS_NOTE,
  describeVillageNews,
  houseStatusFrom,
  projectsOf,
  statusOfVillage,
  villageStateAt,
  type ProjectState,
  type VillageNews,
  type VillageState,
} from "../../../lib/village/state";
import { approvalDeskScript, teamHouseScript } from "../../../lib/demo/scripts";
import { A_MOMENT_IN_THE_DEMO, dayStartOf, daysOf } from "../../demo/helpers";
import { SCREENSHOT_MS, coloursIn, findWords, pixelsThatDiffer, villageAt } from "../houses/helpers";

const [approvalDeskHouse, teamHouse, ...forSale] = villageHouses;
const projectHouses = [approvalDeskHouse, teamHouse];

const BRIGHT: ColourName = "lamp";
const SOFT: ColourName = "sunset";
const NEON: ColourName[] = ["lime", "cyan", "pink", "violet"];

/** Both scripted days, half a minute after `A_MOMENT_IN_THE_DEMO`: the moment the browser tests freeze the hub at. */
const NOW = new Date(A_MOMENT_IN_THE_DEMO.getTime() + 30_000);
const village: VillageState = villageStateAt({
  projects: projectsOf(houses),
  lines: [approvalDeskScript, teamHouseScript].flatMap((script) =>
    daysOf(script, 2, new Date(dayStartOf(script, NOW).getTime() - 1)),
  ),
  now: NOW,
});

function withProject(project: string, change: Partial<ProjectState>): VillageState {
  return {
    ...village,
    projects: village.projects.map((state) => (state.project === project ? { ...state, ...change } : state)),
  };
}

function pictureOf(news: VillageNews, placed: readonly PlacedHouse[] = villageHouses): Surface {
  return villageAt(SCREENSHOT_MS, placed, statusOfVillage(news));
}

type WindowLight = "bright" | "soft" | "off";

function windowLights(picture: Surface, house: PlacedHouse): WindowLight[] {
  return house.windows.map((window) => {
    const colours = coloursIn(picture, glassOfWindow(house.build, window));
    return colours.has(BRIGHT) ? "bright" : colours.has(SOFT) ? "soft" : "off";
  });
}

function underTheSign(house: PlacedHouse): Rect {
  return { ...house.body, height: house.door.y - house.body.y };
}

function aboveTheSign(house: PlacedHouse): Rect {
  const board = house.sign!.board;
  return { x: board.x, y: board.y - 14, width: board.width, height: 14 };
}

describe("what each house shows for the village's state", () => {
  it("lights one window per agent at home: bright for each one working, soft for each one between jobs", () => {
    expect(village.projects.map((project) => [project.agents.length, project.workingCount])).toEqual([
      [1, 1],
      [3, 2],
    ]);
    expect(houseStatusFrom(approvalDeskHouse, village)).toEqual({
      litWindows: 1,
      softWindows: 0,
      isDark: false,
      note: null,
      tag: DEMO_TAG,
    });
    expect(houseStatusFrom(teamHouse, village)).toEqual({
      litWindows: 2,
      softWindows: 1,
      isDark: false,
      note: null,
      tag: DEMO_TAG,
    });
  });

  it("paints those windows in the picture: the state decides which glow, and how", () => {
    const picture = pictureOf(village);
    expect(windowLights(picture, approvalDeskHouse)).toEqual(["bright", "off"]);
    expect(windowLights(picture, teamHouse)).toEqual(["bright", "bright", "soft"]);
  });

  it("a soft window has no bright light in it, so it is never taken for someone working", () => {
    const everyoneBetweenJobs = withProject(teamHouse.project!, {
      agents: village.projects[1].agents.map((agent) => ({ ...agent, isWorking: false })),
      workingCount: 0,
    });
    const picture = pictureOf(everyoneBetweenJobs);
    expect(windowLights(picture, teamHouse)).toEqual(["soft", "soft", "soft"]);
    for (const window of teamHouse.windows) {
      expect(coloursIn(picture, glassOfWindow(teamHouse.build, window))).not.toContain(BRIGHT);
    }
  });

  it("with everyone gone home the windows are off, but the house is not dark: its sign stays on", () => {
    const nobodyHome = withProject("approval-desk", { agents: [], workingCount: 0 });
    const status = houseStatusFrom(approvalDeskHouse, nobodyHome);
    expect(status).toMatchObject({ litWindows: 0, softWindows: 0, isDark: false, note: null });

    const picture = pictureOf(nobodyHome);
    expect(windowLights(picture, approvalDeskHouse)).toEqual(["off", "off"]);
    const sign = approvalDeskHouse.sign!;
    expect(coloursIn(picture, sign.board)).toContain(signStyles[sign.style].letters);
    expect(findWords(picture, NO_NEWS_NOTE, "slate", underTheSign(approvalDeskHouse))).toBeNull();
  });

  it("never shows more windows than the house has, bright ones first", () => {
    const crowded = withProject("approval-desk", {
      agents: Array.from({ length: 5 }, (_, index) => ({
        ...village.projects[0].agents[0],
        name: `agent-${index}`,
        isWorking: index === 0,
      })),
      workingCount: 1,
    });
    expect(houseStatusFrom(approvalDeskHouse, crowded)).toMatchObject({ litWindows: 1, softWindows: 4 });
    expect(houseStateAt(approvalDeskHouse, 0, houseStatusFrom(approvalDeskHouse, crowded))).toMatchObject({
      litWindows: 1,
      softWindows: 1,
    });
    expect(windowLights(pictureOf(crowded), approvalDeskHouse)).toEqual(["bright", "soft"]);
  });

  it("H9: a dark project's house is dark with a plain note, and the other house keeps its lights", () => {
    for (const whyDark of ["no_news", "feed_failed"] as const) {
      const teamHouseDark = withProject(teamHouse.project!, { isDark: true, whyDark, agents: [], workingCount: 0 });
      expect(houseStatusFrom(teamHouse, teamHouseDark)).toEqual({
        litWindows: 0,
        softWindows: 0,
        isDark: true,
        note: "no news",
        tag: DEMO_TAG,
      });

      const picture = pictureOf(teamHouseDark);
      expect(windowLights(picture, teamHouse)).toEqual(["off", "off", "off"]);
      const signColours = coloursIn(picture, teamHouse.sign!.bounds);
      for (const neon of NEON) expect(signColours, neon).not.toContain(neon);
      expect(findWords(picture, "no news", "slate", underTheSign(teamHouse))).not.toBeNull();

      expect(windowLights(picture, approvalDeskHouse)).toEqual(["bright", "off"]);
      expect(pixelsThatDiffer(picture, pictureOf(village), approvalDeskHouse.lot.area)).toEqual([]);
      expect(pixelsThatDiffer(picture, pictureOf(village), approvalDeskHouse.sign!.bounds)).toEqual([]);
    }
  });

  it("H9: a house the state says nothing about is dark with the note", () => {
    const withoutTheTeam: VillageState = { ...village, projects: [village.projects[0]] };
    expect(houseStatusFrom(teamHouse, withoutTheTeam)).toMatchObject({ isDark: true, note: "no news" });
    expect(houseStatusFrom(approvalDeskHouse, withoutTheTeam)).toMatchObject({ isDark: false, litWindows: 1 });
  });

  it("H9: when the hub cannot be reached, every house with a project is dark with the note", () => {
    const picture = pictureOf("unreachable");
    for (const house of projectHouses) {
      expect(houseStatusFrom(house, "unreachable")).toMatchObject({ isDark: true, note: "no news" });
      expect(windowLights(picture, house).every((light) => light === "off"), house.name).toBe(true);
      expect(findWords(picture, "no news", "slate", underTheSign(house)), house.name).not.toBeNull();
    }
  });

  it("before the hub's first answer nothing is claimed: no light, and no note either", () => {
    const picture = pictureOf("loading");
    for (const house of projectHouses) {
      expect(houseStatusFrom(house, "loading")).toEqual({
        litWindows: 0,
        softWindows: 0,
        isDark: true,
        note: null,
        tag: DEMO_TAG,
      });
      expect(findWords(picture, "no news", "slate", underTheSign(house)), house.name).toBeNull();
    }
  });

  it("a house for sale stays dark and bare whatever the news", () => {
    for (const news of [village, "loading", "unreachable"] as const) {
      for (const house of forSale) {
        expect(houseStatusFrom(house, news)).toEqual({
          litWindows: 0,
          softWindows: 0,
          isDark: true,
          note: null,
          tag: null,
        });
      }
    }
  });
});

describe("the DEMO tag, whatever the news", () => {
  it("H10: every house on demo data shows DEMO: lit, dark, before the first answer, and with the hub unreachable", () => {
    const teamHouseDark = withProject(teamHouse.project!, { isDark: true, whyDark: "no_news", agents: [], workingCount: 0 });
    for (const news of [village, teamHouseDark, "loading", "unreachable"] as const) {
      const picture = pictureOf(news);
      for (const house of projectHouses) {
        expect(houseStatusFrom(house, news).tag, house.name).toBe(DEMO_TAG);
        expect(findWords(picture, DEMO_TAG, "ember", aboveTheSign(house)), house.name).not.toBeNull();
      }
    }
  });

  it("H10: a house listed as real shows DEMO as soon as the state says its lines are scripted", () => {
    const listedAsReal = placeHouses(
      houses.map((entry) => ("project" in entry ? { ...entry, data: "real" as const } : entry)),
    );
    const scripted = pictureOf(village, listedAsReal);
    const trulyReal = pictureOf(
      { ...village, projects: village.projects.map((project) => ({ ...project, isDemo: false })) },
      listedAsReal,
    );
    for (const house of listedAsReal.filter((candidate) => candidate.sign)) {
      expect(houseStatusFrom(house, village).tag, house.name).toBe(DEMO_TAG);
      expect(findWords(scripted, DEMO_TAG, "ember", aboveTheSign(house)), house.name).not.toBeNull();
      expect(findWords(trulyReal, DEMO_TAG, "ember", aboveTheSign(house)), house.name).toBeNull();
    }
  });
});

describe("the village's news in words", () => {
  it("says who is home and working in each house, and what waits for an answer", () => {
    expect(describeVillageNews(village)).toBe(
      `approval-desk: 1 agent home, 1 working, 2 waiting for your answer. ${teamHouse.project}: 3 agents home, 2 working, 1 waiting for your answer.`,
    );
  });

  it("H9: says no news for a dark house, in the same words as its note", () => {
    const dark = withProject(teamHouse.project!, { isDark: true, whyDark: "feed_failed", agents: [], workingCount: 0 });
    expect(describeVillageNews(dark)).toContain(`${teamHouse.project}: no news.`);
    expect(describeVillageNews(dark)).toContain("approval-desk: 1 agent home");
    expect(describeVillageNews("unreachable")).toBe("There is no news from any house.");
  });

  it("says nobody is home when everyone has left, and nothing before the first answer", () => {
    const empty = withProject("approval-desk", { agents: [], workingCount: 0, waiting: [] });
    expect(describeVillageNews(empty)).toContain("approval-desk: nobody home.");
    expect(describeVillageNews("loading")).toBe("");
  });

  it("H12: uses plain words, with no rule codes", () => {
    const dark = withProject(teamHouse.project!, { isDark: true, whyDark: "no_news", agents: [], workingCount: 0 });
    for (const words of [NO_NEWS_NOTE, describeVillageNews(village), describeVillageNews(dark), describeVillageNews("unreachable")]) {
      expect(words).not.toMatch(/\b[HQ]\d{1,2}\b/);
      expect(words).not.toMatch(/no_news|feed_failed|needs_human/);
    }
  });
});
