import { isInAField, type KeyPress } from "../../desk/keys";

/** The one key that pauses the village, and plays it again. */
export const PAUSE_KEY = "P";

/** The speeds the speed button steps through, in order; it goes back to the first after the last. */
export const VILLAGE_SPEEDS = [1, 2, 4] as const;

export type VillageSpeed = (typeof VILLAGE_SPEEDS)[number];

export function nextSpeed(speed: number): VillageSpeed {
  const at = VILLAGE_SPEEDS.indexOf(speed as VillageSpeed);
  return VILLAGE_SPEEDS[(at + 1) % VILLAGE_SPEEDS.length];
}

export function speedInWords(speed: number): string {
  return speed === 1 ? "normal" : `${speed} times`;
}

/** What the speed button says, and so its name. */
export function speedButtonWords(speed: number): string {
  return `Speed: ${speedInWords(speed)}`;
}

/** What the pause button says, and so its name. */
export function pauseButtonWords(paused: boolean): string {
  return paused ? "Play" : "Pause";
}

/** Only the picture pauses, never the hub, so no news is lost while paused. */
export const NEWS_WHILE_PAUSED = "News still comes in, and the manager carries it once you press play.";

/** Shown while paused, short enough for the top bar; the summary says the rest. */
export const PAUSED_NOTE = "Paused. News still comes in.";

export function pausesTheVillage(press: KeyPress): boolean {
  return (
    press.key.toLowerCase() === PAUSE_KEY.toLowerCase() &&
    !press.ctrlKey &&
    !press.metaKey &&
    !press.altKey &&
    !press.repeat &&
    !press.defaultPrevented &&
    !isInAField(press.target)
  );
}
