import type { PlacedHouse } from "./place";
import { signStateAt, type SignState } from "./signs";

// What one house is showing at one moment. Drawing reads only this, so a later
// step changes what a house shows by handing over a different status, without
// touching how houses are drawn.

/** The part of a house's state that comes from news about its project, not from the clock. */
export type HouseStatus = {
  /** How many windows glow brightly, counted in the house's own window order: one for each agent working. More than it has lights them all. */
  readonly litWindows: number;
  /** How many of the next windows glow softly: one for each agent who is home but not working. Only as many as are left show. */
  readonly softWindows: number;
  /** Lights out and the sign off: nobody lives here, or there has been no news. */
  readonly isDark: boolean;
  /** Plain words hung under the sign, for example "no news"; null for none. */
  readonly note: string | null;
  /** A short tag riding on the sign, for example "DEMO"; null for none. */
  readonly tag: string | null;
  /**
   * How many of its agents are out walking to the desk. Their windows are off
   * until they are back. Left out while everyone at home is in.
   */
  readonly agentsAway?: number;
};

export type HouseState = HouseStatus & {
  /** The neon sign's lights; null when the house has no sign. */
  readonly sign: SignState | null;
};

export const DEMO_TAG = "DEMO";

/**
 * What a house shows when it is drawn without any news of its project: someone
 * home behind one window, and a tag if its activity is scripted. A house for
 * sale is dark. The home page never shows this: its houses follow the feed
 * (`lib/village/state`).
 */
export function defaultHouseStatus(house: PlacedHouse): HouseStatus {
  if (house.isForSale) return { litWindows: 0, softWindows: 0, isDark: true, note: null, tag: null };
  return {
    litWindows: 1,
    softWindows: 0,
    isDark: false,
    note: null,
    tag: house.data === "demo" ? DEMO_TAG : null,
  };
}

export type StatusOf = (house: PlacedHouse) => HouseStatus;

export function houseStateAt(
  house: PlacedHouse,
  timeMs: number,
  status: HouseStatus = defaultHouseStatus(house),
): HouseState {
  const letters = house.sign ? house.sign.lines.join("").length : 0;
  const litWindows = status.isDark ? 0 : Math.max(0, Math.min(status.litWindows, house.windows.length));
  return {
    ...status,
    litWindows,
    softWindows: status.isDark ? 0 : Math.max(0, Math.min(status.softWindows, house.windows.length - litWindows)),
    sign: house.sign ? signStateAt(timeMs, house.listOrder, letters, !status.isDark) : null,
  };
}
