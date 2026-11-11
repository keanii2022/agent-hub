"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { SCREEN_HEIGHT, SCREEN_WIDTH, createClock, palette, startScreen } from "../engine";
import { drawVillage } from "../houses/draw";
import { describeHouses } from "../houses/village";
import type { FixedFrame } from "./frameQuery";
import { desk } from "./layout";
import { plazaStateAt } from "./state";

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
  position: "relative",
  flex: 1,
  minHeight: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

function partOfScreen(pixels: number, screenPixels: number): string {
  return `${(pixels / screenPixels) * 100}%`;
}

const computerButtonStyle: CSSProperties = {
  position: "absolute",
  left: partOfScreen(desk.computerBounds.x, SCREEN_WIDTH),
  top: partOfScreen(desk.computerBounds.y, SCREEN_HEIGHT),
  width: partOfScreen(desk.computerBounds.width, SCREEN_WIDTH),
  height: partOfScreen(desk.computerBounds.height, SCREEN_HEIGHT),
  padding: 0,
  border: "none",
  background: "transparent",
  cursor: "pointer",
  pointerEvents: "auto",
  // The focus mark is painted in the picture itself, in pixels, around the computer.
  outline: "none",
};

type CanvasSize = { width: number; height: number };

type PlazaScreenProps = FixedFrame & {
  /** Called when the computer is clicked, or pressed with Enter or Space. Left out, the computer does nothing. */
  onComputerPress?: () => void;
};

export function PlazaScreen({ fixedTimeMs, pixelScale, onComputerPress }: PlazaScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const computerHasFocusRef = useRef(false);
  const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clock = createClock({ startAtMs: fixedTimeMs ?? 0, paused: fixedTimeMs !== null });
    const screen = startScreen(canvas, {
      clock,
      pixelScale: pixelScale ?? undefined,
      draw: (surface, timeMs) =>
        drawVillage(surface, plazaStateAt(timeMs, { computerHasFocus: computerHasFocusRef.current })),
    });

    // The button over the computer is laid out in parts of the canvas, so it
    // has to know the canvas's size on the page whenever the scale changes.
    const measure = (): void => {
      const box = canvas.getBoundingClientRect();
      setCanvasSize({ width: box.width, height: box.height });
    };
    const sizeWatcher = new ResizeObserver(measure);
    sizeWatcher.observe(canvas);
    measure();

    return () => {
      sizeWatcher.disconnect();
      screen.stop();
    };
  }, [fixedTimeMs, pixelScale]);

  const overlayStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: canvasSize?.width ?? 0,
    height: canvasSize?.height ?? 0,
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  };

  return (
    <main style={pageStyle}>
      <div style={barStyle}>
        <h1 style={headingStyle}>Agent Hub</h1>
      </div>
      <div style={roomStyle}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`The plaza at dusk. The human sits at his desk in the middle, typing at his computer. ${describeHouses()}`}
        />
        <div style={overlayStyle}>
          <button
            type="button"
            aria-label="The computer on the desk"
            style={computerButtonStyle}
            onClick={onComputerPress}
            onFocus={(event) => {
              // A mouse click focuses the button too, but only keyboard focus needs a mark.
              computerHasFocusRef.current = event.currentTarget.matches(":focus-visible");
            }}
            onBlur={() => {
              computerHasFocusRef.current = false;
            }}
          />
        </div>
      </div>
    </main>
  );
}
