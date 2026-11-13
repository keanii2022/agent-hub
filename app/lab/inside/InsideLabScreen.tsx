"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { createClock, palette, startScreen } from "../../../lib/village/engine";
import { describeInside, drawInside, type InsideState } from "../../../lib/village/interiors";
import type { FixedFrame } from "../../../lib/village/plaza";

const pageStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  background: palette.ink,
  color: palette.cream,
  fontFamily: "system-ui, sans-serif",
};

const barStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 40,
  padding: "0 16px",
  flexShrink: 0,
};

const headingStyle: CSSProperties = { fontSize: 16, margin: 0 };

const roomStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

type InsideLabScreenProps = FixedFrame & {
  inside: InsideState;
};

export function InsideLabScreen({ inside, fixedTimeMs, pixelScale }: InsideLabScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clock = createClock({ startAtMs: fixedTimeMs ?? 0, paused: fixedTimeMs !== null });
    const screen = startScreen(canvas, {
      clock,
      pixelScale: pixelScale ?? undefined,
      draw: (surface, timeMs) => drawInside(surface, inside, timeMs),
    });
    return () => screen.stop();
  }, [inside, fixedTimeMs, pixelScale]);

  return (
    <main style={pageStyle}>
      <div style={barStyle}>
        <h1 style={headingStyle}>Inside of a house, lab</h1>
      </div>
      <div style={roomStyle}>
        <canvas ref={canvasRef} role="img" aria-label={describeInside(inside)} />
      </div>
    </main>
  );
}
