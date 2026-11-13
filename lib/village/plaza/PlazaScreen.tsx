"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { describeManagersRound } from "../characters/manager";
import {
  agentsAwayFrom,
  deliveryAfter,
  deliveryDrawables,
  deliveryFollowing,
  deliveryMarksOf,
  deliverySceneOf,
  deliveryStartingAt,
  drawDeliveryAir,
} from "../delivery";
import { SCREEN_HEIGHT, SCREEN_WIDTH, createClock, palette, startScreen } from "../engine";
import { drawVillage } from "../houses/draw";
import { describeHouses, villageHouses } from "../houses/village";
import { useHouseInside } from "../interiors/HouseInside";
import { describeVillageNews, statusOfVillage, type VillageNews } from "../state/house-status";
import { watchVillageState } from "../state/watch";
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
  /**
   * Called when the computer is clicked, or pressed with Enter or Space: the
   * desk was opened. The mark over the computer has cleared by the time it is called.
   */
  onComputerPress?: () => void;
  /** Asked once the page is up: the paperwork the owner has already seen at the desk, by key. */
  papersSeenBefore?: () => readonly string[];
};

export function PlazaScreen({ fixedTimeMs, pixelScale, onComputerPress, papersSeenBefore }: PlazaScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const computerHasFocusRef = useRef(false);
  // The picture reads the ref on every frame; the words for a screen reader follow the same news as React state.
  const villageNewsRef = useRef<VillageNews>("loading");
  const [villageNews, setVillageNews] = useState<VillageNews>("loading");
  const [canvasSize, setCanvasSize] = useState<CanvasSize | null>(null);
  // What has been carried to the desk so far: stepped on every frame, and by the press that opens the desk.
  const deliveryRef = useRef(deliveryStartingAt(fixedTimeMs ?? 0));
  const houseInside = useHouseInside(villageHouses, villageNews, canvasRef, {
    awayAgentsOf: (project) => agentsAwayFrom(deliveryRef.current, project),
  });

  useEffect(
    () =>
      watchVillageState((news) => {
        villageNewsRef.current = news;
        setVillageNews(news);
      }),
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clock = createClock({ startAtMs: fixedTimeMs ?? 0, paused: fixedTimeMs !== null });
    deliveryRef.current = deliveryStartingAt(clock.timeMs, papersSeenBefore?.());
    const screen = startScreen(canvas, {
      clock,
      pixelScale: pixelScale ?? undefined,
      draw: (surface, timeMs) => {
        const news = villageNewsRef.current;
        const delivery = (deliveryRef.current = deliveryFollowing(deliveryRef.current, timeMs, news));
        const scene = deliverySceneOf(delivery);
        drawVillage(
          surface,
          plazaStateAt(timeMs, {
            computerHasFocus: computerHasFocusRef.current,
            ownerIsBeingTapped: scene.ownerIsBeingTapped,
          }),
          villageHouses,
          statusOfVillage(news, (project) => agentsAwayFrom(delivery, project)),
          deliveryDrawables(scene),
        );
        drawDeliveryAir(surface, scene);
        Object.assign(canvas.dataset, deliveryMarksOf(delivery));
        houseInside.paint(surface, news, timeMs);
        // Written in the same frame as the picture, so whoever reads the mark
        // (a browser test, say) can trust the picture already shows that news.
        if (typeof news === "string") delete canvas.dataset.villageAsOf;
        else canvas.dataset.villageAsOf = news.asOf;
      },
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
          aria-label={houseInside.words ?? `The plaza at dusk. The human sits at his desk in the middle, typing at his computer. ${describeHouses()} ${describeManagersRound(villageHouses)} ${describeVillageNews(villageNews)}`.trim()}
        />
        <div style={overlayStyle}>
          <button
            type="button"
            aria-label="The computer on the desk"
            hidden={houseInside.openHouse !== null}
            style={computerButtonStyle}
            onClick={() => {
              const delivery = deliveryRef.current;
              deliveryRef.current = deliveryAfter(delivery, { type: "desk opened", atMs: delivery.atMs });
              onComputerPress?.();
            }}
            onFocus={(event) => {
              // A mouse click focuses the button too, but only keyboard focus needs a mark.
              computerHasFocusRef.current = event.currentTarget.matches(":focus-visible");
            }}
            onBlur={() => {
              computerHasFocusRef.current = false;
            }}
          />
          {houseInside.controls}
        </div>
      </div>
    </main>
  );
}
