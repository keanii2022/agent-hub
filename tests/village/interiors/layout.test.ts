import { describe, expect, it } from "vitest";
import { DEMO_SCRIPTS } from "../../../lib/demo/scripts";
import { SCREEN_HEIGHT, SCREEN_WIDTH, measureText } from "../../../lib/village/engine";
import {
  AGENTS_PER_BUNK,
  BED_SIZE,
  BUNK_BED_SIZE,
  CUT_SHORT_MARK,
  HEADER_HEIGHT,
  STATIONS_AT_MOST,
  STATIONS_PER_ROW_AT_MOST,
  STATION_SIZE,
  backButtonBounds,
  layoutInside,
  stepInPlainWords,
  writable,
  type InsideLayout,
} from "../../../lib/village/interiors";
import type { Rect } from "../../../lib/village/plaza";
import { contains, overlap } from "../houses/helpers";
import { inventedAgents } from "./helpers";

const everyRoomSize = Array.from({ length: STATIONS_AT_MOST }, (_, index) => index + 1);
const belowTheHeader: Rect = { x: 0, y: HEADER_HEIGHT, width: SCREEN_WIDTH, height: SCREEN_HEIGHT - HEADER_HEIGHT };

function layoutFor(count: number): InsideLayout {
  return layoutInside(inventedAgents(count));
}

function everyPair<Thing>(things: readonly Thing[]): [Thing, Thing][] {
  return things.flatMap((first, index) => things.slice(index + 1).map((second): [Thing, Thing] => [first, second]));
}

describe("where the stations of a room go, for 1 to 10 agents", () => {
  it.each(everyRoomSize)("%i: every agent has a station and a card, in list order", (count) => {
    const { stations, agentsWithoutStation } = layoutFor(count);
    expect(stations.map((place) => place.agentIndex)).toEqual(Array.from({ length: count }, (_, index) => index));
    expect(agentsWithoutStation).toBe(0);
    for (const place of stations) {
      expect(place.station).toMatchObject(STATION_SIZE);
      expect(place.nameLine).toBe(`agent-${place.agentIndex + 1}`);
      expect(place.stepLines).toEqual([`step${place.agentIndex + 1}`]);
      expect(place.whatLines.length).toBeGreaterThan(0);
    }
  });

  it.each(everyRoomSize)("%i: every station and card is whole on the screen, under the header", (count) => {
    for (const place of layoutFor(count).stations) {
      expect(contains(belowTheHeader, place.station), `station ${place.agentIndex}`).toBe(true);
      expect(contains(belowTheHeader, place.card), `card ${place.agentIndex}`).toBe(true);
    }
  });

  it.each(everyRoomSize)("%i: no station or card covers another", (count) => {
    const { stations } = layoutFor(count);
    const boxes = stations.flatMap((place) => [
      { what: `station ${place.agentIndex}`, box: place.station },
      { what: `card ${place.agentIndex}`, box: place.card },
    ]);
    for (const [first, second] of everyPair(boxes)) {
      expect(overlap(first.box, second.box), `${first.what} and ${second.what}`).toBe(false);
    }
  });

  it.each(everyRoomSize)("%i: each card hangs right under its own station", (count) => {
    for (const { station, card } of layoutFor(count).stations) {
      expect(card.y).toBeGreaterThanOrEqual(station.y + station.height);
      expect(card.y - (station.y + station.height)).toBeLessThanOrEqual(4);
      expect(card.x).toBeLessThanOrEqual(station.x);
      expect(card.x + card.width).toBeGreaterThanOrEqual(station.x + station.width);
    }
  });

  it.each(everyRoomSize)("%i: every line of every card fits inside the card", (count) => {
    for (const place of layoutFor(count).stations) {
      const room = place.card.width - 4;
      for (const line of [place.nameLine, ...place.stepLines, ...place.whatLines]) {
        expect(measureText(line).width, line).toBeLessThanOrEqual(room);
      }
    }
  });

  it("up to five agents sit in one row; six to ten sit in two, the back row never the shorter", () => {
    for (const count of everyRoomSize) {
      const { rows, stations } = layoutFor(count);
      const inBackRow = stations.filter((place) => place.row === 0).length;
      const inFrontRow = stations.filter((place) => place.row === 1).length;
      expect(rows, `${count} agents`).toBe(count <= STATIONS_PER_ROW_AT_MOST ? 1 : 2);
      expect(inBackRow, `${count} agents`).toBeLessThanOrEqual(STATIONS_PER_ROW_AT_MOST);
      expect(inBackRow, `${count} agents`).toBeGreaterThanOrEqual(inFrontRow);
      expect(inBackRow + inFrontRow).toBe(count);
    }
  });

  it("each row is centred in the room", () => {
    for (const count of everyRoomSize) {
      const { stations } = layoutFor(count);
      for (const row of [0, 1]) {
        const cards = stations.filter((place) => place.row === row).map((place) => place.card);
        if (cards.length === 0) continue;
        const left = Math.min(...cards.map((card) => card.x));
        const right = SCREEN_WIDTH - Math.max(...cards.map((card) => card.x + card.width));
        expect(Math.abs(left - right), `${count} agents, row ${row}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("the same list always gives the same places, whatever the agents are doing", () => {
    const agents = inventedAgents(7);
    const busy = agents.map((agent) => ({ ...agent, isWorking: true }));
    const idleAndAway = agents.map((agent) => ({ ...agent, isWorking: false, isAway: true }));
    expect(layoutInside(busy)).toEqual(layoutInside(agents));
    expect(layoutInside(idleAndAway)).toEqual(layoutInside(agents));
  });
});

describe("the words on a card", () => {
  it("every agent name of the scripted days fits whole on a card, even in the fullest room", () => {
    const names = DEMO_SCRIPTS.flatMap((script) => script.agents.map((agent) => agent.name));
    for (const name of names) {
      const agents = inventedAgents(STATIONS_AT_MOST).map((agent) => ({ ...agent, name }));
      expect(layoutInside(agents).stations[0].nameLine).toBe(name);
    }
  });

  it("every step of the scripted days fits whole on a card, even in the fullest room", () => {
    const steps = new Set(DEMO_SCRIPTS.flatMap((script) => script.requests.flat().map((line) => line.step)));
    expect(steps.size).toBeGreaterThan(3);
    for (const step of steps) {
      const agents = inventedAgents(STATIONS_AT_MOST).map((agent) => ({ ...agent, step }));
      const [place] = layoutInside(agents).stations;
      expect(place.stepLines.join(" "), step).toBe(stepInPlainWords(step));
      expect(place.whatLines.length, step).toBeGreaterThan(0);
    }
  });

  it("a step of several words is shown as words, on a second line when it needs one", () => {
    const [agent] = inventedAgents(1);
    const crowded = inventedAgents(STATIONS_AT_MOST).map((each) => ({ ...each, step: "gate_decision" }));
    expect(layoutInside(crowded).stations[0].stepLines).toEqual(["gate", "decision"]);
    expect(layoutInside([{ ...agent, step: "gate_decision" }]).stations[0].stepLines).toEqual(["gate decision"]);
  });

  it("a second line for the step takes one from the words below it, so the card never outgrows its place", () => {
    const oneLineStep = layoutFor(STATIONS_AT_MOST).stations[1];
    const twoLineStep = layoutInside(
      inventedAgents(STATIONS_AT_MOST).map((each) => ({ ...each, step: "gate_decision" })),
    ).stations[1];
    expect(twoLineStep.stepLines.length + twoLineStep.whatLines.length).toBe(
      oneLineStep.stepLines.length + oneLineStep.whatLines.length,
    );
    expect(twoLineStep.card).toEqual(oneLineStep.card);
  });

  it("a lone agent's card has room for the longest thing the scripted days say", () => {
    const sayings = DEMO_SCRIPTS.flatMap((script) => script.requests.flat().map((line) => line.what));
    for (const what of sayings) {
      const [place] = layoutInside([{ ...inventedAgents(1)[0], what }]).stations;
      expect(place.whatLines.join(" "), what).toBe(writable(what));
    }
  });

  it("words that don't fit are cut short with a mark, never squeezed or run off the card", () => {
    const [, longWinded] = layoutFor(STATIONS_AT_MOST).stations;
    expect(longWinded.whatLines).toHaveLength(3);
    expect(longWinded.whatLines[0]).toBe("Reading the");
    expect(longWinded.whatLines.at(-1)!.endsWith(CUT_SHORT_MARK)).toBe(true);
  });

  it("a card is only as tall as its words need", () => {
    const { stations } = layoutFor(3);
    const [short, long] = stations;
    expect(short.whatLines).toHaveLength(1);
    expect(long.whatLines.length).toBeGreaterThan(1);
    expect(long.card.height).toBeGreaterThan(short.card.height);
  });
});

describe("beds", () => {
  it("a lone agent has a bed of its own", () => {
    const { beds } = layoutFor(1);
    expect(beds.map((bed) => bed.kind)).toEqual(["bed"]);
    expect(beds[0].bounds).toMatchObject(BED_SIZE);
  });

  it("two or more agents share bunk beds, two to a bunk", () => {
    for (const count of everyRoomSize.filter((size) => size >= 2)) {
      const { beds } = layoutFor(count);
      expect(beds, `${count} agents`).toHaveLength(Math.ceil(count / AGENTS_PER_BUNK));
      for (const bed of beds) {
        expect(bed.kind).toBe("bunk bed");
        expect(bed.bounds).toMatchObject(BUNK_BED_SIZE);
      }
    }
  });

  it.each(everyRoomSize)("%i: the beds stand against the back wall, clear of the window, the board, the lamps and each other", (count) => {
    const layout = layoutFor(count);
    const floorTop = layout.floor.y;
    for (const bed of layout.beds) {
      expect(contains(belowTheHeader, bed.bounds)).toBe(true);
      const feet = bed.bounds.y + bed.bounds.height - 1;
      expect(feet).toBeGreaterThanOrEqual(floorTop);
      expect(feet - floorTop).toBeLessThanOrEqual(3);
      expect(overlap(bed.bounds, layout.window)).toBe(false);
      expect(overlap(bed.bounds, layout.pinboard)).toBe(false);
      for (const lamp of layout.wallLamps) {
        expect(overlap(bed.bounds, { x: lamp.x - 11, y: lamp.y - 11, width: 23, height: 23 })).toBe(false);
      }
    }
    for (const [first, second] of everyPair(layout.beds)) {
      expect(overlap(first.bounds, second.bounds)).toBe(false);
    }
  });
});

describe("the room itself", () => {
  it.each([0, ...everyRoomSize])("%i: header, wall and floor stack to fill the screen", (count) => {
    const { header, wall, floor } = layoutFor(count);
    expect(header).toEqual({ x: 0, y: 0, width: SCREEN_WIDTH, height: HEADER_HEIGHT });
    expect(wall.y).toBe(header.height);
    expect(floor.y).toBe(wall.y + wall.height);
    expect(floor.y + floor.height).toBe(SCREEN_HEIGHT);
    expect(wall.width).toBe(SCREEN_WIDTH);
    expect(floor.width).toBe(SCREEN_WIDTH);
  });

  it.each([0, ...everyRoomSize])("%i: the window and the board hang on the wall, clear of each other and the lamps", (count) => {
    const layout = layoutFor(count);
    expect(contains(layout.wall, layout.window)).toBe(true);
    expect(contains(layout.wall, layout.pinboard)).toBe(true);
    expect(overlap(layout.window, layout.pinboard)).toBe(false);
    for (const lamp of layout.wallLamps) {
      const glow: Rect = { x: lamp.x - 11, y: lamp.y - 11, width: 23, height: 23 };
      expect(overlap(glow, layout.window)).toBe(false);
      expect(overlap(glow, layout.pinboard)).toBe(false);
    }
  });

  it("the back button sits in the header", () => {
    expect(contains({ x: 0, y: 0, width: SCREEN_WIDTH, height: HEADER_HEIGHT }, backButtonBounds)).toBe(true);
  });

  it("an empty room has no stations and no beds", () => {
    const layout = layoutInside([]);
    expect(layout.stations).toEqual([]);
    expect(layout.beds).toEqual([]);
    expect(layout.agentsWithoutStation).toBe(0);
  });

  it("more agents than stations: the first ten are seated and the room says how many it left out", () => {
    const layout = layoutFor(STATIONS_AT_MOST + 3);
    expect(layout.stations).toHaveLength(STATIONS_AT_MOST);
    expect(layout.agentsWithoutStation).toBe(3);
    expect(layout.beds).toHaveLength(STATIONS_AT_MOST / AGENTS_PER_BUNK);
    expect(layout.stations.map((place) => place.card)).toEqual(
      layoutFor(STATIONS_AT_MOST).stations.map((place) => place.card),
    );
  });
});
