import { DESK_LOG_ROUTE, type DeskLog } from "./log";

/** How often the desk asks the hub for the log. */
export const DESK_LOG_ASKED_EVERY_MS = 4000;

type Fetcher = (address: string, options: { cache: "no-store" }) => Promise<Response>;

function looksLikeDeskLog(body: unknown): body is DeskLog {
  if (typeof body !== "object" || body === null) return false;
  const { asOf, events, unreadable, cutShort } = body as Partial<DeskLog>;
  return typeof asOf === "string" && Array.isArray(events) && Array.isArray(unreadable) && Array.isArray(cutShort);
}

/** Asks the page's own hub once. Never throws: any trouble at all is "unreachable". */
export async function askForDeskLog(
  fetcher: Fetcher = (address, options) => fetch(address, options),
): Promise<DeskLog | "unreachable"> {
  try {
    const response = await fetcher(DESK_LOG_ROUTE, { cache: "no-store" });
    if (!response.ok) return "unreachable";
    const body: unknown = await response.json();
    return looksLikeDeskLog(body) ? body : "unreachable";
  } catch {
    return "unreachable";
  }
}

export type DeskLogWatch = {
  fetcher?: Fetcher;
  everyMs?: number;
};

/**
 * Asks now, and again a while after each answer, handing every answer to
 * `onNews`. Returns a function that stops it.
 */
export function watchDeskLog(
  onNews: (news: DeskLog | "unreachable") => void,
  { fetcher, everyMs = DESK_LOG_ASKED_EVERY_MS }: DeskLogWatch = {},
): () => void {
  let stopped = false;
  let nextAsk: ReturnType<typeof setTimeout> | undefined;

  async function ask(): Promise<void> {
    const news = await askForDeskLog(fetcher);
    if (stopped) return;
    onNews(news);
    nextAsk = setTimeout(ask, everyMs);
  }
  void ask();

  return () => {
    stopped = true;
    clearTimeout(nextAsk);
  };
}
