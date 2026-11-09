export type FrameScheduler = {
  request(callback: (nowMs: number) => void): number;
  cancel(handle: number): void;
};

// A browser stops sending frames to a hidden tab. Without a cap, coming back
// would hand the clock minutes at once and everything would jump.
export const LONGEST_FRAME_MS = 100;

const browserFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/** Calls `onFrame` once per screen refresh with the real time since the last call. Returns a function that stops it. */
export function startLoop(
  onFrame: (realElapsedMs: number) => void,
  scheduler: FrameScheduler = browserFrames,
): () => void {
  let lastFrameAtMs: number | null = null;
  let pendingFrame = 0;
  let stopped = false;

  function frame(nowMs: number): void {
    if (stopped) return;
    const sinceLastFrameMs = lastFrameAtMs === null ? 0 : nowMs - lastFrameAtMs;
    lastFrameAtMs = nowMs;
    onFrame(Math.min(Math.max(0, sinceLastFrameMs), LONGEST_FRAME_MS));
    if (!stopped) pendingFrame = scheduler.request(frame);
  }

  pendingFrame = scheduler.request(frame);

  return () => {
    stopped = true;
    scheduler.cancel(pendingFrame);
  };
}
