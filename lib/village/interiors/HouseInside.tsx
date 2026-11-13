"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { SCREEN_HEIGHT, SCREEN_WIDTH, type Surface } from "../engine";
import type { PlacedHouse } from "../houses/place";
import { drawFocusMark } from "../plaza/draw";
import type { Rect } from "../plaza/layout";
import type { VillageNews } from "../state/house-status";
import { drawInside } from "./draw";
import { backButtonBounds } from "./layout";
import { BACK_TO_PLAZA_WORDS, describeInside, insideOf, openHouseWords } from "./state";

function partOfScreen(pixels: number, screenPixels: number): string {
  return `${(pixels / screenPixels) * 100}%`;
}

/** A see-through button lying exactly over one area of the picture. */
function overPicture(area: Rect): CSSProperties {
  return {
    position: "absolute",
    left: partOfScreen(area.x, SCREEN_WIDTH),
    top: partOfScreen(area.y, SCREEN_HEIGHT),
    width: partOfScreen(area.width, SCREEN_WIDTH),
    height: partOfScreen(area.height, SCREEN_HEIGHT),
    padding: 0,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    pointerEvents: "auto",
    // The focus mark is painted in the picture itself, in pixels.
    outline: "none",
  };
}

/** Set on the canvas while a house is open, to that house's name; gone while the plaza shows. */
export const INSIDE_OF_MARK = "insideOf";

export type HouseInsideOptions = {
  /** The names of a project's agents who are out of the house right now. Left out, everyone is in. */
  awayAgentsOf?: (project: string) => readonly string[];
};

export type HouseInside = {
  /** The house whose inside is showing; null while the plaza is. */
  readonly openHouse: PlacedHouse | null;
  /** The inside in plain sentences while one is showing; null while the plaza is. */
  readonly words: string | null;
  /**
   * Call once per frame after the plaza is drawn. It paints the open house's
   * inside over the whole picture, or, on the plaza, the focus mark of the
   * house the keyboard is on. It also marks the canvas with what it painted.
   */
  paint(surface: Surface, news: VillageNews, timeMs: number): void;
  /** The buttons to lay over the picture: a door per house on the plaza, the way back while inside. */
  readonly controls: ReactNode;
  open(house: PlacedHouse): void;
  close(): void;
};

function awayIn(house: PlacedHouse, awayAgentsOf: HouseInsideOptions["awayAgentsOf"]): readonly string[] {
  return house.project === null ? [] : (awayAgentsOf?.(house.project) ?? []);
}

type Pointer = {
  openHouse: PlacedHouse | null;
  houseWithFocus: PlacedHouse | null;
  backHasFocus: boolean;
};

/**
 * Everything a page needs to let its houses be opened: which one is open, the
 * buttons, the painting, Esc, and where the keyboard's focus goes.
 */
export function useHouseInside(
  houses: readonly PlacedHouse[],
  news: VillageNews,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: HouseInsideOptions = {},
): HouseInside {
  const [openHouse, setOpenHouse] = useState<PlacedHouse | null>(null);
  // The picture reads these on every frame, between React's own updates.
  const pointerRef = useRef<Pointer>({ openHouse: null, houseWithFocus: null, backHasFocus: false });
  const awayAgentsOfRef = useRef(options.awayAgentsOf);
  awayAgentsOfRef.current = options.awayAgentsOf;
  const doorsRef = useRef(new Map<number, HTMLButtonElement>());
  const backRef = useRef<HTMLButtonElement>(null);
  const lastOpenedRef = useRef<PlacedHouse | null>(null);

  const open = useCallback((house: PlacedHouse): void => {
    pointerRef.current.openHouse = house;
    pointerRef.current.houseWithFocus = null;
    lastOpenedRef.current = house;
    setOpenHouse(house);
  }, []);

  const close = useCallback((): void => {
    pointerRef.current.openHouse = null;
    pointerRef.current.backHasFocus = false;
    setOpenHouse(null);
  }, []);

  useEffect(() => {
    if (openHouse === null) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openHouse, close]);

  // The buttons of the place just left are gone, and the focus with them: it
  // goes to the way back on the way in, and to the house's own door on the way out.
  useEffect(() => {
    if (openHouse !== null) backRef.current?.focus();
    else if (lastOpenedRef.current) doorsRef.current.get(lastOpenedRef.current.listOrder)?.focus();
  }, [openHouse]);

  const paint = useCallback(
    (surface: Surface, newsNow: VillageNews, timeMs: number): void => {
      const pointer = pointerRef.current;
      if (pointer.openHouse) {
        const inside = insideOf(pointer.openHouse, newsNow, {
          awayAgents: awayIn(pointer.openHouse, awayAgentsOfRef.current),
        });
        drawInside(surface, inside, timeMs, { backHasFocus: pointer.backHasFocus });
      } else if (pointer.houseWithFocus) {
        drawFocusMark(surface, pointer.houseWithFocus.clickBounds);
      }
      // Written in the same frame as the picture, so whoever reads the mark
      // (a browser test, say) can trust the picture already shows that room.
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (pointer.openHouse) canvas.dataset[INSIDE_OF_MARK] = pointer.openHouse.name;
      else delete canvas.dataset[INSIDE_OF_MARK];
    },
    [canvasRef],
  );

  const controls =
    openHouse === null ? (
      houses.map((house) => (
        <button
          key={house.listOrder}
          ref={(button) => {
            if (button) doorsRef.current.set(house.listOrder, button);
            else doorsRef.current.delete(house.listOrder);
          }}
          type="button"
          aria-label={openHouseWords(house)}
          style={overPicture(house.clickBounds)}
          onClick={() => open(house)}
          onFocus={(event) => {
            // A mouse click focuses the button too, but only keyboard focus needs a mark.
            pointerRef.current.houseWithFocus = event.currentTarget.matches(":focus-visible") ? house : null;
          }}
          onBlur={() => {
            if (pointerRef.current.houseWithFocus === house) pointerRef.current.houseWithFocus = null;
          }}
        />
      ))
    ) : (
      <button
        ref={backRef}
        type="button"
        aria-label={BACK_TO_PLAZA_WORDS}
        style={overPicture(backButtonBounds)}
        onClick={close}
        onFocus={(event) => {
          pointerRef.current.backHasFocus = event.currentTarget.matches(":focus-visible");
        }}
        onBlur={() => {
          pointerRef.current.backHasFocus = false;
        }}
      />
    );

  return {
    openHouse,
    words: openHouse
      ? describeInside(insideOf(openHouse, news, { awayAgents: awayIn(openHouse, options.awayAgentsOf) }))
      : null,
    paint,
    controls,
    open,
    close,
  };
}
