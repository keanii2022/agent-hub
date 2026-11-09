import { describe, expect, it } from "vitest";
import {
  BLINK_EVERY_MS,
  BLINK_LASTS_MS,
  HUMAN_HEIGHT,
  HUMAN_WIDTH,
  KEY_PRESS_MS,
  ROUTINE_ROUND_MS,
  drawHuman,
  humanRoutine,
  humanStateAt,
  type HumanActivity,
  type HumanState,
} from "../../../lib/village/characters/human";
import { colourAt, createSurface, type Surface } from "../../../lib/village/engine";

const STEP_MS = 10;

function everyMoment(fromMs: number, toMs: number): number[] {
  const moments: number[] = [];
  for (let timeMs = fromMs; timeMs < toMs; timeMs += STEP_MS) moments.push(timeMs);
  return moments;
}

function startOf(activity: HumanActivity): number {
  let startsAtMs = 0;
  for (const step of humanRoutine) {
    if (step.activity === activity) return startsAtMs;
    startsAtMs += step.lastsMs;
  }
  throw new Error(`The routine has no "${activity}" step`);
}

function lengthOf(activity: HumanActivity): number {
  const step = humanRoutine.find((candidate) => candidate.activity === activity);
  if (!step) throw new Error(`The routine has no "${activity}" step`);
  return step.lastsMs;
}

function statesDuring(activity: HumanActivity): HumanState[] {
  const startsAtMs = startOf(activity);
  return everyMoment(startsAtMs, startsAtMs + lengthOf(activity)).map(humanStateAt);
}

describe("the human's routine", () => {
  it("starts with typing, and typing fills most of every round", () => {
    expect(humanStateAt(0).activity).toBe("typing");
    const typingMs = humanRoutine
      .filter((step) => step.activity === "typing")
      .reduce((total, step) => total + step.lastsMs, 0);
    expect(typingMs / ROUTINE_ROUND_MS).toBeGreaterThan(0.6);
  });

  it("never types twice in a row without an idle move between, and never idles twice in a row", () => {
    humanRoutine.forEach((step, index) => {
      const next = humanRoutine[(index + 1) % humanRoutine.length];
      expect(step.activity === "typing").not.toBe(next.activity === "typing");
    });
  });

  it("gives the same state for the same time, every time", () => {
    for (const timeMs of [0, 1, 4200, 6500, 12800, 99999]) {
      expect(humanStateAt(timeMs)).toEqual(humanStateAt(timeMs));
    }
  });

  it("repeats every round, apart from the count of keys pressed", () => {
    for (const timeMs of [0, 4200, 6500, 12800, 18000, 25500]) {
      const { keysPressed: firstCount, ...firstRound } = humanStateAt(timeMs);
      const { keysPressed: laterCount, ...laterRound } = humanStateAt(timeMs + 3 * ROUTINE_ROUND_MS);
      // Blinks keep their own beat, so they are left out of the comparison.
      expect({ ...laterRound, eyes: "open" }).toEqual({ ...firstRound, eyes: "open" });
      expect(laterCount).toBeGreaterThan(firstCount);
    }
  });

  it("treats a time before the start as the start", () => {
    expect(humanStateAt(-500)).toEqual(humanStateAt(0));
  });

  it("goes through every activity once a round", () => {
    const seen = new Set(everyMoment(0, ROUTINE_ROUND_MS).map((timeMs) => humanStateAt(timeMs).activity));
    expect([...seen].sort()).toEqual(
      ["leaning back", "looking around", "reading the screen", "sipping coffee", "typing"].sort(),
    );
  });
});

describe("typing", () => {
  it("presses one key every beat, swapping hands each time", () => {
    const first = humanStateAt(0);
    const second = humanStateAt(KEY_PRESS_MS);
    const third = humanStateAt(2 * KEY_PRESS_MS);
    expect([first.keysPressed, second.keysPressed, third.keysPressed]).toEqual([0, 1, 2]);
    expect([first.arms, second.arms, third.arms]).toEqual([
      "near hand on the keys",
      "far hand on the keys",
      "near hand on the keys",
    ]);
  });

  it("keeps his eyes on the screen and the mug on the desk", () => {
    for (const state of statesDuring("typing")) {
      expect(state.head).toBe("at the screen");
      expect(state.holdingMug).toBe(false);
    }
  });

  it("counts keys only while typing, and the count never goes down", () => {
    let last = humanStateAt(0);
    for (const timeMs of everyMoment(STEP_MS, 2 * ROUTINE_ROUND_MS)) {
      const now = humanStateAt(timeMs);
      expect(now.keysPressed).toBeGreaterThanOrEqual(last.keysPressed);
      if (now.keysPressed > last.keysPressed) {
        expect(now.activity).toBe("typing");
        expect(now.keysPressed - last.keysPressed).toBe(1);
      }
      last = now;
    }
  });
});

describe("idle moves", () => {
  it("reading the screen: hands rest on the keys", () => {
    for (const state of statesDuring("reading the screen")) {
      expect(state.arms).toBe("resting on the keys");
      expect(state.head).toBe("at the screen");
    }
  });

  it("sipping coffee: reaches for the mug, lifts it, and puts it back", () => {
    const poses = statesDuring("sipping coffee").map((state) => state.arms);
    const order = poses.filter((pose, index) => pose !== poses[index - 1]);
    expect(order).toEqual(["reaching for the mug", "mug at the mouth", "reaching for the mug"]);
  });

  it("holds the mug exactly while it is at his mouth", () => {
    for (const timeMs of everyMoment(0, ROUTINE_ROUND_MS)) {
      const state = humanStateAt(timeMs);
      expect(state.holdingMug).toBe(state.arms === "mug at the mouth");
    }
  });

  it("looking around: turns his head to the viewer", () => {
    for (const state of statesDuring("looking around")) {
      expect(state.head).toBe("at the viewer");
    }
  });

  it("leaning back: arms go behind his head with his eyes shut, then come back to the keys", () => {
    const states = statesDuring("leaning back");
    expect(states[0].arms).toBe("resting on the keys");
    expect(states[states.length - 1].arms).toBe("resting on the keys");
    const leaning = states.filter((state) => state.arms === "behind his head");
    expect(leaning.length).toBeGreaterThan(states.length / 2);
    for (const state of leaning) {
      expect(state.head).toBe("tipped back");
      expect(state.eyes).toBe("closed");
    }
  });

  it("blinks for a moment on a steady beat", () => {
    const typingMoments = everyMoment(0, lengthOf("typing"));
    const shut = typingMoments.filter((timeMs) => humanStateAt(timeMs).eyes === "closed");
    expect(shut.length).toBeGreaterThan(0);
    expect(shut.length * STEP_MS).toBeLessThanOrEqual(
      Math.ceil(lengthOf("typing") / BLINK_EVERY_MS) * BLINK_LASTS_MS,
    );
    expect(humanStateAt(0).eyes).toBe("open");
  });
});

const ROOM_AROUND_HUMAN = 12;

function drawnAt(state: HumanState): Surface {
  const surface = createSurface(HUMAN_WIDTH + 2 * ROOM_AROUND_HUMAN, HUMAN_HEIGHT + 2 * ROOM_AROUND_HUMAN);
  drawHuman(surface, state, ROOM_AROUND_HUMAN, ROOM_AROUND_HUMAN);
  return surface;
}

function paintedPixels(surface: Surface): { x: number; y: number }[] {
  const painted: { x: number; y: number }[] = [];
  for (let y = 0; y < surface.height; y += 1) {
    for (let x = 0; x < surface.width; x += 1) {
      if (colourAt(surface, x, y) !== null) painted.push({ x, y });
    }
  }
  return painted;
}

describe("drawing the human", () => {
  const onePerPose = [0, KEY_PRESS_MS, 6500, 11900, 12800, 18000, 25500].map(humanStateAt);

  it("draws a different picture for each pose", () => {
    const pictures = onePerPose.map((state) => drawnAt(state).pixels.join(","));
    expect(new Set(pictures).size).toBe(onePerPose.length);
  });

  it("keeps his feet on the bottom row of his box in every pose", () => {
    for (const state of onePerPose) {
      const lowest = Math.max(...paintedPixels(drawnAt(state)).map((pixel) => pixel.y));
      expect(lowest).toBe(ROOM_AROUND_HUMAN + HUMAN_HEIGHT - 1);
    }
  });

  it("never reaches further out of his box than an arm's length", () => {
    for (const state of onePerPose) {
      for (const pixel of paintedPixels(drawnAt(state))) {
        expect(pixel.x).toBeGreaterThanOrEqual(ROOM_AROUND_HUMAN - 4);
        expect(pixel.x).toBeLessThan(ROOM_AROUND_HUMAN + HUMAN_WIDTH + 2);
        expect(pixel.y).toBeGreaterThanOrEqual(ROOM_AROUND_HUMAN);
      }
    }
  });

  it("shuts his eyes when the state says so, and changes nothing else", () => {
    const open = drawnAt({ ...humanStateAt(0), eyes: "open" });
    const shut = drawnAt({ ...humanStateAt(0), eyes: "closed" });
    const changed = paintedPixels(open).filter(
      (pixel) => colourAt(open, pixel.x, pixel.y) !== colourAt(shut, pixel.x, pixel.y),
    );
    expect(changed).toHaveLength(1);
    expect(colourAt(open, changed[0].x, changed[0].y)).toBe("ink");
  });
});
