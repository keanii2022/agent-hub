import { describe, expect, it } from "vitest";
import { colourAt, type ColourName, type Surface } from "../../../lib/village/engine";
import { DEMO_TAG, FOR_SALE_WORDS, plateSizeFor } from "../../../lib/village/houses";
import {
  AWAY_WORDS,
  BACK_PLATE_WORDS,
  KEY_PRESS_MS,
  agentColours,
  backButtonBounds,
  demoTagBounds,
  insideOf,
  insideSentences,
  layoutInside,
  stationStateAt,
  stepInPlainWords,
  type InsideState,
  type StationPlace,
} from "../../../lib/village/interiors";
import type { Rect } from "../../../lib/village/plaza";
import { NO_NEWS_NOTE } from "../../../lib/village/state";
import { SCREENSHOT_MS, coloursIn, findWords, grownBy, pixelsIn, pixelsThatDiffer, wholeScreen } from "../houses/helpers";
import {
  approvalDeskHouse,
  frozenVillage,
  houseForSale,
  insideWith,
  inventedAgents,
  pictureOfInside,
  teamHouse,
  withProject,
} from "./helpers";

const EYE_LIT: ColourName = "cyan";
const SCREEN_TEXT: ColourName = "lime";
const PLASTER: ColourName = "sand";

/** The station with a little room round it, for whatever sticks out: an antenna, a hanging sign. */
function aroundStation(place: StationPlace): Rect {
  return { x: place.station.x - 8, y: place.station.y, width: place.station.width + 8, height: place.station.height };
}

function wordsOnCard(picture: Surface, place: StationPlace, words: string): boolean {
  const colours: ColourName[] = ["cream", "cloud", "mist", "lamp", "stone"];
  return colours.some((colour) => findWords(picture, words, colour, place.card) !== null);
}

function expectCardsToShowTheirAgents(inside: InsideState): void {
  const picture = pictureOfInside(inside);
  const { stations } = layoutInside(inside.agents);
  expect(stations).toHaveLength(inside.agents.length);
  for (const place of stations) {
    const agent = inside.agents[place.agentIndex];
    expect(wordsOnCard(picture, place, place.nameLine), `${agent.name}: name`).toBe(true);
    expect(place.stepLines.join(" "), `${agent.name}: step`).toBe(stepInPlainWords(agent.step));
    for (const line of [...place.stepLines, ...place.whatLines]) {
      expect(wordsOnCard(picture, place, line), `${agent.name}: "${line}"`).toBe(true);
    }
  }
}

describe("the picture of a room with agents in it", () => {
  it("approval-desk, one agent: its card shows its name, its step from the feed and what it is doing", () => {
    const inside = insideOf(approvalDeskHouse, frozenVillage);
    expectCardsToShowTheirAgents(inside);
    const [place] = layoutInside(inside.agents).stations;
    expect(place.nameLine).toBe("refund-agent");
    expect(place.stepLines).toEqual(["summary"]);
  });

  it("the team house, three agents: every card shows its own agent's name, step and words", () => {
    const inside = insideOf(teamHouse, frozenVillage);
    expectCardsToShowTheirAgents(inside);
    expect(layoutInside(inside.agents).stations.map((place) => place.nameLine)).toEqual(["builder", "checker", "planner"]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("%i invented agents: every card shows its own agent", (count) => {
    expectCardsToShowTheirAgents(insideWith(inventedAgents(count)));
  });

  it("a different step in the feed is a different step on the card", () => {
    const [agent] = inventedAgents(1);
    const before = insideWith([agent]);
    const after = insideWith([{ ...agent, step: "payout" }]);
    const [place] = layoutInside(after.agents).stations;
    expect(wordsOnCard(pictureOfInside(after), place, "payout")).toBe(true);
    expect(wordsOnCard(pictureOfInside(before), place, "payout")).toBe(false);
  });

  it("the picture covers the whole screen, so nothing of the plaza shows through", () => {
    for (const inside of [insideWith(inventedAgents(10)), insideOf(houseForSale, frozenVillage), insideOf(teamHouse, "loading")]) {
      const picture = pictureOfInside(inside);
      const holes = pixelsIn(wholeScreen).filter(({ x, y }) => colourAt(picture, x, y) === null);
      expect(holes).toEqual([]);
    }
  });
});

describe("working, idle and away", () => {
  const [agent] = inventedAgents(1);
  const working = insideWith([{ ...agent, isWorking: true }]);
  const idle = insideWith([{ ...agent, isWorking: false }]);
  const away = insideWith([{ ...agent, isWorking: true, isAway: true }]);
  const [place] = layoutInside(working.agents).stations;

  it("a working agent's eye and computer are lit; an idle agent's are not", () => {
    const atWork = coloursIn(pictureOfInside(working), place.station);
    const atRest = coloursIn(pictureOfInside(idle), place.station);
    expect(atWork).toContain(EYE_LIT);
    expect(atWork).toContain(SCREEN_TEXT);
    expect(atRest).not.toContain(EYE_LIT);
    expect(atRest).not.toContain(SCREEN_TEXT);
  });

  it("an idle agent's card has no yellow, so it is never taken for a working one", () => {
    expect(coloursIn(pictureOfInside(working), place.card)).toContain("lamp");
    expect(coloursIn(pictureOfInside(idle), place.card)).not.toContain("lamp");
  });

  it("a working agent types: its station changes from one key press to the next", () => {
    const first = pictureOfInside(working, SCREENSHOT_MS);
    const next = pictureOfInside(working, SCREENSHOT_MS + KEY_PRESS_MS);
    expect(pixelsThatDiffer(first, next, place.station).length).toBeGreaterThan(0);
    expect(pixelsThatDiffer(first, next, place.card)).toEqual([]);
  });

  it("an idle agent sits still", () => {
    const first = pictureOfInside(idle, SCREENSHOT_MS);
    for (const later of [KEY_PRESS_MS, 1000, 3300, 7777]) {
      expect(pixelsThatDiffer(first, pictureOfInside(idle, SCREENSHOT_MS + later))).toEqual([]);
    }
  });

  it("an away agent's stool is empty, its computer off, and a sign says so in plain words", () => {
    const picture = pictureOfInside(away);
    const station = coloursIn(picture, place.station);
    expect(station).not.toContain(EYE_LIT);
    expect(station).not.toContain(SCREEN_TEXT);
    expect(findWords(picture, AWAY_WORDS, "slate", aroundStation(place))).not.toBeNull();
    expect(findWords(pictureOfInside(working), AWAY_WORDS, "slate", aroundStation(place))).toBeNull();
    expect(wordsOnCard(picture, place, place.stepLines[0])).toBe(true);
  });

  it("the same moment always paints the same picture", () => {
    const room = insideWith(inventedAgents(10));
    expect(pixelsThatDiffer(pictureOfInside(room, 12345), pictureOfInside(room, 12345))).toEqual([]);
  });

  it("neighbours never type in step: each station keeps its own time and its own colour", () => {
    const agents = inventedAgents(10).map((each) => ({ ...each, isWorking: true }));
    const moments = Array.from({ length: 12 }, (_, tick) => tick * 40);
    const rhythms = agents.map((each, index) =>
      moments.map((timeMs) => stationStateAt(timeMs, index, each, true).arm).join(","),
    );
    expect(new Set(rhythms.slice(0, 2)).size).toBe(2);
    expect(new Set(agents.map((each, index) => stationStateAt(0, index, each, true).colour)).size).toBe(agentColours.length);
  });
});

describe("bunk beds and the worn-out look", () => {
  const alone = insideWith(inventedAgents(1).map((agent) => ({ ...agent, isWorking: true })));
  const shared = insideWith(inventedAgents(2).map((agent) => ({ ...agent, isWorking: true })));

  it("a lone agent has one bed; two or more have bunk beds, drawn where the layout puts them", () => {
    const [ownBed] = layoutInside(alone.agents).beds;
    const [bunk] = layoutInside(shared.agents).beds;
    expect(ownBed.kind).toBe("bed");
    expect(bunk.kind).toBe("bunk bed");
    // Each bunk has a pillow of its own.
    const pillowRows = (picture: Surface, bed: Rect): number =>
      new Set(pixelsIn(bed).filter(({ x, y }) => colourAt(picture, x, y) === "cream").map(({ y }) => y)).size;
    expect(pillowRows(pictureOfInside(alone), ownBed.bounds)).toBe(1);
    expect(pillowRows(pictureOfInside(shared), bunk.bounds)).toBe(2);
  });

  it("an agent sharing a house looks worn out: a plaster on its head that a lone agent doesn't have", () => {
    const [fresh] = layoutInside(alone.agents).stations;
    const [tired] = layoutInside(shared.agents).stations;
    const headOf = (place: StationPlace): Rect => ({ x: place.station.x, y: place.station.y, width: 14, height: 12 });
    expect(coloursIn(pictureOfInside(alone), headOf(fresh))).not.toContain(PLASTER);
    expect(coloursIn(pictureOfInside(shared), headOf(tired))).toContain(PLASTER);
  });

  it("a shared room is littered round every station; a room of one's own is not", () => {
    const litterBeside = (place: StationPlace): Rect => ({
      x: place.station.x + place.station.width + 1,
      y: place.station.y + 12,
      width: 10,
      height: 10,
    });
    for (const place of layoutInside(shared.agents).stations) {
      expect(coloursIn(pictureOfInside(shared), litterBeside(place))).toContain("cream");
    }
    const [tidy] = layoutInside(alone.agents).stations;
    expect(coloursIn(pictureOfInside(alone), litterBeside(tidy))).not.toContain("cream");
  });

  it("only a worn-out agent hard at work lets off steam", () => {
    const [agent] = inventedAgents(1);
    const busy = { ...agent, isWorking: true };
    expect(stationStateAt(SCREENSHOT_MS, 0, busy, true).steam.length).toBeGreaterThan(0);
    expect(stationStateAt(SCREENSHOT_MS, 0, busy, false).steam).toEqual([]);
    expect(stationStateAt(SCREENSHOT_MS, 0, { ...busy, isWorking: false }, true).steam).toEqual([]);
    expect(stationStateAt(SCREENSHOT_MS, 0, { ...busy, isAway: true }, true).steam).toEqual([]);
  });
});

describe("rooms with nobody at a station", () => {
  it("a house for sale is empty: no stations, no beds, the for-sale board and a plain sentence", () => {
    const inside = insideOf(houseForSale, frozenVillage);
    const picture = pictureOfInside(inside);
    const room: Rect = { x: 0, y: 15, width: wholeScreen.width, height: wholeScreen.height - 15 };
    for (const word of FOR_SALE_WORDS) expect(findWords(picture, word, "ember", room), word).not.toBeNull();
    expect(findWords(picture, insideSentences.forSale, "cloud", room)).not.toBeNull();
    const colours = coloursIn(picture, room);
    for (const sign of [EYE_LIT, SCREEN_TEXT, "lamp", "teal"] as const) {
      expect(colours, sign).not.toContain(sign);
    }
    expect(layoutInside(inside.agents)).toMatchObject({ stations: [], beds: [] });
  });

  it("a dark house has its lamps out and hangs the plain no-news note", () => {
    const dark = withProject(teamHouse.project!, { isDark: true, whyDark: "no_news", agents: [], workingCount: 0 });
    const picture = pictureOfInside(insideOf(teamHouse, dark));
    const room: Rect = { x: 0, y: 15, width: wholeScreen.width, height: wholeScreen.height - 15 };
    expect(findWords(picture, NO_NEWS_NOTE, "slate", room)).not.toBeNull();
    expect(findWords(picture, "Nothing has been heard from this house for a", "cloud", room)).not.toBeNull();
    const colours = coloursIn(picture, room);
    expect(colours).not.toContain("lamp");
    expect(colours).not.toContain(EYE_LIT);
    expect(colours).not.toContain(SCREEN_TEXT);
  });

  it("before the first news the room is dark and says nothing at all", () => {
    const picture = pictureOfInside(insideOf(teamHouse, "loading"));
    const room: Rect = { x: 0, y: 15, width: wholeScreen.width, height: wholeScreen.height - 15 };
    expect(findWords(picture, NO_NEWS_NOTE, "slate", room)).toBeNull();
    expect(coloursIn(picture, room)).not.toContain("lamp");
    expect(coloursIn(picture, { ...room, y: 100, height: 116 })).not.toContain("cloud");
  });

  it("a lit house everyone has left shows an empty station and says nobody is home", () => {
    const empty = withProject(teamHouse.project!, { agents: [], workingCount: 0 });
    const picture = pictureOfInside(insideOf(teamHouse, empty));
    const room: Rect = { x: 0, y: 15, width: wholeScreen.width, height: wholeScreen.height - 15 };
    expect(findWords(picture, insideSentences.nobodyHome, "cream", room)).not.toBeNull();
    expect(coloursIn(picture, room)).not.toContain(EYE_LIT);
  });
});

describe("the header", () => {
  it("names the house", () => {
    expect(findWords(pictureOfInside(insideOf(approvalDeskHouse, frozenVillage)), "approval-desk", "lime", wholeScreen)).not.toBeNull();
    expect(findWords(pictureOfInside(insideOf(houseForSale, frozenVillage)), "House for sale", "cream", wholeScreen)).not.toBeNull();
  });

  it("H10: the DEMO tag stays in sight inside every house on demo data, lit or dark", () => {
    const tag = demoTagBounds();
    expect(tag).toMatchObject(plateSizeFor(DEMO_TAG));
    const dark = withProject(teamHouse.project!, { isDark: true, whyDark: "feed_failed", agents: [], workingCount: 0 });
    for (const inside of [
      insideOf(approvalDeskHouse, frozenVillage),
      insideOf(teamHouse, frozenVillage),
      insideOf(teamHouse, dark),
      insideOf(teamHouse, "unreachable"),
      insideOf(teamHouse, "loading"),
    ]) {
      expect(inside.isDemo).toBe(true);
      expect(findWords(pictureOfInside(inside), DEMO_TAG, "ember", tag), inside.kind).not.toBeNull();
    }
  });

  it("H10: a house that isn't on demo data carries no tag, and neither does a house for sale", () => {
    const tag = grownBy(demoTagBounds(), 2);
    expect(findWords(pictureOfInside(insideWith(inventedAgents(3), { isDemo: false })), DEMO_TAG, "ember", tag)).toBeNull();
    expect(findWords(pictureOfInside(insideOf(houseForSale, frozenVillage)), DEMO_TAG, "ember", tag)).toBeNull();
  });

  it("the back button is painted exactly where its real button lies", () => {
    expect(backButtonBounds).toMatchObject(plateSizeFor(BACK_PLATE_WORDS));
    const picture = pictureOfInside(insideWith(inventedAgents(3)));
    expect(findWords(picture, BACK_PLATE_WORDS, "night", backButtonBounds)).not.toBeNull();
  });

  it("the back button shows the focus mark only while the keyboard is on it", () => {
    const room = insideWith(inventedAgents(3));
    const corner = { x: backButtonBounds.x - 2, y: backButtonBounds.y - 2 };
    expect(colourAt(pictureOfInside(room), corner.x, corner.y)).not.toBe("lamp");
    expect(colourAt(pictureOfInside(room, SCREENSHOT_MS, { backHasFocus: true }), corner.x, corner.y)).toBe("lamp");
    const marked = pixelsThatDiffer(pictureOfInside(room), pictureOfInside(room, SCREENSHOT_MS, { backHasFocus: true }));
    expect(marked.length).toBeGreaterThan(0);
    for (const pixel of marked) expect(pixel.y).toBeLessThan(20);
  });

  it("more agents than stations: the room says how many more, in plain words", () => {
    const picture = pictureOfInside(insideWith(inventedAgents(12)));
    expect(findWords(picture, "+2 more", "slate", wholeScreen)).not.toBeNull();
  });
});
