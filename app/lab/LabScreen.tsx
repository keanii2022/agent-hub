"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createClock, palette, startScreen, type Clock } from "../../lib/village/engine";
import { drawLabScene } from "./labScene";

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
  gap: 16,
  height: 48,
  padding: "0 16px",
  flexShrink: 0,
};

const headingStyle: CSSProperties = { fontSize: 16, margin: 0 };

const buttonStyle: CSSProperties = {
  font: "inherit",
  padding: "4px 14px",
  color: palette.ink,
  background: palette.lamp,
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
};

const roomStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

type LabScreenProps = {
  /** Set: the lab starts paused on exactly this moment, so a screenshot is always the same. */
  fixedTimeMs: number | null;
  pixelScale: number | null;
};

export function LabScreen({ fixedTimeMs, pixelScale }: LabScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clockRef = useRef<Clock | null>(null);
  const [paused, setPaused] = useState(fixedTimeMs !== null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clock = createClock({ startAtMs: fixedTimeMs ?? 0, paused: fixedTimeMs !== null });
    clockRef.current = clock;
    const screen = startScreen(canvas, {
      clock,
      pixelScale: pixelScale ?? undefined,
      draw: (surface, timeMs) => drawLabScene(surface, timeMs, clock.paused),
    });
    return () => screen.stop();
  }, [fixedTimeMs, pixelScale]);

  function togglePause(): void {
    const clock = clockRef.current;
    if (!clock) return;
    if (clock.paused) clock.resume();
    else clock.pause();
    setPaused(clock.paused);
  }

  return (
    <main style={pageStyle}>
      <div style={barStyle}>
        <h1 style={headingStyle}>Pixel engine lab</h1>
        <button type="button" style={buttonStyle} onClick={togglePause}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
      <div style={roomStyle}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Test picture: the colour palette, sample text and a small animated campfire"
        />
      </div>
    </main>
  );
}
