export type ClockOptions = {
  startAtMs?: number;
  speed?: number;
  paused?: boolean;
};

// The clock never reads the real time itself. Whoever owns it says how much
// real time went by, so a test can move it by hand and always get the same frame.
export type Clock = {
  /** Village time: real time scaled by speed, standing still while paused. */
  readonly timeMs: number;
  readonly speed: number;
  readonly paused: boolean;
  /** Real time went by. Does nothing while paused. */
  advance(realElapsedMs: number): void;
  /** Move village time by exactly this much, paused or not, ignoring speed. */
  step(villageMs: number): void;
  pause(): void;
  resume(): void;
  setSpeed(multiplier: number): void;
};

function mustNotRunBackwards(elapsedMs: number): void {
  if (!(elapsedMs >= 0) || !Number.isFinite(elapsedMs)) {
    throw new RangeError(`The clock can only move forwards, not by ${elapsedMs} ms`);
  }
}

function mustBeAboveZero(multiplier: number): void {
  // Speed zero would be a second, hidden way to pause.
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) {
    throw new RangeError(`Speed must be above zero, not ${multiplier}. Use pause to stop time`);
  }
}

export function createClock(options: ClockOptions = {}): Clock {
  let timeMs = options.startAtMs ?? 0;
  let speed = options.speed ?? 1;
  let paused = options.paused ?? false;
  mustNotRunBackwards(timeMs);
  mustBeAboveZero(speed);

  return {
    get timeMs() {
      return timeMs;
    },
    get speed() {
      return speed;
    },
    get paused() {
      return paused;
    },
    advance(realElapsedMs) {
      mustNotRunBackwards(realElapsedMs);
      if (!paused) timeMs += realElapsedMs * speed;
    },
    step(villageMs) {
      mustNotRunBackwards(villageMs);
      timeMs += villageMs;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
    },
    setSpeed(multiplier) {
      mustBeAboveZero(multiplier);
      speed = multiplier;
    },
  };
}
