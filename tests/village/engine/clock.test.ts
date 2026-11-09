import { describe, expect, it } from "vitest";
import { createClock } from "../../../lib/village/engine";

describe("clock", () => {
  it("starts at zero, running, at normal speed", () => {
    const clock = createClock();
    expect(clock.timeMs).toBe(0);
    expect(clock.paused).toBe(false);
    expect(clock.speed).toBe(1);
  });

  it("moves forward by the real time it is given", () => {
    const clock = createClock();
    clock.advance(16);
    clock.advance(16);
    expect(clock.timeMs).toBe(32);
  });

  it("can start at a known time", () => {
    const clock = createClock({ startAtMs: 1200 });
    clock.advance(100);
    expect(clock.timeMs).toBe(1300);
  });

  it("pause stops time", () => {
    const clock = createClock();
    clock.advance(500);
    clock.pause();
    clock.advance(500);
    clock.advance(500);
    expect(clock.paused).toBe(true);
    expect(clock.timeMs).toBe(500);
  });

  it("resume carries on from where it stopped, without catching up", () => {
    const clock = createClock();
    clock.advance(500);
    clock.pause();
    clock.advance(10_000);
    clock.resume();
    clock.advance(100);
    expect(clock.paused).toBe(false);
    expect(clock.timeMs).toBe(600);
  });

  it("can start paused on a known time and stay there", () => {
    const clock = createClock({ startAtMs: 1200, paused: true });
    clock.advance(5000);
    expect(clock.timeMs).toBe(1200);
  });

  it("speed multiplies how fast time passes", () => {
    const clock = createClock();
    clock.setSpeed(4);
    clock.advance(100);
    expect(clock.speed).toBe(4);
    expect(clock.timeMs).toBe(400);
  });

  it("a speed change only affects the time after it", () => {
    const clock = createClock();
    clock.advance(100);
    clock.setSpeed(2);
    clock.advance(100);
    clock.setSpeed(0.5);
    clock.advance(100);
    expect(clock.timeMs).toBe(350);
  });

  it("stays paused when the speed changes", () => {
    const clock = createClock({ paused: true });
    clock.setSpeed(8);
    clock.advance(1000);
    expect(clock.timeMs).toBe(0);
  });

  it("can be stepped by hand while paused, ignoring speed", () => {
    const clock = createClock({ paused: true, speed: 4 });
    clock.step(160);
    clock.step(160);
    expect(clock.timeMs).toBe(320);
    expect(clock.paused).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])("refuses a speed of %s", (speed) => {
    const clock = createClock();
    expect(() => clock.setSpeed(speed)).toThrow(RangeError);
    expect(() => createClock({ speed })).toThrow(RangeError);
    expect(clock.speed).toBe(1);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("refuses to move by %s ms", (elapsedMs) => {
    const clock = createClock({ startAtMs: 50 });
    expect(() => clock.advance(elapsedMs)).toThrow(RangeError);
    expect(() => clock.step(elapsedMs)).toThrow(RangeError);
    expect(clock.timeMs).toBe(50);
  });
});
