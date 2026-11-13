// What the owner has already looked at on the desk, remembered for this
// browser tab only. The plaza reads it when it starts, so the mark over the
// computer doesn't come back for papers the owner has just seen.

const SEEN_AT_THE_DESK = "agent-hub.seen-at-the-desk";

export type TabMemory = Pick<Storage, "getItem" | "setItem">;

function tabMemory(): TabMemory | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // A browser may refuse storage altogether; then nothing is remembered.
    return null;
  }
}

/** Remembers exactly these papers: anything no longer waiting is forgotten with the old list. */
export function rememberSeenAtTheDesk(keys: readonly string[], memory: TabMemory | null = tabMemory()): void {
  try {
    memory?.setItem(SEEN_AT_THE_DESK, JSON.stringify(keys));
  } catch {
    // Full or refused: the mark simply shows again.
  }
}

/** The keys of the papers the owner has seen at the desk in this tab. Empty when nothing is remembered. */
export function papersSeenAtTheDesk(memory: TabMemory | null = tabMemory()): string[] {
  try {
    const remembered: unknown = JSON.parse(memory?.getItem(SEEN_AT_THE_DESK) ?? "[]");
    return Array.isArray(remembered) ? remembered.filter((key): key is string => typeof key === "string") : [];
  } catch {
    return [];
  }
}
