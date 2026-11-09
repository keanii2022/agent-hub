import { describe, expect, it } from "vitest";
import { LONGEST_FRAME_MS, createClock, startLoop, type FrameScheduler } from "../../../lib/village/engine";

function handCrankedFrames() {
  let waiting: ((nowMs: number) => void) | null = null;
  let cancelled = 0;
  const scheduler: FrameScheduler = {
    request(callback) {
      waiting = callback;
      return 1;
    },
    cancel() {
      cancelled += 1;
      waiting = null;
    },
  };
  return {
    scheduler,
    showFrameAt(nowMs: number) {
      const callback = waiting;
      waiting = null;
      callback?.(nowMs);
    },
    get hasFrameWaiting() {
      return waiting !== null;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

describe("frame loop", () => {
  it("reports the real time between frames, starting from zero", () => {
    const frames = handCrankedFrames();
    const elapsed: number[] = [];
    startLoop((realElapsedMs) => elapsed.push(realElapsedMs), frames.scheduler);

    frames.showFrameAt(1000);
    frames.showFrameAt(1016);
    frames.showFrameAt(1050);

    expect(elapsed).toEqual([0, 16, 34]);
  });

  it("caps a long gap, so coming back to a hidden tab does not jump ahead", () => {
    const frames = handCrankedFrames();
    const elapsed: number[] = [];
    startLoop((realElapsedMs) => elapsed.push(realElapsedMs), frames.scheduler);

    frames.showFrameAt(1000);
    frames.showFrameAt(61_000);
    frames.showFrameAt(61_016);

    expect(elapsed).toEqual([0, LONGEST_FRAME_MS, 16]);
  });

  it("stops asking for frames once stopped", () => {
    const frames = handCrankedFrames();
    let framesSeen = 0;
    const stop = startLoop(() => {
      framesSeen += 1;
    }, frames.scheduler);

    frames.showFrameAt(0);
    stop();
    frames.showFrameAt(16);

    expect(framesSeen).toBe(1);
    expect(frames.cancelled).toBe(1);
    expect(frames.hasFrameWaiting).toBe(false);
  });

  it("a paused clock stands still while the loop keeps running", () => {
    const frames = handCrankedFrames();
    const clock = createClock();
    startLoop((realElapsedMs) => clock.advance(realElapsedMs), frames.scheduler);

    frames.showFrameAt(0);
    frames.showFrameAt(50);
    clock.pause();
    frames.showFrameAt(100);
    frames.showFrameAt(150);
    expect(clock.timeMs).toBe(50);

    clock.resume();
    frames.showFrameAt(200);
    expect(clock.timeMs).toBe(100);
  });
});
