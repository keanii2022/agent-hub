"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  CLIPBOARD_KEY,
  CLIPBOARD_NAME,
  CLIPBOARD_ROUTE,
  clipboardBounds,
  clipboardOnTheDesk,
  clipboardReach,
  opensTheClipboard,
} from "../clipboard";
import {
  agentsAwayFrom,
  deliveryAfter,
  deliveryDrawables,
  deliveryFollowing,
  deliveryMarksOf,
  deliverySceneOf,
  deliveryStartingAt,
  drawDeliveryAir,
  type DeliveryState,
} from "../delivery";
import { SCREEN_HEIGHT, SCREEN_WIDTH, createClock, palette, startScreen, type Clock } from "../engine";
import { drawVillage } from "../houses/draw";
import { villageHouses } from "../houses/village";
import { useHouseInside } from "../interiors/HouseInside";
import { statusOfVillage, type VillageNews } from "../state/house-status";
import { watchVillageState } from "../state/watch";
import {
  PAUSED_NOTE,
  PAUSE_KEY,
  nextSpeed,
  pauseButtonWords,
  pausesTheVillage,
  speedButtonWords,
} from "./controls";
import { drawFocusMark } from "./draw";
import type { FixedFrame } from "./frameQuery";
import { desk } from "./layout";
import { plazaStateAt } from "./state";
import { announcementBetween, describeScene, type SceneSummary } from "./summary";

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

const clipboardButtonStyle: CSSProperties = {
  ...computerButtonStyle,
  left: partOfScreen(clipboardReach.x, SCREEN_WIDTH),
  top: partOfScreen(clipboardReach.y, SCREEN_HEIGHT),
  width: partOfScreen(clipboardReach.width, SCREEN_WIDTH),
  height: partOfScreen(clipboardReach.height, SCREEN_HEIGHT),
};

const clipboardHintStyle: CSSProperties = { margin: "0 0 0 20px", color: palette.mist, fontSize: 14 };

const clipboardKeyStyle: CSSProperties = {
  padding: "0 6px",
  border: `1px solid ${palette.stone}`,
  borderRadius: 3,
  color: palette.cream,
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: 12,
};

// Sits in the middle of the plaza's top bar, but comes after the picture in
// the page, so the keyboard reaches the places in the picture first.
const controlsStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  left: "50%",
  transform: "translateX(-50%)",
  height: 40,
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  color: palette.mist,
  whiteSpace: "nowrap",
};

const controlButtonStyle: CSSProperties = {
  minWidth: 64,
  padding: "2px 10px",
  border: `1px solid ${palette.stone}`,
  borderRadius: 3,
  background: palette.ink,
  color: palette.cream,
  font: "inherit",
  cursor: "pointer",
};

const pausedNoteStyle: CSSProperties = { margin: 0, color: palette.cream };

// Read by screen readers, kept off the screen: the picture already shows it.
const offScreenStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

export const SCENE_SUMMARY_ID = "scene-summary";

/** The picture's own short name: where you are. The summary carries the rest. */
function pictureName(insideWords: string | null): string {
  if (insideWords === null) return "The plaza at dusk.";
  return `${insideWords.split(". ")[0].replace(/\.$/, "")}.`;
}

type CanvasSize ={ width: number; height: number };

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
  const clipboardHasFocusRef = useRef(false);
  const router = useRouter();
  const clockRef = useRef<Clock | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLParagraphElement>(null);
  const [paused, setPaused] = useState(fixedTimeMs !== null);
  const [speed, setSpeed] = useState(1);
  const tellTheSceneRef = useRef<(news: VillageNews) => void>(() => {});
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
        // The words follow the news the moment it lands, even while no frame is drawn.
        tellTheSceneRef.current(news);
      }),
    [],
  );

  const togglePause = (): void => {
    const clock = clockRef.current;
    if (!clock) return;
    if (clock.paused) clock.resume();
    else clock.pause();
    setPaused(clock.paused);
  };

  const changeSpeed = (): void => {
    const clock = clockRef.current;
    if (!clock) return;
    clock.setSpeed(nextSpeed(clock.speed));
    setSpeed(clock.speed);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (opensTheClipboard(event)) router.push(CLIPBOARD_ROUTE);
      if (pausesTheVillage(event)) togglePause();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const clock = createClock({ startAtMs: fixedTimeMs ?? 0, paused: fixedTimeMs !== null });
    clockRef.current = clock;
    setPaused(clock.paused);
    setSpeed(clock.speed);
    let summarySaid: SceneSummary | null = null;
    let summaryWords = "";
    // Only when the words change: a screen reader hears news, not every frame.
    const tellTheScene = (news: VillageNews, delivery: DeliveryState): void => {
      const summary = describeScene({
        timeMs: clock.timeMs,
        paused: clock.paused,
        speed: clock.speed,
        news,
        delivery,
        insideWords: houseInside.wordsNow(news),
      });
      const words = summary.sentences.join(" ");
      if (words === summaryWords) return;
      summaryWords = words;
      if (summaryRef.current) summaryRef.current.textContent = words;
      const announcement = announcementBetween(summarySaid, summary);
      if (announcement && announcerRef.current) announcerRef.current.textContent = announcement;
      summarySaid = summary;
    };
    tellTheSceneRef.current = (news) => tellTheScene(news, deliveryRef.current);
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
          [...deliveryDrawables(scene), clipboardOnTheDesk],
        );
        drawDeliveryAir(surface, scene);
        if (clipboardHasFocusRef.current) drawFocusMark(surface, clipboardBounds);
        Object.assign(canvas.dataset, deliveryMarksOf(delivery));
        houseInside.paint(surface, news, timeMs);
        canvas.dataset.villageTimeMs = String(Math.round(timeMs));
        // In the same frame as the picture, so the words never lag behind it.
        tellTheScene(news, delivery);
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
      clockRef.current = null;
      tellTheSceneRef.current = () => {};
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
        <p style={clipboardHintStyle}>
          Press <kbd style={clipboardKeyStyle}>{CLIPBOARD_KEY}</kbd> for the clipboard
        </p>
      </div>
      <div style={roomStyle}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={pictureName(houseInside.words)}
          aria-describedby={SCENE_SUMMARY_ID}
        />
        <div id={SCENE_SUMMARY_ID} ref={summaryRef} style={offScreenStyle} />
        <p ref={announcerRef} role="status" aria-live="polite" style={offScreenStyle} />
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
          <button
            type="button"
            aria-label={CLIPBOARD_NAME}
            aria-keyshortcuts={CLIPBOARD_KEY}
            hidden={houseInside.openHouse !== null}
            style={clipboardButtonStyle}
            onClick={() => router.push(CLIPBOARD_ROUTE)}
            onFocus={(event) => {
              clipboardHasFocusRef.current = event.currentTarget.matches(":focus-visible");
            }}
            onBlur={() => {
              clipboardHasFocusRef.current = false;
            }}
          />
        </div>
      </div>
      <div style={controlsStyle}>
        <button type="button" style={controlButtonStyle} aria-keyshortcuts={PAUSE_KEY} onClick={togglePause}>
          {pauseButtonWords(paused)}
        </button>
        <button type="button" style={controlButtonStyle} onClick={changeSpeed}>
          {speedButtonWords(speed)}
        </button>
        <span>
          or press <kbd style={clipboardKeyStyle}>{PAUSE_KEY}</kbd>
        </span>
        {paused ? <p style={pausedNoteStyle}>{PAUSED_NOTE}</p> : null}
      </div>
    </main>
  );
}
