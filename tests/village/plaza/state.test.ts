import { describe, expect, it } from "vitest";
import { KEY_PRESS_MS, ROUTINE_ROUND_MS, humanStateAt } from "../../../lib/village/characters/human";
import {
  GLASS_LINES,
  HORIZON_Y,
  LONGEST_LINE,
  frameFromQuery,
  plazaLayout,
  plazaStateAt,
} from "../../../lib/village/plaza";

const STEP_MS = 20;

function everyMoment(fromMs: number, toMs: number): number[] {
  const moments: number[] = [];
  for (let timeMs = fromMs; timeMs < toMs; timeMs += STEP_MS) moments.push(timeMs);
  return moments;
}

const oneRound = everyMoment(0, ROUTINE_ROUND_MS);

describe("the plaza's state", () => {
  it("comes from the clock alone: the same time always gives the same state", () => {
    for (const timeMs of [0, 4200, 12800, 123456]) {
      expect(plazaStateAt(timeMs)).toEqual(plazaStateAt(timeMs));
    }
  });

  it("carries the human's own state for that time", () => {
    for (const timeMs of [0, 4200, 6500, 12800]) {
      expect(plazaStateAt(timeMs).human).toEqual(humanStateAt(timeMs));
    }
  });

  it("treats a time before the start as the start", () => {
    expect(plazaStateAt(-1)).toEqual(plazaStateAt(0));
  });

  it("has the mug on the desk exactly when the human is not holding it", () => {
    const moments = oneRound.map((timeMs) => plazaStateAt(timeMs));
    for (const state of moments) expect(state.mugIsOnDesk).toBe(!state.human.holdingMug);
    expect(moments.some((state) => !state.mugIsOnDesk)).toBe(true);
  });
});

describe("the computer", () => {
  it("starts with an empty glass and the cursor at the top left", () => {
    const { computer } = plazaStateAt(0);
    expect(computer.lines).toEqual([0, 0, 0]);
    expect(computer.cursor).toEqual({ line: 0, column: 0, showing: true });
  });

  it("shows one more letter for every key the human presses", () => {
    expect(plazaStateAt(KEY_PRESS_MS).computer.lines).toEqual([1, 0, 0]);
    expect(plazaStateAt(3 * KEY_PRESS_MS).computer.lines).toEqual([3, 0, 0]);
  });

  it("starts a new line when one is finished", () => {
    expect(plazaStateAt(4 * KEY_PRESS_MS).computer.lines).toEqual([4, 0, 0]);
    expect(plazaStateAt(4 * KEY_PRESS_MS).computer.cursor).toMatchObject({ line: 1, column: 0 });
    expect(plazaStateAt(5 * KEY_PRESS_MS).computer.lines).toEqual([4, 1, 0]);
  });

  it("always fits the glass, with the cursor at the end of the line being typed", () => {
    for (const timeMs of everyMoment(0, 3 * ROUTINE_ROUND_MS)) {
      const { computer } = plazaStateAt(timeMs);
      expect(computer.lines).toHaveLength(GLASS_LINES);
      for (const letters of computer.lines) {
        expect(letters).toBeGreaterThanOrEqual(0);
        expect(letters).toBeLessThanOrEqual(LONGEST_LINE);
      }
      expect(computer.cursor.line).toBeLessThan(GLASS_LINES);
      expect(computer.cursor.column).toBe(computer.lines[computer.cursor.line]);
      expect(computer.cursor.column).toBeLessThan(plazaLayout.desk.computerGlass.width);
    }
  });

  it("scrolls: once the glass is full, the line being typed is the bottom one", () => {
    const wellIntoTyping = plazaStateAt(5800).computer;
    expect(wellIntoTyping.cursor.line).toBe(GLASS_LINES - 1);
    expect(wellIntoTyping.lines.slice(0, GLASS_LINES - 1).every((letters) => letters > 0)).toBe(true);
  });

  it("changes its text only when a key is pressed", () => {
    let last = plazaStateAt(0);
    for (const timeMs of oneRound) {
      const now = plazaStateAt(timeMs);
      if (now.human.keysPressed === last.human.keysPressed) {
        expect(now.computer.lines).toEqual(last.computer.lines);
      } else {
        expect(now.computer.lines).not.toEqual(last.computer.lines);
      }
      last = now;
    }
  });

  it("has a key down only while the human types, and always one under his hands", () => {
    for (const timeMs of oneRound) {
      const state = plazaStateAt(timeMs);
      if (state.human.activity === "typing") {
        expect(state.computer.keyDown).toBeGreaterThanOrEqual(0);
        expect(state.computer.keyDown).toBeLessThan(4);
      } else {
        expect(state.computer.keyDown).toBeNull();
      }
    }
  });

  it("keeps the cursor lit while he types and blinks it while he does not", () => {
    const whileTyping = everyMoment(0, 6000).map((timeMs) => plazaStateAt(timeMs).computer.cursor.showing);
    expect(whileTyping.every(Boolean)).toBe(true);
    const whileReading = everyMoment(6000, 7400).map(
      (timeMs) => plazaStateAt(timeMs).computer.cursor.showing,
    );
    expect(new Set(whileReading)).toEqual(new Set([true, false]));
  });

  it("has the focus mark only when the page says the keyboard is on it", () => {
    expect(plazaStateAt(4200).computer.hasFocus).toBe(false);
    expect(plazaStateAt(4200, { computerHasFocus: false }).computer.hasFocus).toBe(false);
    expect(plazaStateAt(4200, { computerHasFocus: true }).computer.hasFocus).toBe(true);
  });

  it("changes nothing else when it gets the focus", () => {
    const { computer: plain, ...restOfPlain } = plazaStateAt(4200);
    const { computer: focused, ...restOfFocused } = plazaStateAt(4200, { computerHasFocus: true });
    expect(restOfFocused).toEqual(restOfPlain);
    expect({ ...focused, hasFocus: false }).toEqual(plain);
  });
});

describe("the small things that move", () => {
  it("twinkles only the stars marked for it, and keeps every star in the sky", () => {
    const seenDim = new Set<number>();
    for (const timeMs of everyMoment(0, 6000)) {
      plazaStateAt(timeMs).stars.forEach((star, index) => {
        expect(star.at.y).toBeLessThan(HORIZON_Y);
        if (!star.bright) seenDim.add(index);
      });
    }
    const marked = plazaLayout.stars.flatMap((star, index) => (star.twinkles ? [index] : []));
    expect([...seenDim].sort((a, b) => a - b)).toEqual(marked);
  });

  it("keeps every firefly near its home, moving and blinking", () => {
    plazaLayout.fireflies.forEach((route, index) => {
      const sightings = everyMoment(0, 12000).map((timeMs) => plazaStateAt(timeMs).fireflies[index]);
      for (const firefly of sightings) {
        expect(Math.abs(firefly.at.x - route.home.x)).toBeLessThanOrEqual(route.roams.x);
        expect(Math.abs(firefly.at.y - route.home.y)).toBeLessThanOrEqual(route.roams.y);
        expect(firefly.at.y).toBeGreaterThan(HORIZON_Y);
      }
      expect(new Set(sightings.map((firefly) => `${firefly.at.x},${firefly.at.y}`)).size).toBeGreaterThan(5);
      expect(new Set(sightings.map((firefly) => firefly.glowing))).toEqual(new Set([true, false]));
    });
  });

  it("lets smoke rise from the burning cigarette butt and nowhere else", () => {
    const source = plazaLayout.smoulderingButt;
    for (const timeMs of everyMoment(0, 6000)) {
      const { smoke } = plazaStateAt(timeMs);
      expect(smoke.length).toBeGreaterThan(0);
      for (const puff of smoke) {
        expect(puff.at.y).toBeLessThan(source.y);
        expect(source.y - puff.at.y).toBeLessThanOrEqual(16);
        expect(Math.abs(puff.at.x - source.x)).toBeLessThanOrEqual(2);
      }
    }
  });

  it("thins a puff of smoke as it gets higher", () => {
    const source = plazaLayout.smoulderingButt;
    const puffs = everyMoment(0, 6000).flatMap((timeMs) => plazaStateAt(timeMs).smoke);
    const lowestThin = Math.min(...puffs.filter((puff) => puff.thin).map((puff) => source.y - puff.at.y));
    const highestThick = Math.max(...puffs.filter((puff) => !puff.thin).map((puff) => source.y - puff.at.y));
    expect(lowestThin).toBeGreaterThan(highestThick);
  });

  it("sparks the torn wires in short flashes, dark most of the time", () => {
    const flashes = everyMoment(0, 31000).filter((timeMs) => plazaStateAt(timeMs).wiresAreSparking);
    expect(flashes.length).toBeGreaterThan(0);
    expect(flashes.length / (31000 / STEP_MS)).toBeLessThan(0.1);
  });
});

describe("the fixed frame in a page address", () => {
  it("reads a time and a scale", () => {
    expect(frameFromQuery({ time: "4200", scale: "2" })).toEqual({ fixedTimeMs: 4200, pixelScale: 2 });
  });

  it("leaves the screen running and fitted when nothing is asked for", () => {
    expect(frameFromQuery({})).toEqual({ fixedTimeMs: null, pixelScale: null });
  });

  it("accepts time zero but no scale below one", () => {
    expect(frameFromQuery({ time: "0", scale: "0" })).toEqual({ fixedTimeMs: 0, pixelScale: null });
  });

  it("ignores anything that is not a plain whole number", () => {
    for (const value of ["-1", "1.5", "2x", "", " 3", "1e3", "99999999999999999999"]) {
      expect(frameFromQuery({ time: value, scale: value }), value).toEqual({
        fixedTimeMs: null,
        pixelScale: null,
      });
    }
    expect(frameFromQuery({ time: ["1", "2"], scale: ["3"] })).toEqual({
      fixedTimeMs: null,
      pixelScale: null,
    });
  });
});
